"""
Fetch the latest BCB rates and upsert them into Supabase.

This is the production data path: a scheduled GitHub Action runs this script,
and the dashboard reads the resulting rows straight from Supabase. There is no
long-running backend server.

Environment:
    SUPABASE_URL               https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  service-role key (writes bypass RLS; never ship
                               this to a browser)

Usage:
    python sync_supabase.py            # fetch all rates and upsert
    DRY_RUN=1 python sync_supabase.py  # fetch and print, write nothing
"""

import asyncio
import os
import sys

import httpx

from bcb_client import RATE_CONFIGS, BCBClient, RateData
from logging_config import get_logger, setup_logging

logger = get_logger(__name__)


def rate_to_row(rate: RateData) -> dict:
    """Map a RateData onto a public.rates row."""
    config = RATE_CONFIGS[rate.rate_type]
    return {
        "rate_type": rate.rate_type.value,
        "answer": rate.answer,
        "raw_value": rate.raw_value,
        "real_world_date": rate.real_world_date,
        "bcb_timestamp": rate.timestamp.isoformat(),
        "source": rate.source,
        "heartbeat_seconds": config.heartbeat_seconds,
    }


async def upsert_rates(
    rows: list[dict], supabase_url: str, service_role_key: str
) -> None:
    """
    Upsert rows into public.rates via PostgREST.

    merge-duplicates + on_conflict makes re-runs idempotent: fetching the same
    reference date twice updates the row instead of failing the unique
    constraint.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{supabase_url.rstrip('/')}/rest/v1/rates",
            params={"on_conflict": "rate_type,real_world_date"},
            json=rows,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        response.raise_for_status()


async def sync() -> int:
    """Fetch all rates from BCB and store them. Returns a process exit code."""
    dry_run = os.environ.get("DRY_RUN", "") not in ("", "0", "false")

    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not dry_run and (not supabase_url or not service_role_key):
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        return 2

    async with BCBClient() as bcb:
        rates = await bcb.fetch_all_latest_parallel()

    if not rates:
        logger.error("No rates could be fetched from BCB")
        return 1

    rows = [rate_to_row(rate) for rate in rates.values()]
    for row in rows:
        logger.info(
            f"{row['rate_type']}: {row['raw_value']} "
            f"({row['real_world_date']}, {row['source']})"
        )

    missing = set(RATE_CONFIGS) - set(rates)
    if missing:
        logger.warning(f"Missing rates this run: {[r.value for r in missing]}")

    if dry_run:
        logger.info(f"DRY_RUN: skipping upsert of {len(rows)} rows")
        return 0

    await upsert_rates(rows, supabase_url, service_role_key)
    logger.info(f"Upserted {len(rows)} rates into Supabase")
    return 0


def main() -> None:
    setup_logging(log_level="INFO", json_format=False)
    sys.exit(asyncio.run(sync()))


if __name__ == "__main__":
    main()
