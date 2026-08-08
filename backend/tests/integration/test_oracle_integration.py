"""
Integration tests wiring the BCB client, the SQLite data store and the
anomaly detector together.

Everything runs offline: the BCB API is stubbed at the HTTP layer and the
data store writes to a temporary SQLite file.
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bcb_client import RATE_CONFIGS, BCBAPIError, BCBClient, BCBParseError, RateType
from services.anomaly_detector import AnomalyDetector
from services.data_store import DataStore


@pytest.fixture
def data_store(tmp_path) -> DataStore:
    return DataStore(db_path=str(tmp_path / "rates.db"))


def _http_response(payload, status_code: int = 200) -> MagicMock:
    """Build a stub httpx.Response good enough for BCBClient._request."""
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload
    response.raise_for_status = MagicMock()
    return response


# =============================================================================
# DATA STORE
# =============================================================================

@pytest.mark.asyncio
class TestDataStore:
    async def test_initialize_creates_schema(self, data_store):
        await data_store.initialize()
        stats = await data_store.get_stats()
        assert stats["rates_count"] == 0
        assert stats["anomalies_count"] == 0

    async def test_store_and_read_back_a_rate(self, data_store, cdi_rate_data):
        await data_store.initialize()
        row_id = await data_store.store_rate(cdi_rate_data)
        assert row_id > 0

        latest = await data_store.get_latest_rate("CDI")
        assert latest is not None
        assert latest.answer == cdi_rate_data.answer
        assert latest.real_world_date == cdi_rate_data.real_world_date
        assert latest.source == "BCB-12"

    async def test_history_is_ordered_most_recent_first(self, data_store, cdi_rate_data):
        await data_store.initialize()

        for date_int, answer in [
            (20241114, 1_080_000_000),
            (20241116, 1_090_000_000),
            (20241115, 1_085_000_000),
        ]:
            rate = replace_rate(cdi_rate_data, date_int, answer)
            await data_store.store_rate(rate)

        history = await data_store.get_rate_history("CDI", days=365)
        assert [r.real_world_date for r in history] == [20241116, 20241115, 20241114]

    async def test_same_date_replaces_instead_of_duplicating(
        self, data_store, cdi_rate_data
    ):
        await data_store.initialize()
        await data_store.store_rate(cdi_rate_data)
        await data_store.store_rate(replace_rate(cdi_rate_data, 20241116, 1_100_000_000))

        history = await data_store.get_rate_history("CDI", days=365)
        assert len(history) == 1
        assert history[0].answer == 1_100_000_000

    async def test_rates_are_isolated_per_type(self, data_store, cdi_rate_data):
        await data_store.initialize()
        await data_store.store_rate(cdi_rate_data)

        assert await data_store.get_latest_rate("IPCA") is None
        assert await data_store.get_latest_rate("CDI") is not None

    async def test_anomalies_are_logged_and_retrievable(self, data_store):
        await data_store.initialize()
        await data_store.log_anomaly(
            rate_type="CDI",
            anomaly_type="value_spike",
            current_value=25.0,
            expected_low=10.0,
            expected_high=12.0,
            std_devs=7.5,
            message="CDI jumped unexpectedly",
        )

        anomalies = await data_store.get_anomalies(rate_type="CDI")
        assert len(anomalies) == 1
        assert anomalies[0].anomaly_type == "value_spike"

        stats = await data_store.get_stats()
        assert stats["anomalies_count"] == 1


# =============================================================================
# ANOMALY DETECTION
# =============================================================================

class TestAnomalyDetector:
    def test_flags_value_far_from_the_mean(self):
        detector = AnomalyDetector(std_threshold=3.0)
        result = detector.detect_value_anomaly(
            current_value=25.0,
            historical_values=[10.0, 10.2, 10.1, 10.3, 10.0, 10.1],
        )
        assert result.is_anomaly is True
        assert result.anomaly_type == "value_spike"
        assert result.severity in {"medium", "high", "critical"}

    def test_accepts_value_inside_the_expected_band(self):
        detector = AnomalyDetector(std_threshold=3.0)
        result = detector.detect_value_anomaly(
            current_value=10.2,
            historical_values=[10.0, 10.2, 10.1, 10.3, 10.0, 10.1],
        )
        assert result.is_anomaly is False
        assert result.severity == "normal"

    def test_short_history_is_not_flagged(self):
        detector = AnomalyDetector(min_history_size=5)
        result = detector.detect_value_anomaly(50.0, [10.0, 10.1])
        assert result.is_anomaly is False

    def test_stale_data_detected_beyond_heartbeat(self):
        detector = AnomalyDetector()
        heartbeat = RATE_CONFIGS[RateType.CDI].heartbeat_seconds
        result = detector.detect_stale_data(
            last_update=datetime.now() - timedelta(seconds=heartbeat * 2),
            heartbeat_seconds=heartbeat,
        )
        assert result.is_anomaly is True
        assert result.anomaly_type == "stale_data"

    def test_fresh_data_is_not_stale(self):
        detector = AnomalyDetector()
        result = detector.detect_stale_data(
            last_update=datetime.now() - timedelta(minutes=5),
            heartbeat_seconds=RATE_CONFIGS[RateType.CDI].heartbeat_seconds,
        )
        assert result.is_anomaly is False

    def test_velocity_anomaly(self):
        detector = AnomalyDetector(velocity_threshold=0.5)
        assert detector.detect_velocity_anomaly(20.0, 10.0).is_anomaly is True
        assert detector.detect_velocity_anomaly(10.5, 10.0).is_anomaly is False

    def test_run_all_checks_reports_each_failing_check(self):
        detector = AnomalyDetector(std_threshold=3.0, velocity_threshold=0.5)
        anomalies = detector.run_all_checks(
            current_value=25.0,
            historical_values=[10.0, 10.2, 10.1, 10.3, 10.0, 10.1],
            last_update=datetime.now() - timedelta(days=30),
            heartbeat_seconds=RATE_CONFIGS[RateType.CDI].heartbeat_seconds,
            previous_value=10.1,
        )
        assert {a.anomaly_type for a in anomalies} == {
            "value_spike",
            "stale_data",
            "velocity",
        }

    def test_expected_range_brackets_the_mean(self):
        detector = AnomalyDetector(std_threshold=3.0)
        low, high = detector.get_expected_range([10.0, 10.2, 10.1, 10.3, 10.0, 10.1])
        assert low < 10.1 < high


# =============================================================================
# BCB -> DATA STORE FLOW
# =============================================================================

@pytest.mark.asyncio
class TestBcbToDataStoreFlow:
    async def test_fetched_rate_is_persisted(self, data_store, bcb_payload):
        await data_store.initialize()

        client = BCBClient()
        with patch.object(
            client, "_get_client", return_value=MagicMock(get=AsyncMock(return_value=_http_response(bcb_payload)))
        ):
            rate = await client.fetch_latest(RateType.CDI)

        await data_store.store_rate(rate)

        stored = await data_store.get_latest_rate("CDI")
        assert stored.answer == rate.answer == 1_090_000_000
        assert stored.real_world_date == 20241116

    async def test_anomaly_detected_from_stored_history(self, data_store, cdi_rate_data):
        await data_store.initialize()

        base_date = 20241101
        for offset in range(6):
            await data_store.store_rate(
                replace_rate(cdi_rate_data, base_date + offset, 1_090_000_000)
            )

        history = await data_store.get_rate_history("CDI", days=365)
        detector = AnomalyDetector(std_threshold=3.0, min_history_size=5)

        # A flat history has zero variance; a large jump must still be caught.
        result = detector.detect_velocity_anomaly(
            current_value=30.0, previous_value=history[0].raw_value
        )
        assert result.is_anomaly is True

    async def test_http_error_surfaces_as_client_error(self, data_store):
        import httpx

        client = BCBClient()
        failing = MagicMock(get=AsyncMock(side_effect=httpx.ConnectError("no route")))
        with patch.object(client, "_get_client", return_value=failing):
            with pytest.raises(BCBAPIError):
                await client.fetch_latest(RateType.CDI)

    async def test_unexpected_payload_shape_is_rejected(self):
        client = BCBClient()
        bad = MagicMock(
            get=AsyncMock(return_value=_http_response({"valor": [{"valor": "4.50"}]}))
        )
        with patch.object(client, "_get_client", return_value=bad):
            with pytest.raises(BCBParseError):
                await client.fetch_latest(RateType.CDI)


# =============================================================================
# HELPERS
# =============================================================================

def replace_rate(rate, real_world_date: int, answer: int):
    """Copy a RateData with a new date/answer (dataclasses.replace equivalent)."""
    import dataclasses

    return dataclasses.replace(
        rate,
        real_world_date=real_world_date,
        answer=answer,
        raw_value=answer / 10**8,
    )
