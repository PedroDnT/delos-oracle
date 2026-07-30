"""
Unit tests for the BCB API client.

These exercise parsing, Chainlink scaling, circuit breakers and retry
behaviour without touching the network.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from bcb_client import (
    CHAINLINK_DECIMALS,
    CHAINLINK_PRECISION,
    RATE_CONFIGS,
    BCBAPIError,
    BCBNoDataError,
    BCBParseError,
    BCBValidationError,
    RateType,
)


# =============================================================================
# CONFIGURATION
# =============================================================================

class TestRateConfigs:
    def test_every_rate_type_is_configured(self):
        assert set(RATE_CONFIGS) == set(RateType)

    @pytest.mark.parametrize(
        "rate_type,series",
        [
            (RateType.IPCA, 433),
            (RateType.CDI, 12),
            (RateType.SELIC, 432),
            (RateType.PTAX, 1),
            (RateType.IGPM, 189),
            (RateType.TR, 226),
        ],
    )
    def test_bcb_series_codes(self, rate_type, series):
        assert RATE_CONFIGS[rate_type].bcb_series == series

    def test_all_rates_use_chainlink_decimals(self):
        assert all(c.decimals == CHAINLINK_DECIMALS for c in RATE_CONFIGS.values())

    def test_bounds_are_ordered(self):
        for rate_type, config in RATE_CONFIGS.items():
            assert config.min_value < config.max_value, rate_type


# =============================================================================
# RESPONSE STRUCTURE VALIDATION
# =============================================================================

class TestValidateResponseStructure:
    def test_accepts_bcb_shaped_payload(self, bcb_client, bcb_payload):
        assert bcb_client.validate_response_structure(bcb_payload) is True

    def test_accepts_numeric_valor(self, bcb_client):
        payload = [{"data": "16/11/2024", "valor": 10.9}]
        assert bcb_client.validate_response_structure(payload) is True

    def test_accepts_empty_list(self, bcb_client):
        assert bcb_client.validate_response_structure([]) is True

    @pytest.mark.parametrize(
        "payload",
        [
            {"valor": [{"valor": "4.50"}]},          # dict instead of list
            "not-json",                               # bare string
            None,                                     # null body
            [["16/11/2024", "10.90"]],                # list of lists
            [{"valor": "10.90"}],                     # missing "data"
            [{"data": "16/11/2024"}],                 # missing "valor"
            [{"data": 20241116, "valor": "10.90"}],   # "data" not a string
            [{"data": "16/11/2024", "valor": None}],  # "valor" wrong type
        ],
    )
    def test_rejects_invalid_payloads(self, bcb_client, payload):
        assert bcb_client.validate_response_structure(payload) is False


# =============================================================================
# URL BUILDING
# =============================================================================

class TestBuildUrl:
    def test_latest_n_records(self, bcb_client):
        url = bcb_client._build_url(RateType.CDI, count=1)
        assert url == (
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
            "/ultimos/1?formato=json"
        )

    def test_date_range(self, bcb_client):
        url = bcb_client._build_url(
            RateType.IPCA, start_date="01/01/2024", end_date="31/01/2024"
        )
        assert "bcdata.sgs.433" in url
        assert "dataInicial=01/01/2024" in url
        assert "dataFinal=31/01/2024" in url

    def test_defaults_to_full_series(self, bcb_client):
        url = bcb_client._build_url(RateType.SELIC)
        assert url.endswith("bcdata.sgs.432/dados?formato=json")


# =============================================================================
# PARSING & SCALING
# =============================================================================

class TestParsing:
    def test_parse_bcb_date(self, bcb_client):
        date_int, dt = bcb_client._parse_bcb_date("16/11/2024")
        assert date_int == 20241116
        assert dt == datetime(2024, 11, 16)

    @pytest.mark.parametrize("bad_date", ["2024-11-16", "31/02/2024", "", "16/11"])
    def test_parse_bcb_date_rejects_bad_input(self, bcb_client, bad_date):
        with pytest.raises(BCBParseError):
            bcb_client._parse_bcb_date(bad_date)

    @pytest.mark.parametrize(
        "value,expected",
        [
            (4.50, 450_000_000),
            (10.90, 1_090_000_000),
            (5.1234, 512_340_000),
            (0.0, 0),
            (-2.5, -250_000_000),
        ],
    )
    def test_scale_to_chainlink(self, bcb_client, value, expected):
        assert bcb_client._scale_to_chainlink(value) == expected

    def test_chainlink_precision_matches_decimals(self):
        assert CHAINLINK_PRECISION == 10 ** CHAINLINK_DECIMALS


class TestProcessResponse:
    def test_produces_chainlink_scaled_rate_data(self, bcb_client, bcb_payload):
        results = bcb_client._process_response(bcb_payload, RateType.CDI)

        assert len(results) == 2
        latest = results[0]
        assert latest.rate_type is RateType.CDI
        assert latest.answer == 1_090_000_000
        assert latest.raw_value == pytest.approx(10.90)
        assert latest.decimals == CHAINLINK_DECIMALS
        assert latest.real_world_date == 20241116
        assert latest.source == "BCB-12"

    def test_sorts_most_recent_first(self, bcb_client, bcb_payload):
        results = bcb_client._process_response(bcb_payload, RateType.CDI)
        dates = [r.real_world_date for r in results]
        assert dates == sorted(dates, reverse=True)

    def test_accepts_comma_decimal_separator(self, bcb_client):
        results = bcb_client._process_response(
            [{"data": "16/11/2024", "valor": "10,90"}], RateType.CDI
        )
        assert results[0].answer == 1_090_000_000

    def test_skips_malformed_records(self, bcb_client):
        payload = [
            {"data": "16/11/2024", "valor": "10.90"},
            {"data": "not-a-date", "valor": "11.00"},
            {"data": "15/11/2024", "valor": "not-a-number"},
        ]
        results = bcb_client._process_response(payload, RateType.CDI)
        assert len(results) == 1
        assert results[0].real_world_date == 20241116


# =============================================================================
# CIRCUIT BREAKERS
# =============================================================================

class TestCircuitBreakers:
    def test_rejects_value_above_maximum(self, bcb_client):
        # CDI max is 50%
        with pytest.raises(BCBValidationError, match="above maximum"):
            bcb_client._process_response(
                [{"data": "16/11/2024", "valor": "60.00"}], RateType.CDI
            )

    def test_rejects_value_below_minimum(self, bcb_client):
        # PTAX min is 1.0 BRL/USD
        with pytest.raises(BCBValidationError, match="below minimum"):
            bcb_client._process_response(
                [{"data": "16/11/2024", "valor": "0.50"}], RateType.PTAX
            )

    def test_accepts_values_at_the_bounds(self, bcb_client):
        config = RATE_CONFIGS[RateType.CDI]
        at_max = config.max_value / CHAINLINK_PRECISION
        results = bcb_client._process_response(
            [{"data": "16/11/2024", "valor": str(at_max)}], RateType.CDI
        )
        assert results[0].answer == config.max_value

    def test_validation_can_be_disabled(self, bcb_client_no_validation):
        results = bcb_client_no_validation._process_response(
            [{"data": "16/11/2024", "valor": "60.00"}], RateType.CDI
        )
        assert results[0].answer == 6_000_000_000


# =============================================================================
# RATE DATA HELPERS
# =============================================================================

class TestRateData:
    def test_answer_as_percentage(self, cdi_rate_data):
        assert cdi_rate_data.answer_as_percentage == pytest.approx(10.90)

    def test_answer_as_basis_points(self, cdi_rate_data):
        assert cdi_rate_data.answer_as_basis_points == 1090

    def test_to_oracle_update_params(self, cdi_rate_data):
        params = cdi_rate_data.to_oracle_update_params()
        assert params == {
            "rateType": "CDI",
            "answer": 1_090_000_000,
            "realWorldDate": 20241116,
            "source": "BCB-12",
        }

    def test_to_chainlink_format(self, cdi_rate_data):
        payload = cdi_rate_data.to_chainlink_format()
        assert payload["answer"] == 1_090_000_000
        assert payload["startedAt"] == payload["updatedAt"]


# =============================================================================
# FETCHING
# =============================================================================

@pytest.mark.asyncio
class TestFetching:
    async def test_fetch_latest_returns_most_recent(self, bcb_client, bcb_payload):
        with patch.object(bcb_client, "_request", AsyncMock(return_value=bcb_payload)):
            result = await bcb_client.fetch_latest(RateType.CDI)

        assert result.real_world_date == 20241116
        assert result.answer == 1_090_000_000

    async def test_fetch_latest_raises_when_no_usable_data(self, bcb_client):
        with patch.object(bcb_client, "_request", AsyncMock(return_value=[])):
            with pytest.raises(BCBNoDataError):
                await bcb_client.fetch_latest(RateType.CDI)

    async def test_fetch_history_returns_all_records(self, bcb_client, bcb_payload):
        with patch.object(bcb_client, "_request", AsyncMock(return_value=bcb_payload)):
            results = await bcb_client.fetch_history(RateType.CDI, count=2)

        assert len(results) == 2

    async def test_fetch_date_range_formats_dates(self, bcb_client, bcb_payload):
        request = AsyncMock(return_value=bcb_payload)
        with patch.object(bcb_client, "_request", request):
            await bcb_client.fetch_date_range(
                RateType.CDI, datetime(2024, 1, 1), datetime(2024, 1, 31)
            )

        url = request.await_args.args[0]
        assert "dataInicial=01/01/2024" in url
        assert "dataFinal=31/01/2024" in url

    async def test_fetch_all_latest_skips_failures(self, bcb_client, bcb_payload):
        async def fetch(rate_type):
            if rate_type is RateType.TR:
                raise BCBAPIError("boom")
            return bcb_client._process_response(bcb_payload, rate_type)[0]

        with patch.object(bcb_client, "fetch_latest", AsyncMock(side_effect=fetch)):
            results = await bcb_client.fetch_all_latest_parallel()

        assert RateType.TR not in results
        assert RateType.CDI in results


@pytest.mark.asyncio
class TestFetchWithRetry:
    async def test_returns_first_successful_attempt(self, bcb_client, cdi_rate_data):
        fetch_latest = AsyncMock(return_value=cdi_rate_data)
        with patch.object(bcb_client, "fetch_latest", fetch_latest):
            result = await bcb_client.fetch_with_retry(RateType.CDI)

        assert result is cdi_rate_data
        assert fetch_latest.await_count == 1

    async def test_retries_transient_errors_then_succeeds(
        self, bcb_client, cdi_rate_data
    ):
        fetch_latest = AsyncMock(
            side_effect=[BCBAPIError("503"), BCBAPIError("503"), cdi_rate_data]
        )
        with patch.object(bcb_client, "fetch_latest", fetch_latest), patch(
            "bcb_client.asyncio.sleep", AsyncMock()
        ):
            result = await bcb_client.fetch_with_retry(RateType.CDI, max_retries=3)

        assert result is cdi_rate_data
        assert fetch_latest.await_count == 3

    async def test_raises_after_retries_are_exhausted(self, bcb_client):
        fetch_latest = AsyncMock(side_effect=BCBAPIError("permanent"))
        with patch.object(bcb_client, "fetch_latest", fetch_latest), patch(
            "bcb_client.asyncio.sleep", AsyncMock()
        ):
            with pytest.raises(BCBAPIError, match="permanent"):
                await bcb_client.fetch_with_retry(RateType.CDI, max_retries=2)

        # initial attempt + 2 retries
        assert fetch_latest.await_count == 3

    async def test_backoff_grows_exponentially_and_is_capped(
        self, bcb_client, cdi_rate_data
    ):
        fetch_latest = AsyncMock(
            side_effect=[BCBAPIError("1"), BCBAPIError("2"), BCBAPIError("3"), cdi_rate_data]
        )
        sleep = AsyncMock()
        with patch.object(bcb_client, "fetch_latest", fetch_latest), patch(
            "bcb_client.asyncio.sleep", sleep
        ):
            await bcb_client.fetch_with_retry(
                RateType.CDI, max_retries=3, base_delay=1.0, max_delay=3.0
            )

        delays = [call.args[0] for call in sleep.await_args_list]
        assert delays == [1.0, 2.0, 3.0]


@pytest.mark.asyncio
class TestHealthCheck:
    async def test_healthy_when_fetch_succeeds(self, bcb_client, cdi_rate_data):
        with patch.object(bcb_client, "fetch_latest", AsyncMock(return_value=cdi_rate_data)):
            assert await bcb_client.health_check() is True

    async def test_unhealthy_when_fetch_fails(self, bcb_client):
        with patch.object(bcb_client, "fetch_latest", AsyncMock(side_effect=BCBAPIError("down"))):
            assert await bcb_client.health_check() is False
