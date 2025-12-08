"""
DELOS Data Store
SQLite-based persistence for rate history, anomaly logs, and update tracking.
"""

import aiosqlite
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class StoredRate:
    """Rate data stored in the database."""
    id: int
    rate_type: str
    answer: int  # Chainlink scaled (10^8)
    raw_value: float
    real_world_date: int  # YYYYMMDD
    bcb_timestamp: datetime
    fetch_timestamp: datetime
    source: str


@dataclass
class OracleUpdate:
    """Oracle update transaction record."""
    id: int
    rate_type: str
    tx_hash: Optional[str]
    block_number: Optional[int]
    gas_used: Optional[int]
    status: str  # 'success', 'failed', 'skipped'
    error_message: Optional[str]
    timestamp: datetime


@dataclass
class Anomaly:
    """Detected anomaly record."""
    id: int
    rate_type: str
    detected_at: datetime
    anomaly_type: str  # 'value_spike', 'stale_data', 'velocity'
    current_value: float
    expected_range_low: float
    expected_range_high: float
    std_devs: float
    message: str


@dataclass
class SchedulerRun:
    """Scheduler job execution record."""
    id: int
    job_id: str
    started_at: datetime
    ended_at: Optional[datetime]
    status: str  # 'running', 'completed', 'failed'
    rates_processed: int
    rates_updated: int
    error_message: Optional[str]


# =============================================================================
# SCHEMA
# =============================================================================

SCHEMA_SQL = """
-- Rate data fetched from BCB
CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    answer INTEGER NOT NULL,
    raw_value REAL NOT NULL,
    real_world_date INTEGER NOT NULL,
    bcb_timestamp DATETIME NOT NULL,
    fetch_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    UNIQUE(rate_type, real_world_date)
);

-- Index for history queries
CREATE INDEX IF NOT EXISTS idx_rates_type_date ON rates(rate_type, real_world_date DESC);

-- Oracle blockchain transactions
CREATE TABLE IF NOT EXISTS oracle_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    tx_hash TEXT,
    block_number INTEGER,
    gas_used INTEGER,
    status TEXT NOT NULL,
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oracle_updates_timestamp ON oracle_updates(timestamp DESC);

-- Detected anomalies
CREATE TABLE IF NOT EXISTS anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    anomaly_type TEXT NOT NULL,
    current_value REAL,
    expected_range_low REAL,
    expected_range_high REAL,
    std_devs REAL,
    message TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_type_date ON anomalies(rate_type, detected_at DESC);

-- Scheduler job runs
CREATE TABLE IF NOT EXISTS scheduler_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    status TEXT NOT NULL,
    rates_processed INTEGER DEFAULT 0,
    rates_updated INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started ON scheduler_runs(started_at DESC);
"""


# =============================================================================
# DATA STORE
# =============================================================================

class DataStore:
    """
    Async SQLite data store for rate history and logging.

    Provides:
    - Rate data versioning for anomaly detection
    - Oracle update transaction logging
    - Anomaly logging
    - Scheduler job execution tracking
    """

    def __init__(self, db_path: str = "data/rates.db"):
        """
        Initialize data store.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialized = False

    async def initialize(self) -> None:
        """Create database tables if they don't exist."""
        if self._initialized:
            return

        async with aiosqlite.connect(self.db_path) as db:
            await db.executescript(SCHEMA_SQL)
            await db.commit()

        self._initialized = True
        logger.info(f"DataStore initialized: {self.db_path}")

    # =========================================================================
    # RATE DATA
    # =========================================================================

    async def store_rate(self, rate_data: Any) -> int:
        """
        Store a rate fetched from BCB.

        Uses INSERT OR REPLACE to update existing records for same date.

        Args:
            rate_data: RateData object from BCB client

        Returns:
            Row ID of inserted/updated record
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT OR REPLACE INTO rates
                (rate_type, answer, raw_value, real_world_date, bcb_timestamp, source)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    rate_data.rate_type.value if hasattr(rate_data.rate_type, 'value') else rate_data.rate_type,
                    rate_data.answer,
                    rate_data.raw_value,
                    rate_data.real_world_date,
                    rate_data.timestamp.isoformat(),
                    rate_data.source,
                )
            )
            await db.commit()
            return cursor.lastrowid

    async def get_rate_history(
        self,
        rate_type: str,
        days: int = 30
    ) -> List[StoredRate]:
        """
        Get historical rates for anomaly detection.

        Args:
            rate_type: Rate type (e.g., "CDI", "IPCA")
            days: Number of days of history to fetch

        Returns:
            List of StoredRate, most recent first
        """
        cutoff_date = datetime.now() - timedelta(days=days)

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM rates
                WHERE rate_type = ? AND fetch_timestamp >= ?
                ORDER BY real_world_date DESC
                """,
                (rate_type, cutoff_date.isoformat())
            )
            rows = await cursor.fetchall()

            return [
                StoredRate(
                    id=row["id"],
                    rate_type=row["rate_type"],
                    answer=row["answer"],
                    raw_value=row["raw_value"],
                    real_world_date=row["real_world_date"],
                    bcb_timestamp=datetime.fromisoformat(row["bcb_timestamp"]),
                    fetch_timestamp=datetime.fromisoformat(row["fetch_timestamp"]) if row["fetch_timestamp"] else datetime.now(),
                    source=row["source"],
                )
                for row in rows
            ]

    async def get_latest_rate(self, rate_type: str) -> Optional[StoredRate]:
        """Get the most recent stored rate for a type."""
        history = await self.get_rate_history(rate_type, days=365)
        return history[0] if history else None

    # =========================================================================
    # ORACLE UPDATES
    # =========================================================================

    async def log_oracle_update(
        self,
        rate_type: str,
        tx_hash: Optional[str],
        block_number: Optional[int],
        gas_used: Optional[int],
        status: str,
        error_message: Optional[str] = None
    ) -> int:
        """
        Log an oracle update attempt.

        Args:
            rate_type: Rate type updated
            tx_hash: Transaction hash (if successful)
            block_number: Block number (if confirmed)
            gas_used: Gas consumed
            status: 'success', 'failed', or 'skipped'
            error_message: Error details if failed

        Returns:
            Row ID
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO oracle_updates
                (rate_type, tx_hash, block_number, gas_used, status, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (rate_type, tx_hash, block_number, gas_used, status, error_message)
            )
            await db.commit()
            logger.info(
                f"Logged oracle update: {rate_type} - {status}",
                extra={"rate_type": rate_type, "tx_hash": tx_hash, "status": status}
            )
            return cursor.lastrowid

    async def get_oracle_updates(
        self,
        rate_type: Optional[str] = None,
        limit: int = 100
    ) -> List[OracleUpdate]:
        """Get recent oracle update records."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            if rate_type:
                cursor = await db.execute(
                    """
                    SELECT * FROM oracle_updates
                    WHERE rate_type = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                    """,
                    (rate_type, limit)
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT * FROM oracle_updates
                    ORDER BY timestamp DESC
                    LIMIT ?
                    """,
                    (limit,)
                )

            rows = await cursor.fetchall()
            return [
                OracleUpdate(
                    id=row["id"],
                    rate_type=row["rate_type"],
                    tx_hash=row["tx_hash"],
                    block_number=row["block_number"],
                    gas_used=row["gas_used"],
                    status=row["status"],
                    error_message=row["error_message"],
                    timestamp=datetime.fromisoformat(row["timestamp"]) if row["timestamp"] else datetime.now(),
                )
                for row in rows
            ]

    # =========================================================================
    # ANOMALIES
    # =========================================================================

    async def log_anomaly(
        self,
        rate_type: str,
        anomaly_type: str,
        current_value: float,
        expected_low: float,
        expected_high: float,
        std_devs: float,
        message: str
    ) -> int:
        """
        Log a detected anomaly.

        Args:
            rate_type: Rate type with anomaly
            anomaly_type: Type of anomaly ('value_spike', 'stale_data', 'velocity')
            current_value: Observed value
            expected_low: Lower bound of expected range
            expected_high: Upper bound of expected range
            std_devs: Number of standard deviations from mean
            message: Human-readable description

        Returns:
            Row ID
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO anomalies
                (rate_type, anomaly_type, current_value, expected_range_low,
                 expected_range_high, std_devs, message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (rate_type, anomaly_type, current_value, expected_low,
                 expected_high, std_devs, message)
            )
            await db.commit()
            logger.warning(
                f"Anomaly logged: {rate_type} - {anomaly_type}: {message}",
                extra={"rate_type": rate_type, "anomaly_type": anomaly_type, "z_score": std_devs}
            )
            return cursor.lastrowid

    async def get_anomalies(
        self,
        rate_type: Optional[str] = None,
        days: int = 7,
        limit: int = 100
    ) -> List[Anomaly]:
        """Get recent anomaly records."""
        cutoff = datetime.now() - timedelta(days=days)

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            if rate_type:
                cursor = await db.execute(
                    """
                    SELECT * FROM anomalies
                    WHERE rate_type = ? AND detected_at >= ?
                    ORDER BY detected_at DESC
                    LIMIT ?
                    """,
                    (rate_type, cutoff.isoformat(), limit)
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT * FROM anomalies
                    WHERE detected_at >= ?
                    ORDER BY detected_at DESC
                    LIMIT ?
                    """,
                    (cutoff.isoformat(), limit)
                )

            rows = await cursor.fetchall()
            return [
                Anomaly(
                    id=row["id"],
                    rate_type=row["rate_type"],
                    detected_at=datetime.fromisoformat(row["detected_at"]) if row["detected_at"] else datetime.now(),
                    anomaly_type=row["anomaly_type"],
                    current_value=row["current_value"],
                    expected_range_low=row["expected_range_low"],
                    expected_range_high=row["expected_range_high"],
                    std_devs=row["std_devs"],
                    message=row["message"],
                )
                for row in rows
            ]

    # =========================================================================
    # SCHEDULER RUNS
    # =========================================================================

    async def log_scheduler_run(
        self,
        job_id: str,
        started_at: datetime,
        status: str = "running"
    ) -> int:
        """
        Log the start of a scheduler job.

        Args:
            job_id: Job identifier
            started_at: Job start time
            status: Initial status

        Returns:
            Row ID for updating later
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO scheduler_runs (job_id, started_at, status)
                VALUES (?, ?, ?)
                """,
                (job_id, started_at.isoformat(), status)
            )
            await db.commit()
            return cursor.lastrowid

    async def update_scheduler_run(
        self,
        job_id: str,
        ended_at: datetime,
        status: str,
        rates_processed: int = 0,
        rates_updated: int = 0,
        error_message: Optional[str] = None
    ) -> None:
        """
        Update a scheduler run record.

        Updates the most recent run for the given job_id.

        Args:
            job_id: Job identifier
            ended_at: Job completion time
            status: Final status ('completed', 'failed')
            rates_processed: Number of rates processed
            rates_updated: Number of rates updated
            error_message: Error details if failed
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE scheduler_runs
                SET ended_at = ?, status = ?, rates_processed = ?,
                    rates_updated = ?, error_message = ?
                WHERE job_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
                """,
                (ended_at.isoformat(), status, rates_processed,
                 rates_updated, error_message, job_id)
            )
            await db.commit()

    async def get_scheduler_runs(self, limit: int = 20) -> List[SchedulerRun]:
        """Get recent scheduler job runs."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM scheduler_runs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,)
            )
            rows = await cursor.fetchall()

            return [
                SchedulerRun(
                    id=row["id"],
                    job_id=row["job_id"],
                    started_at=datetime.fromisoformat(row["started_at"]),
                    ended_at=datetime.fromisoformat(row["ended_at"]) if row["ended_at"] else None,
                    status=row["status"],
                    rates_processed=row["rates_processed"],
                    rates_updated=row["rates_updated"],
                    error_message=row["error_message"],
                )
                for row in rows
            ]

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_stats(self) -> Dict[str, Any]:
        """Get database statistics."""
        async with aiosqlite.connect(self.db_path) as db:
            # Count records in each table
            rates_count = await db.execute("SELECT COUNT(*) FROM rates")
            updates_count = await db.execute("SELECT COUNT(*) FROM oracle_updates")
            anomalies_count = await db.execute("SELECT COUNT(*) FROM anomalies")
            runs_count = await db.execute("SELECT COUNT(*) FROM scheduler_runs")

            return {
                "rates_count": (await rates_count.fetchone())[0],
                "oracle_updates_count": (await updates_count.fetchone())[0],
                "anomalies_count": (await anomalies_count.fetchone())[0],
                "scheduler_runs_count": (await runs_count.fetchone())[0],
                "database_path": str(self.db_path),
            }
