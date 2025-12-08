"""
DELOS REST API
FastAPI endpoints for Brazilian macro rate queries.

Endpoints:
- GET  /health              - Health check
- GET  /rates               - Get all current rates from oracle
- GET  /rates/{rate_type}   - Get specific rate
- GET  /rates/{rate_type}/history - Get rate history from SQLite
- POST /sync                - Manual sync trigger
- GET  /scheduler/jobs      - View scheduled jobs
- GET  /scheduler/runs      - View recent job runs
- GET  /bcb/latest/{rate_type} - Direct BCB fetch (bypass oracle)
- GET  /anomalies           - View detected anomalies
- GET  /stats               - Database statistics

Usage:
    python api.py                    # Run with uvicorn
    uvicorn api:app --reload         # Development mode
    uvicorn api:app --host 0.0.0.0   # Production mode
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from bcb_client import BCBClient, RateType, RATE_CONFIGS, BCBClientError
from oracle_updater import OracleUpdater
from services.data_store import DataStore
from scheduler import RateScheduler
from config import Settings
from logging_config import setup_logging, get_logger

logger = get_logger(__name__)


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class RateResponse(BaseModel):
    """Response model for rate data."""
    rate_type: str
    answer: int = Field(description="Value scaled by 10^8")
    raw_value: float = Field(description="Original BCB value (percentage or rate)")
    real_world_date: int = Field(description="Date in YYYYMMDD format")
    timestamp: int = Field(description="Block timestamp (Unix seconds)")
    source: str
    is_stale: bool = False
    heartbeat_seconds: Optional[int] = None


class RateHistoryResponse(BaseModel):
    """Response model for rate history."""
    rate_type: str
    history: List[RateResponse]
    count: int


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str  # "healthy", "degraded", "unhealthy"
    bcb_api: bool
    oracle_connection: bool
    scheduler_running: bool
    last_update: Optional[str] = None
    version: str = "1.0.0"


class SyncResponse(BaseModel):
    """Response model for sync operation."""
    success: bool
    rates_updated: int
    rates_skipped: int
    rates_failed: int = 0
    anomalies_detected: int = 0
    tx_hash: Optional[str] = None
    error: Optional[str] = None


class JobResponse(BaseModel):
    """Response model for scheduler job."""
    id: str
    name: str
    next_run: Optional[str]
    trigger: str


class SchedulerRunResponse(BaseModel):
    """Response model for scheduler run."""
    id: int
    job_id: str
    started_at: str
    ended_at: Optional[str]
    status: str
    rates_processed: int
    rates_updated: int
    error_message: Optional[str]


class AnomalyResponse(BaseModel):
    """Response model for anomaly."""
    id: int
    rate_type: str
    detected_at: str
    anomaly_type: str
    current_value: float
    expected_range_low: float
    expected_range_high: float
    std_devs: float
    message: str


class StatsResponse(BaseModel):
    """Response model for database statistics."""
    rates_count: int
    oracle_updates_count: int
    anomalies_count: int
    scheduler_runs_count: int
    database_path: str


# =============================================================================
# APP SETUP
# =============================================================================

settings = Settings()
data_store = DataStore(settings.database_path)
scheduler = RateScheduler(settings, data_store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    setup_logging(
        log_level=settings.log_level,
        json_format=settings.log_json_format
    )
    await data_store.initialize()
    await scheduler.start()
    logger.info("API started")
    yield
    await scheduler.stop()
    logger.info("API stopped")


app = FastAPI(
    title="DELOS API",
    description="Brazilian Macro Data Oracle API - Chainlink-compatible BCB rate feeds",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
cors_origins = settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# HEALTH ENDPOINT
# =============================================================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Check system health.

    Returns status of BCB API, oracle connection, and scheduler.
    """
    bcb_ok = False
    oracle_ok = False

    try:
        async with BCBClient() as bcb:
            bcb_ok = await bcb.health_check()
    except Exception as e:
        logger.warning(f"BCB health check failed: {e}")

    try:
        updater = OracleUpdater()
        oracle_ok = await updater.check_connection()
    except Exception as e:
        logger.warning(f"Oracle health check failed: {e}")

    # Determine overall status
    if bcb_ok and oracle_ok and scheduler.is_running:
        status = "healthy"
    elif bcb_ok or oracle_ok:
        status = "degraded"
    else:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        bcb_api=bcb_ok,
        oracle_connection=oracle_ok,
        scheduler_running=scheduler.is_running,
        last_update=None  # Could fetch from data_store
    )


# =============================================================================
# RATE ENDPOINTS
# =============================================================================

@app.get("/rates", response_model=List[RateResponse], tags=["Rates"])
async def get_all_rates():
    """
    Get all current rates from the oracle contract.

    Returns rates currently stored on-chain with staleness indicators.
    """
    try:
        updater = OracleUpdater()
        rates = await updater.get_all_current_rates()

        result = []
        for rate_type_str, data in rates.items():
            rate_type = RateType(rate_type_str)
            config = RATE_CONFIGS[rate_type]

            last_update = datetime.fromtimestamp(data["timestamp"])
            age_seconds = (datetime.now() - last_update).total_seconds()
            is_stale = age_seconds > config.heartbeat_seconds

            result.append(RateResponse(
                rate_type=rate_type_str,
                answer=data["answer"],
                raw_value=data["value_percent"],
                real_world_date=data["real_world_date"],
                timestamp=data["timestamp"],
                source=f"BCB-{config.bcb_series}",
                is_stale=is_stale,
                heartbeat_seconds=config.heartbeat_seconds
            ))

        return result
    except Exception as e:
        logger.error(f"Failed to get rates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rates/{rate_type}", response_model=RateResponse, tags=["Rates"])
async def get_rate(rate_type: str):
    """
    Get a specific rate from the oracle contract.

    Args:
        rate_type: Rate type (IPCA, CDI, SELIC, PTAX, IGPM, TR)
    """
    try:
        rate_enum = RateType(rate_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rate type. Valid types: {[r.value for r in RateType]}"
        )

    try:
        updater = OracleUpdater()
        data = await updater.get_current_rate(rate_enum.value)

        if data is None:
            raise HTTPException(status_code=404, detail=f"Rate {rate_type} not found in oracle")

        config = RATE_CONFIGS[rate_enum]
        last_update = datetime.fromtimestamp(data["timestamp"])
        age_seconds = (datetime.now() - last_update).total_seconds()
        is_stale = age_seconds > config.heartbeat_seconds

        return RateResponse(
            rate_type=rate_type.upper(),
            answer=data["answer"],
            raw_value=data["value_percent"],
            real_world_date=data["real_world_date"],
            timestamp=data["timestamp"],
            source=f"BCB-{config.bcb_series}",
            is_stale=is_stale,
            heartbeat_seconds=config.heartbeat_seconds
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get rate {rate_type}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rates/{rate_type}/history", response_model=RateHistoryResponse, tags=["Rates"])
async def get_rate_history(
    rate_type: str,
    days: int = Query(default=30, ge=1, le=365, description="Number of days of history")
):
    """
    Get historical rates from local storage.

    Args:
        rate_type: Rate type (IPCA, CDI, SELIC, PTAX, IGPM, TR)
        days: Number of days of history (1-365)
    """
    try:
        rate_enum = RateType(rate_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rate type. Valid types: {[r.value for r in RateType]}"
        )

    try:
        history = await data_store.get_rate_history(rate_enum.value, days)
        config = RATE_CONFIGS[rate_enum]

        return RateHistoryResponse(
            rate_type=rate_type.upper(),
            history=[
                RateResponse(
                    rate_type=rate_type.upper(),
                    answer=r.answer,
                    raw_value=r.raw_value,
                    real_world_date=r.real_world_date,
                    timestamp=int(r.bcb_timestamp.timestamp()),
                    source=r.source,
                    is_stale=False,
                    heartbeat_seconds=config.heartbeat_seconds
                )
                for r in history
            ],
            count=len(history)
        )
    except Exception as e:
        logger.error(f"Failed to get history for {rate_type}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SYNC ENDPOINT
# =============================================================================

@app.post("/sync", response_model=SyncResponse, tags=["Sync"])
async def manual_sync(
    background_tasks: BackgroundTasks,
    rate_type: Optional[str] = Query(default=None, description="Specific rate to sync (optional)"),
    force: bool = Query(default=False, description="Force update even if same date")
):
    """
    Manually trigger rate synchronization.

    Args:
        rate_type: Specific rate to sync (optional, default: all)
        force: Force update even if same date
    """
    try:
        if rate_type:
            try:
                rate_enum = RateType(rate_type.upper())
                rate_types = [rate_enum]
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid rate type. Valid types: {[r.value for r in RateType]}"
                )
        else:
            rate_types = list(RateType)

        # Run update
        results = await scheduler._update_rates(rate_types, "manual")

        return SyncResponse(
            success=results["success"],
            rates_updated=results["rates_updated"],
            rates_skipped=results["rates_skipped"],
            rates_failed=results.get("rates_failed", 0),
            anomalies_detected=results.get("anomalies_detected", 0),
            tx_hash=results.get("tx_hash"),
            error=results.get("error")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SCHEDULER ENDPOINTS
# =============================================================================

@app.get("/scheduler/jobs", response_model=List[JobResponse], tags=["Scheduler"])
async def get_scheduler_jobs():
    """Get all scheduled jobs and their next run times."""
    jobs = scheduler.get_jobs()
    return [JobResponse(**job) for job in jobs]


@app.get("/scheduler/runs", response_model=List[SchedulerRunResponse], tags=["Scheduler"])
async def get_scheduler_runs(
    limit: int = Query(default=20, ge=1, le=100, description="Number of runs to return")
):
    """Get recent scheduler job runs."""
    runs = await data_store.get_scheduler_runs(limit)
    return [
        SchedulerRunResponse(
            id=r.id,
            job_id=r.job_id,
            started_at=r.started_at.isoformat(),
            ended_at=r.ended_at.isoformat() if r.ended_at else None,
            status=r.status,
            rates_processed=r.rates_processed,
            rates_updated=r.rates_updated,
            error_message=r.error_message
        )
        for r in runs
    ]


# =============================================================================
# BCB DIRECT ENDPOINT
# =============================================================================

@app.get("/bcb/latest/{rate_type}", tags=["BCB"])
async def get_bcb_latest(rate_type: str):
    """
    Fetch latest rate directly from BCB API (bypass oracle).

    Useful for debugging and comparing with on-chain data.

    Args:
        rate_type: Rate type (IPCA, CDI, SELIC, PTAX, IGPM, TR)
    """
    try:
        rate_enum = RateType(rate_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rate type. Valid types: {[r.value for r in RateType]}"
        )

    try:
        async with BCBClient() as bcb:
            data = await bcb.fetch_latest(rate_enum)
            return {
                "rate_type": data.rate_type.value,
                "answer": data.answer,
                "raw_value": data.raw_value,
                "real_world_date": data.real_world_date,
                "real_world_date_str": data.real_world_date_str,
                "source": data.source,
                "description": data.description,
                "timestamp": data.timestamp.isoformat()
            }
    except BCBClientError as e:
        logger.error(f"BCB fetch failed for {rate_type}: {e}")
        raise HTTPException(status_code=502, detail=f"BCB API error: {str(e)}")
    except Exception as e:
        logger.error(f"BCB fetch failed for {rate_type}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ANOMALY ENDPOINTS
# =============================================================================

@app.get("/anomalies", response_model=List[AnomalyResponse], tags=["Anomalies"])
async def get_anomalies(
    rate_type: Optional[str] = Query(default=None, description="Filter by rate type"),
    days: int = Query(default=7, ge=1, le=90, description="Number of days to look back"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum records to return")
):
    """Get detected anomalies from the database."""
    try:
        if rate_type:
            try:
                RateType(rate_type.upper())
                rate_type = rate_type.upper()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid rate type. Valid types: {[r.value for r in RateType]}"
                )

        anomalies = await data_store.get_anomalies(rate_type, days, limit)
        return [
            AnomalyResponse(
                id=a.id,
                rate_type=a.rate_type,
                detected_at=a.detected_at.isoformat(),
                anomaly_type=a.anomaly_type,
                current_value=a.current_value,
                expected_range_low=a.expected_range_low,
                expected_range_high=a.expected_range_high,
                std_devs=a.std_devs,
                message=a.message
            )
            for a in anomalies
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get anomalies: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STATS ENDPOINT
# =============================================================================

@app.get("/stats", response_model=StatsResponse, tags=["Stats"])
async def get_stats():
    """Get database statistics."""
    try:
        stats = await data_store.get_stats()
        return StatsResponse(**stats)
    except Exception as e:
        logger.error(f"Failed to get stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# MAIN
# =============================================================================

def main():
    """Run the API server."""
    import uvicorn
    uvicorn.run(
        "api:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
