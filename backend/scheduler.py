"""
DELOS Rate Update Scheduler
Automated BCB data fetching and oracle updates using APScheduler.

Schedule:
- Daily rates (CDI, SELIC, PTAX, TR): 19:00 BRT (22:00 UTC) on business days
- Monthly rates (IPCA, IGPM): 10th of each month at 10:00 BRT

BCB typically publishes:
- CDI/SELIC: ~18:00 BRT on business days
- PTAX: ~13:00 BRT on business days
- IPCA: ~9:00 BRT around 10th of month
- IGPM: ~8:00 BRT around 20th of month

Usage:
    python scheduler.py start      # Run scheduler daemon
    python scheduler.py run-once   # Manual update (all rates)
    python scheduler.py run-once --rates CDI,SELIC  # Specific rates
    python scheduler.py status     # Show job schedule
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import (
    EVENT_JOB_ERROR,
    EVENT_JOB_EXECUTED,
    EVENT_JOB_MISSED,
    JobExecutionEvent
)

from bcb_client import BCBClient, RateType, RateData, BCBClientError, RATE_CONFIGS
from oracle_updater import OracleUpdater, UpdateResult
from services.data_store import DataStore
from services.anomaly_detector import AnomalyDetector
from config import Settings
from logging_config import setup_logging, get_logger

logger = get_logger(__name__)

# Brazil timezone
BRT = ZoneInfo("America/Sao_Paulo")

# Rate groupings by update frequency
DAILY_RATES = [RateType.CDI, RateType.SELIC, RateType.PTAX, RateType.TR]
MONTHLY_RATES = [RateType.IPCA, RateType.IGPM]


class RateScheduler:
    """
    Automated rate update scheduler.

    Features:
    - Daily updates at 19:00 BRT for CDI, SELIC, PTAX, TR
    - Monthly updates on 10th at 10:00 BRT for IPCA, IGPM
    - Retry logic with exponential backoff
    - Anomaly detection before updates
    - SQLite data versioning
    - Graceful shutdown
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        data_store: Optional[DataStore] = None,
        anomaly_detector: Optional[AnomalyDetector] = None,
    ):
        """
        Initialize scheduler.

        Args:
            settings: Application settings
            data_store: Data persistence layer
            anomaly_detector: Anomaly detection service
        """
        self.settings = settings or Settings()
        self.data_store = data_store or DataStore(self.settings.database_path)
        self.anomaly_detector = anomaly_detector or AnomalyDetector(
            std_threshold=self.settings.anomaly_std_threshold,
            lookback_days=self.settings.anomaly_lookback_days,
            velocity_threshold=self.settings.anomaly_velocity_threshold,
        )

        self.scheduler = AsyncIOScheduler(timezone=BRT)
        self.is_running = False

        # Setup event listeners
        self.scheduler.add_listener(self._on_job_executed, EVENT_JOB_EXECUTED)
        self.scheduler.add_listener(self._on_job_error, EVENT_JOB_ERROR)
        self.scheduler.add_listener(self._on_job_missed, EVENT_JOB_MISSED)

    def setup_jobs(self) -> None:
        """Configure scheduled jobs."""

        # Daily rates: 19:00 BRT on business days (Mon-Fri)
        self.scheduler.add_job(
            self.update_daily_rates,
            CronTrigger(
                hour=self.settings.daily_update_hour,
                minute=self.settings.daily_update_minute,
                day_of_week="mon-fri",
                timezone=BRT
            ),
            id="daily_rates",
            name="Daily Rate Update (CDI, SELIC, PTAX, TR)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600  # 1 hour grace period
        )

        # Monthly rates: 10th of month at 10:00 BRT
        self.scheduler.add_job(
            self.update_monthly_rates,
            CronTrigger(
                day=self.settings.monthly_update_day,
                hour=10,
                minute=0,
                timezone=BRT
            ),
            id="monthly_rates",
            name="Monthly Rate Update (IPCA, IGPM)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=86400  # 24 hour grace period
        )

        # Backup job: Check for stale data every 4 hours
        self.scheduler.add_job(
            self.check_stale_rates,
            CronTrigger(hour="*/4", timezone=BRT),
            id="stale_check",
            name="Stale Data Check",
            replace_existing=True,
            max_instances=1
        )

        logger.info("Scheduler jobs configured")

    async def update_daily_rates(self) -> Dict[str, Any]:
        """Update daily rates (CDI, SELIC, PTAX, TR)."""
        return await self._update_rates(DAILY_RATES, "daily")

    async def update_monthly_rates(self) -> Dict[str, Any]:
        """Update monthly rates (IPCA, IGPM)."""
        return await self._update_rates(MONTHLY_RATES, "monthly")

    async def update_all_rates(self) -> Dict[str, Any]:
        """Update all rates (manual trigger)."""
        return await self._update_rates(list(RateType), "all")

    async def _update_rates(
        self,
        rate_types: List[RateType],
        update_type: str
    ) -> Dict[str, Any]:
        """
        Core update logic with retry and anomaly detection.

        Args:
            rate_types: List of rates to update
            update_type: 'daily', 'monthly', or 'all' for logging

        Returns:
            Dictionary with update results
        """
        job_start = datetime.now()
        results = {
            "success": False,
            "rates_updated": 0,
            "rates_skipped": 0,
            "rates_failed": 0,
            "anomalies_detected": 0,
            "tx_hash": None,
            "error": None,
        }

        logger.info(
            f"Starting {update_type} rate update",
            extra={"rate_types": [r.value for r in rate_types], "job_id": f"{update_type}_rates"}
        )

        # Log job start
        await self.data_store.log_scheduler_run(
            job_id=f"{update_type}_rates",
            started_at=job_start,
            status="running"
        )

        try:
            # Fetch rates with parallel fetching and retry
            async with BCBClient() as bcb:
                fetched_rates: Dict[RateType, RateData] = {}

                for rate_type in rate_types:
                    try:
                        rate_data = await bcb.fetch_with_retry(
                            rate_type,
                            max_retries=self.settings.bcb_max_retries,
                            base_delay=self.settings.bcb_retry_base_delay,
                            max_delay=self.settings.bcb_retry_max_delay,
                        )
                        fetched_rates[rate_type] = rate_data
                    except BCBClientError as e:
                        logger.error(f"Failed to fetch {rate_type.value} after retries: {e}")
                        results["rates_failed"] += 1

            if not fetched_rates:
                error_msg = "No rates fetched from BCB"
                results["error"] = error_msg
                await self.data_store.update_scheduler_run(
                    job_id=f"{update_type}_rates",
                    ended_at=datetime.now(),
                    status="failed",
                    error_message=error_msg
                )
                return results

            # Check for anomalies and store rates
            for rate_type, rate_data in fetched_rates.items():
                # Get historical data for anomaly detection
                history = await self.data_store.get_rate_history(
                    rate_type.value,
                    days=self.settings.anomaly_lookback_days
                )
                historical_values = [r.raw_value for r in history]

                # Run anomaly checks
                if historical_values:
                    anomaly_result = self.anomaly_detector.detect_value_anomaly(
                        rate_data.raw_value,
                        historical_values
                    )

                    if anomaly_result.is_anomaly:
                        results["anomalies_detected"] += 1
                        logger.warning(
                            f"Anomaly detected for {rate_type.value}: {anomaly_result.message}",
                            extra={
                                "rate_type": rate_type.value,
                                "anomaly_type": anomaly_result.anomaly_type,
                                "z_score": anomaly_result.z_score
                            }
                        )
                        await self.data_store.log_anomaly(
                            rate_type=rate_type.value,
                            anomaly_type=anomaly_result.anomaly_type,
                            current_value=rate_data.raw_value,
                            expected_low=anomaly_result.mean - (anomaly_result.std_dev * self.settings.anomaly_std_threshold),
                            expected_high=anomaly_result.mean + (anomaly_result.std_dev * self.settings.anomaly_std_threshold),
                            std_devs=anomaly_result.z_score,
                            message=anomaly_result.message
                        )
                        # Note: We log but DON'T block the update

                # Store rate in local database
                await self.data_store.store_rate(rate_data)

            # Update oracle
            try:
                updater = OracleUpdater()
                oracle_result = await updater.sync_all_rates()

                results["success"] = oracle_result.success
                results["rates_updated"] = oracle_result.rates_updated
                results["rates_skipped"] = oracle_result.rates_skipped
                results["tx_hash"] = oracle_result.tx_hash

                if oracle_result.error:
                    results["error"] = oracle_result.error

                # Log individual oracle updates
                for rate_type in fetched_rates.keys():
                    await self.data_store.log_oracle_update(
                        rate_type=rate_type.value,
                        tx_hash=oracle_result.tx_hash,
                        block_number=oracle_result.block,
                        gas_used=oracle_result.gas_used,
                        status="success" if oracle_result.success else "failed",
                        error_message=oracle_result.error
                    )

            except Exception as e:
                logger.error(f"Oracle update failed: {e}")
                results["error"] = str(e)

                # Log failed oracle updates
                for rate_type in fetched_rates.keys():
                    await self.data_store.log_oracle_update(
                        rate_type=rate_type.value,
                        tx_hash=None,
                        block_number=None,
                        gas_used=None,
                        status="failed",
                        error_message=str(e)
                    )

            # Log job completion
            duration_ms = (datetime.now() - job_start).total_seconds() * 1000
            await self.data_store.update_scheduler_run(
                job_id=f"{update_type}_rates",
                ended_at=datetime.now(),
                status="completed" if results["success"] else "failed",
                rates_processed=len(rate_types),
                rates_updated=results["rates_updated"],
                error_message=results["error"]
            )

            logger.info(
                f"Completed {update_type} rate update: "
                f"{results['rates_updated']} updated, "
                f"{results['rates_skipped']} skipped, "
                f"{results['rates_failed']} failed, "
                f"{results['anomalies_detected']} anomalies",
                extra={
                    "tx_hash": results["tx_hash"],
                    "duration_ms": duration_ms,
                    "job_id": f"{update_type}_rates"
                }
            )

        except Exception as e:
            logger.error(f"{update_type} rate update failed: {e}", exc_info=True)
            results["error"] = str(e)
            await self.data_store.update_scheduler_run(
                job_id=f"{update_type}_rates",
                ended_at=datetime.now(),
                status="failed",
                error_message=str(e)
            )
            await self._send_alert(f"{update_type.title()} rate update failed: {e}")

        return results

    async def check_stale_rates(self) -> Dict[str, bool]:
        """
        Check for stale data and log alerts.

        Returns:
            Dictionary of rate types to staleness status
        """
        stale_rates = {}

        try:
            updater = OracleUpdater()
            rates = await updater.get_all_current_rates()

            for rate_type_str, rate_data in rates.items():
                rate_type = RateType(rate_type_str)
                config = RATE_CONFIGS[rate_type]

                last_update = datetime.fromtimestamp(rate_data["timestamp"])
                anomaly = self.anomaly_detector.detect_stale_data(
                    last_update,
                    config.heartbeat_seconds
                )

                stale_rates[rate_type_str] = anomaly.is_anomaly

                if anomaly.is_anomaly:
                    logger.warning(
                        f"Stale data detected: {rate_type_str} - {anomaly.message}",
                        extra={"rate_type": rate_type_str, "anomaly_type": "stale_data"}
                    )
                    await self._send_alert(f"Stale rate: {rate_type_str} - {anomaly.message}")

        except Exception as e:
            logger.error(f"Stale rate check failed: {e}")

        return stale_rates

    async def _send_alert(self, message: str) -> None:
        """
        Send alert via configured channels.

        Args:
            message: Alert message
        """
        # For now, just log as critical
        # Future: Add Slack, email, PagerDuty integration
        logger.critical(f"ALERT: {message}")

        if self.settings.slack_webhook_url:
            # TODO: Implement Slack notification
            pass

    def _on_job_executed(self, event: JobExecutionEvent) -> None:
        """Handle successful job execution."""
        logger.info(
            f"Job {event.job_id} executed successfully",
            extra={"job_id": event.job_id}
        )

    def _on_job_error(self, event: JobExecutionEvent) -> None:
        """Handle job execution error."""
        logger.error(
            f"Job {event.job_id} failed: {event.exception}",
            extra={"job_id": event.job_id},
            exc_info=event.exception
        )

    def _on_job_missed(self, event: JobExecutionEvent) -> None:
        """Handle missed job execution."""
        logger.warning(
            f"Job {event.job_id} missed scheduled run",
            extra={"job_id": event.job_id}
        )

    async def start(self) -> None:
        """Start the scheduler."""
        await self.data_store.initialize()
        self.setup_jobs()
        self.scheduler.start()
        self.is_running = True
        logger.info("Scheduler started")

    async def stop(self) -> None:
        """Gracefully stop the scheduler."""
        self.scheduler.shutdown(wait=True)
        self.is_running = False
        logger.info("Scheduler stopped")

    def get_jobs(self) -> List[Dict[str, Any]]:
        """Get all scheduled jobs."""
        return [
            {
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger)
            }
            for job in self.scheduler.get_jobs()
        ]


async def main():
    """CLI entry point for scheduler."""
    import argparse

    parser = argparse.ArgumentParser(description="DELOS Rate Scheduler")
    parser.add_argument(
        "command",
        choices=["start", "run-once", "status"],
        help="Command to run"
    )
    parser.add_argument(
        "--rates",
        type=str,
        help="Comma-separated rate types (for run-once)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output in JSON format"
    )
    args = parser.parse_args()

    # Setup logging
    setup_logging(log_level="INFO", json_format=args.json)

    scheduler = RateScheduler()

    if args.command == "start":
        await scheduler.start()
        print("Scheduler started. Press Ctrl+C to stop.")
        try:
            # Keep running
            while True:
                await asyncio.sleep(60)
        except KeyboardInterrupt:
            print("\nShutting down...")
            await scheduler.stop()

    elif args.command == "run-once":
        await scheduler.data_store.initialize()

        # Parse rate types if provided
        rate_types = None
        if args.rates:
            try:
                rate_types = [RateType(r.strip().upper()) for r in args.rates.split(",")]
            except ValueError as e:
                print(f"Error: Invalid rate type. Valid types: {[r.value for r in RateType]}")
                return

        if rate_types:
            results = await scheduler._update_rates(rate_types, "manual")
        else:
            results = await scheduler.update_all_rates()

        if args.json:
            import json
            print(json.dumps(results, indent=2))
        else:
            print(f"\nUpdate Results:")
            print(f"  Success: {results['success']}")
            print(f"  Rates Updated: {results['rates_updated']}")
            print(f"  Rates Skipped: {results['rates_skipped']}")
            print(f"  Rates Failed: {results['rates_failed']}")
            print(f"  Anomalies: {results['anomalies_detected']}")
            if results['tx_hash']:
                print(f"  TX Hash: {results['tx_hash']}")
            if results['error']:
                print(f"  Error: {results['error']}")

    elif args.command == "status":
        await scheduler.start()
        jobs = scheduler.get_jobs()

        if args.json:
            import json
            print(json.dumps(jobs, indent=2))
        else:
            print("\nScheduled Jobs:")
            print("-" * 60)
            for job in jobs:
                print(f"\n{job['id']}: {job['name']}")
                print(f"  Next run: {job['next_run']}")
                print(f"  Trigger: {job['trigger']}")

        await scheduler.stop()


if __name__ == "__main__":
    asyncio.run(main())
