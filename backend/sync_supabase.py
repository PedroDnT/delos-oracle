"""
Fetch the latest BCB rates and upsert them into Supabase.

This is the production data path: a scheduled GitHub Action runs this script,
and the dashboard reads the resulting rows straight from Supabase. There is no
long-running backend server.

Environment:
    SUPABASE_URL               https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  service-role key (writes bypass RLS; never ship
                               this to a browser)
    DRY_RUN                    if set, fetch and print, write nothing
    SUPABASE_UNREACHABLE_OK    if set, a DNS/connect failure after a successful
                               BCB fetch exits 0 instead of 1 (the destination
                               host is gone or misconfigured; the fetch itself
                               worked)

Usage:
    python sync_supabase.py            # fetch all rates and upsert
    DRY_RUN=1 python sync_supabase.py  # fetch and print, write nothing
"""

import asyncio
import os
import socket
import sys
from urllib.parse import urlparse

import httpx

from bcb_client import RATE_CONFIGS, BCBClient, RateData
from logging_config import get_logger, setup_logging

logger = get_logger(__name__)

UPSERT_ATTEMPTS = 3


def env_flag(name: str) -> bool:
    return os.environ.get(name, "") not in ("", "0", "false", "False")


def normalize_supabase_url(raw: str) -> str:
    """
    Turn a pasted project URL (or bare project ref) into an origin.

    GitHub secrets and variables commonly pick up surrounding quotes or a
    trailing newline from the UI; those make DNS lookup fail with
    "Name or service not known".
    """
    url = (raw or "").strip().strip('"').strip("'")
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    url = url.rstrip("/")
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip()
    if not host:
        return ""
    # A 20-char project ref pasted without a domain still needs .supabase.co.
    if "." not in host:
        host = f"{host}.supabase.co"
        url = f"https://{host}"
    return url


def supabase_hostname(url: str) -> str:
    return (urlparse(url).hostname or "").strip()


def supabase_host_resolves(url: str) -> bool:
    host = supabase_hostname(url)
    if not host:
        return False
    try:
        socket.getaddrinfo(host, 443)
        return True
    except OSError:
        return False


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
    endpoint = f"{normalize_supabase_url(supabase_url)}/rest/v1/rates"
    last_error: Exception | None = None
    for attempt in range(1, UPSERT_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    endpoint,
                    params={"on_conflict": "rate_type,real_world_date"},
                    json=rows,
                    headers={
                        "apikey": service_role_key,
                        "Authorization": f"Bearer {service_role_key}",
                        "Prefer": "resolution=merge-duplicates,return=minimal",
                    },
                )
                response.raise_for_status()
                return
        except httpx.ConnectError as exc:
            last_error = exc
            logger.warning(
                f"Supabase connect failed (attempt {attempt}/{UPSERT_ATTEMPTS}) "
                f"for {supabase_hostname(endpoint)}: {exc}"
            )
            if attempt < UPSERT_ATTEMPTS:
                await asyncio.sleep(2 ** (attempt - 1))
    assert last_error is not None
    raise last_error


async def sync() -> int:
    """Fetch all rates from BCB and store them. Returns a process exit code."""
    dry_run = env_flag("DRY_RUN")

    supabase_url = normalize_supabase_url(os.environ.get("SUPABASE_URL", ""))
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
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

    if not supabase_host_resolves(supabase_url):
        return _unreachable(
            supabase_url,
            "does not resolve (NXDOMAIN / Name or service not known)",
        )

    try:
        await upsert_rates(rows, supabase_url, service_role_key)
    except httpx.ConnectError as exc:
        return _unreachable(supabase_url, str(exc))

    logger.info(f"Upserted {len(rows)} rates into Supabase")
    return 0


def _unreachable(supabase_url: str, reason: str) -> int:
    host = supabase_hostname(supabase_url)
    logger.error(
        f"Supabase host {host!r} is unreachable: {reason}. "
        "Check SUPABASE_URL (strip quotes/newlines; the project URL is a "
        "repository variable, not a secret)."
    )
    if env_flag("SUPABASE_UNREACHABLE_OK"):
        logger.warning(
            "SUPABASE_UNREACHABLE_OK is set; BCB fetch succeeded so this "
            "run exits 0. Rates were not written."
        )
        return 0
    return 1


def main() -> None:
    setup_logging(log_level="INFO", json_format=False)
    sys.exit(asyncio.run(sync()))


if __name__ == "__main__":
    main()
