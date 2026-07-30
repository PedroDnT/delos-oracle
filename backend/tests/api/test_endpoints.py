"""
API tests for the FastAPI application.

The app is driven in-process through httpx's ASGI transport. External
dependencies (BCB API, oracle RPC, scheduler) are stubbed so the suite runs
without network access.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import api
from bcb_client import RateType


@pytest_asyncio.fixture
async def client():
    """
    An HTTP client bound to the ASGI app.

    The lifespan handler is intentionally not run: it starts the scheduler and
    opens the production database, neither of which belongs in a test.
    """
    transport = ASGITransport(app=api.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _bcb_client_stub(rate_data) -> MagicMock:
    """Stub standing in for `async with BCBClient() as bcb`."""
    bcb = MagicMock()
    bcb.__aenter__ = AsyncMock(return_value=bcb)
    bcb.__aexit__ = AsyncMock(return_value=False)
    bcb.health_check = AsyncMock(return_value=True)
    bcb.fetch_latest = AsyncMock(return_value=rate_data)
    return bcb


# =============================================================================
# HEALTH
# =============================================================================

@pytest.mark.asyncio
class TestHealthEndpoint:
    async def test_reports_healthy_when_all_dependencies_are_up(
        self, client, cdi_rate_data
    ):
        updater = MagicMock(check_connection=AsyncMock(return_value=True))
        with patch.object(api, "BCBClient", return_value=_bcb_client_stub(cdi_rate_data)), \
             patch.object(api, "OracleUpdater", return_value=updater), \
             patch.object(api.scheduler, "is_running", True):
            response = await client.get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "healthy"
        assert body["bcb_api"] is True
        assert body["oracle_connection"] is True

    async def test_reports_degraded_when_oracle_is_unreachable(
        self, client, cdi_rate_data
    ):
        updater = MagicMock(check_connection=AsyncMock(side_effect=RuntimeError("no rpc")))
        with patch.object(api, "BCBClient", return_value=_bcb_client_stub(cdi_rate_data)), \
             patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "degraded"

    async def test_reports_unhealthy_when_everything_is_down(self, client):
        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.health_check = AsyncMock(return_value=False)

        updater = MagicMock(check_connection=AsyncMock(return_value=False))
        with patch.object(api, "BCBClient", return_value=bcb), \
             patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "unhealthy"
        assert body["bcb_api"] is False
        assert body["oracle_connection"] is False

    async def test_response_matches_documented_schema(self, client, cdi_rate_data):
        updater = MagicMock(check_connection=AsyncMock(return_value=True))
        with patch.object(api, "BCBClient", return_value=_bcb_client_stub(cdi_rate_data)), \
             patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/health")

        body = response.json()
        assert set(body) >= {
            "status",
            "bcb_api",
            "oracle_connection",
            "scheduler_running",
            "version",
        }


# =============================================================================
# RATES
# =============================================================================

@pytest.mark.asyncio
class TestRateEndpoints:
    async def test_rejects_unknown_rate_type(self, client):
        response = await client.get("/rates/NOTAREALRATE")
        assert response.status_code == 400
        assert "Invalid rate type" in response.json()["detail"]

    async def test_returns_rate_from_the_oracle(self, client):
        updater = MagicMock(
            get_current_rate=AsyncMock(
                return_value={
                    "answer": 1_090_000_000,
                    "value_percent": 10.90,
                    "real_world_date": 20241116,
                    "timestamp": int(datetime.now().timestamp()),
                }
            )
        )
        with patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/rates/cdi")

        assert response.status_code == 200
        body = response.json()
        assert body["rate_type"] == "CDI"
        assert body["answer"] == 1_090_000_000
        assert body["source"] == "BCB-12"
        assert body["is_stale"] is False

    async def test_missing_rate_returns_404(self, client):
        updater = MagicMock(get_current_rate=AsyncMock(return_value=None))
        with patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/rates/IPCA")

        assert response.status_code == 404

    async def test_marks_rate_as_stale_past_its_heartbeat(self, client):
        stale_ts = int(datetime.now().timestamp()) - (10 * 24 * 3600)
        updater = MagicMock(
            get_current_rate=AsyncMock(
                return_value={
                    "answer": 1_090_000_000,
                    "value_percent": 10.90,
                    "real_world_date": 20241116,
                    "timestamp": stale_ts,
                }
            )
        )
        with patch.object(api, "OracleUpdater", return_value=updater):
            response = await client.get("/rates/CDI")

        assert response.json()["is_stale"] is True


# =============================================================================
# DIRECT BCB PASSTHROUGH
# =============================================================================

@pytest.mark.asyncio
class TestBcbEndpoint:
    async def test_returns_latest_bcb_value(self, client, cdi_rate_data):
        with patch.object(api, "BCBClient", return_value=_bcb_client_stub(cdi_rate_data)):
            response = await client.get("/bcb/latest/CDI")

        assert response.status_code == 200
        body = response.json()
        assert body["rate_type"] == "CDI"
        assert body["answer"] == 1_090_000_000
        assert body["source"] == "BCB-12"

    async def test_rejects_unknown_rate_type(self, client):
        response = await client.get("/bcb/latest/XYZ")
        assert response.status_code == 400

    async def test_bcb_failure_maps_to_502(self, client):
        from bcb_client import BCBAPIError

        bcb = MagicMock()
        bcb.__aenter__ = AsyncMock(return_value=bcb)
        bcb.__aexit__ = AsyncMock(return_value=False)
        bcb.fetch_latest = AsyncMock(side_effect=BCBAPIError("upstream down"))

        with patch.object(api, "BCBClient", return_value=bcb):
            response = await client.get("/bcb/latest/CDI")

        assert response.status_code == 502


# =============================================================================
# STATS & SCHEMA
# =============================================================================

@pytest.mark.asyncio
class TestStatsAndSchema:
    async def test_stats_endpoint(self, client):
        stats = {
            "rates_count": 3,
            "oracle_updates_count": 2,
            "anomalies_count": 1,
            "scheduler_runs_count": 4,
            "database_path": "data/rates.db",
        }
        with patch.object(api.data_store, "get_stats", AsyncMock(return_value=stats)):
            response = await client.get("/stats")

        assert response.status_code == 200
        assert response.json() == stats

    async def test_openapi_schema_is_served(self, client):
        response = await client.get("/openapi.json")
        assert response.status_code == 200

        paths = response.json()["paths"]
        for path in ["/health", "/rates", "/rates/{rate_type}", "/stats"]:
            assert path in paths

    async def test_every_rate_type_is_routable(self, client):
        updater = MagicMock(get_current_rate=AsyncMock(return_value=None))
        with patch.object(api, "OracleUpdater", return_value=updater):
            for rate_type in RateType:
                response = await client.get(f"/rates/{rate_type.value}")
                # 404 (no data) is fine; 400 would mean the type was rejected.
                assert response.status_code == 404
