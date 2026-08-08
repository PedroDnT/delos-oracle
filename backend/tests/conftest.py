"""
Shared pytest fixtures for the DELOS backend test suite.

The backend modules are top-level (``bcb_client``, ``api``, ``services.*``),
so the backend directory has to be importable regardless of where pytest is
invoked from.
"""

import os
import sys
from datetime import datetime

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from bcb_client import CHAINLINK_DECIMALS, BCBClient, RateData, RateType  # noqa: E402


@pytest.fixture
def bcb_client() -> BCBClient:
    """A BCB client with circuit-breaker validation enabled."""
    return BCBClient()


@pytest.fixture
def bcb_client_no_validation() -> BCBClient:
    """A BCB client with circuit-breaker validation disabled."""
    return BCBClient(validate=False)


@pytest.fixture
def bcb_payload() -> list:
    """A response payload in the shape the BCB SGS API actually returns."""
    return [
        {"data": "01/11/2024", "valor": "10.85"},
        {"data": "16/11/2024", "valor": "10.90"},
    ]


@pytest.fixture
def cdi_rate_data() -> RateData:
    """A ready-made RateData instance for CDI at 10.90%."""
    return RateData(
        rate_type=RateType.CDI,
        answer=1_090_000_000,
        raw_value=10.90,
        decimals=CHAINLINK_DECIMALS,
        real_world_date=20241116,
        real_world_date_str="16/11/2024",
        timestamp=datetime(2024, 11, 16),
        source="BCB-12",
        description="CDI - Interbank Deposit Rate (Annualized %)",
    )
