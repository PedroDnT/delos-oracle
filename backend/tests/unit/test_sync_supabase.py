"""Unit tests for the Supabase sync script (no network)."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

import sync_supabase
from bcb_client import RATE_CONFIGS, RateType


class TestNormalizeSupabaseUrl:
    def test_strips_whitespace_quotes_and_trailing_slash(self):
        assert (
            sync_supabase.normalize_supabase_url('  "https://proj.supabase.co/" \n')
            == "https://proj.supabase.co"
        )

    def test_expands_a_bare_project_ref(self):
        assert (
            sync_supabase.normalize_supabase_url("abcdefghijklmnopqr")
            == "https://abcdefghijklmnopqr.supabase.co"
        )

    def test_empty_stays_empty(self):
        assert sync_supabase.normalize_supabase_url("   ") == ""


class TestRateToRow:
    def test_maps_every_column_the_schema_expects(self, cdi_rate_data):
        row = sync_supabase.rate_to_row(cdi_rate_data)
        assert row == {
            "rate_type": "CDI",
            "answer": 1_090_000_000,
            "raw_value": 10.90,
            "real_world_date": 20241116,
            "bcb_timestamp": "2024-11-16T00:00:00",
            "source": "BCB-12",
            "heartbeat_seconds": RATE_CONFIGS[RateType.CDI].heartbeat_seconds,
        }


@pytest.mark.asyncio
class TestUpsert:
    async def test_posts_rows_with_conflict_merge(self, cdi_rate_data):
        rows = [sync_supabase.rate_to_row(cdi_rate_data)]
        response = MagicMock(raise_for_status=MagicMock())
        post = AsyncMock(return_value=response)

        client = MagicMock(post=post)
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)

        with patch.object(sync_supabase.httpx, "AsyncClient", return_value=client):
            await sync_supabase.upsert_rates(
                rows, "https://proj.supabase.co/", "service-key"
            )

        call = post.await_args
        assert call.args[0] == "https://proj.supabase.co/rest/v1/rates"
        assert call.kwargs["params"] == {"on_conflict": "rate_type,real_world_date"}
        assert call.kwargs["json"] == rows
        assert "merge-duplicates" in call.kwargs["headers"]["Prefer"]
        assert call.kwargs["headers"]["apikey"] == "service-key"

    async def test_retries_connect_errors_then_reraises(self, cdi_rate_data):
        rows = [sync_supabase.rate_to_row(cdi_rate_data)]
        post = AsyncMock(side_effect=httpx.ConnectError("Name or service not known"))
        client = MagicMock(post=post)
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)

        with patch.object(
            sync_supabase.httpx, "AsyncClient", return_value=client
        ), patch("sync_supabase.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(httpx.ConnectError):
                await sync_supabase.upsert_rates(
                    rows, "https://proj.supabase.co/", "service-key"
                )

        assert post.await_count == sync_supabase.UPSERT_ATTEMPTS


@pytest.mark.asyncio
class TestSync:
    async def test_fails_fast_without_credentials(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        monkeypatch.delenv("DRY_RUN", raising=False)
        assert await sync_supabase.sync() == 2

    async def test_dry_run_fetches_but_never_writes(self, monkeypatch, cdi_rate_data):
        monkeypatch.setenv("DRY_RUN", "1")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )
        upsert = AsyncMock()

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "upsert_rates", upsert
        ):
            assert await sync_supabase.sync() == 0

        upsert.assert_not_awaited()

    async def test_writes_fetched_rates(self, monkeypatch, cdi_rate_data):
        monkeypatch.delenv("DRY_RUN", raising=False)
        monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )
        upsert = AsyncMock()

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "supabase_host_resolves", return_value=True
        ), patch.object(sync_supabase, "upsert_rates", upsert):
            assert await sync_supabase.sync() == 0

        rows = upsert.await_args.args[0]
        assert len(rows) == 1
        assert rows[0]["rate_type"] == "CDI"

    async def test_fails_when_nothing_could_be_fetched(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
        monkeypatch.delenv("DRY_RUN", raising=False)

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(return_value={})

        with patch.object(sync_supabase, "BCBClient", return_value=bcb):
            assert await sync_supabase.sync() == 1

    async def test_connect_error_is_soft_when_unreachable_ok(
        self, monkeypatch, cdi_rate_data
    ):
        monkeypatch.delenv("DRY_RUN", raising=False)
        monkeypatch.setenv("SUPABASE_URL", "https://gone.supabase.co\n")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
        monkeypatch.setenv("SUPABASE_UNREACHABLE_OK", "1")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "supabase_host_resolves", return_value=True
        ), patch.object(
            sync_supabase,
            "upsert_rates",
            AsyncMock(side_effect=httpx.ConnectError("Name or service not known")),
        ):
            assert await sync_supabase.sync() == 0

    async def test_nxdomain_is_soft_when_unreachable_ok(
        self, monkeypatch, cdi_rate_data
    ):
        monkeypatch.delenv("DRY_RUN", raising=False)
        monkeypatch.setenv("SUPABASE_URL", "https://gone.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
        monkeypatch.setenv("SUPABASE_UNREACHABLE_OK", "1")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )
        upsert = AsyncMock()

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "supabase_host_resolves", return_value=False
        ), patch.object(sync_supabase, "upsert_rates", upsert):
            assert await sync_supabase.sync() == 0

        upsert.assert_not_awaited()

    async def test_connect_error_fails_without_unreachable_ok(
        self, monkeypatch, cdi_rate_data
    ):
        monkeypatch.delenv("DRY_RUN", raising=False)
        monkeypatch.delenv("SUPABASE_UNREACHABLE_OK", raising=False)
        monkeypatch.setenv("SUPABASE_URL", "https://gone.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "supabase_host_resolves", return_value=True
        ), patch.object(
            sync_supabase,
            "upsert_rates",
            AsyncMock(side_effect=httpx.ConnectError("Name or service not known")),
        ):
            assert await sync_supabase.sync() == 1

    async def test_strips_secret_newlines_before_upsert(
        self, monkeypatch, cdi_rate_data
    ):
        monkeypatch.delenv("DRY_RUN", raising=False)
        monkeypatch.setenv("SUPABASE_URL", ' "https://proj.supabase.co/" \n')
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", " service-key \n")

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_all_latest_parallel = AsyncMock(
            return_value={RateType.CDI: cdi_rate_data}
        )
        upsert = AsyncMock()

        with patch.object(sync_supabase, "BCBClient", return_value=bcb), patch.object(
            sync_supabase, "supabase_host_resolves", return_value=True
        ), patch.object(sync_supabase, "upsert_rates", upsert):
            assert await sync_supabase.sync() == 0

        assert upsert.await_args.args[1] == "https://proj.supabase.co"
        assert upsert.await_args.args[2] == "service-key"
