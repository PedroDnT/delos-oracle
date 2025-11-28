"""
BCB API Client - Brazilian Macro Data Oracle
Fetches Brazilian macroeconomic indicators from Banco Central do Brasil's open data API.

Standards Compliance:
- Chainlink AggregatorV3Interface: 8 decimals for fiat-denominated feeds (USD standard)
- ISO 4217: BRL has 2 minor unit decimals
- Financial Industry: Basis points (bps) = 1/100th of 1% = 0.01% = 0.0001

Supported Rates:
| Rate  | BCB Series | Type           | Decimals | Description                          |
|-------|------------|----------------|----------|--------------------------------------|
| IPCA  | 433        | Inflation %    | 8        | Consumer price index, monthly YoY    |
| CDI   | 12         | Interest Rate  | 8        | Interbank deposit rate, annualized   |
| SELIC | 432        | Interest Rate  | 8        | Central bank target rate             |
| PTAX  | 1          | FX Rate        | 8        | USD/BRL official exchange rate       |
| IGPM  | 189        | Inflation %    | 8        | General market price index, monthly  |
| TR    | 226        | Interest Rate  | 8        | Reference rate for savings           |

Chainlink Decimal Convention:
- USD pairs: 8 decimals (e.g., ETH/USD returns 140330173736 = $1,403.30173736)
- ETH pairs: 18 decimals
- We use 8 decimals for all rates to match Chainlink USD feed convention

Value Encoding:
- 4.50% interest rate → 450000000 (4.5 * 10^8)
- 5.1234 BRL/USD     → 512340000 (5.1234 * 10^8)

API Documentation: https://dadosabertos.bcb.gov.br/
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTS & STANDARDS
# =============================================================================

# Chainlink standard: 8 decimals for fiat-denominated feeds
CHAINLINK_DECIMALS = 8
CHAINLINK_PRECISION = 10 ** CHAINLINK_DECIMALS  # 100,000,000

# ISO 4217: BRL minor unit decimals
ISO_4217_BRL_DECIMALS = 2


class RateType(str, Enum):
    """
    Supported Brazilian macro rate types.
    
    Each rate maps to a BCB API series code and has specific characteristics
    for update frequency and expected value ranges.
    """
    IPCA = "IPCA"      # Inflation: monthly, typically -1% to 2%
    CDI = "CDI"        # Interest: daily, typically 0% to 30%
    SELIC = "SELIC"    # Interest: daily, typically 0% to 30%
    PTAX = "PTAX"      # FX: daily, typically 1.0 to 10.0 BRL/USD
    IGPM = "IGPM"      # Inflation: monthly, typically -2% to 3%
    TR = "TR"          # Interest: daily, typically 0% to 5%


@dataclass(frozen=True)
class RateConfig:
    """
    Configuration for each rate type following Chainlink and financial standards.
    """
    bcb_series: int           # BCB API series code
    description: str          # Human-readable description
    decimals: int             # Chainlink decimals (always 8 for fiat)
    heartbeat_seconds: int    # Max expected time between updates
    min_value: int            # Circuit breaker: min (scaled by 10^8)
    max_value: int            # Circuit breaker: max (scaled by 10^8)
    is_percentage: bool       # True if value is a percentage rate
    update_frequency: str     # "daily" or "monthly"
    

# Rate configurations with Chainlink-compatible parameters
RATE_CONFIGS: Dict[RateType, RateConfig] = {
    RateType.IPCA: RateConfig(
        bcb_series=433,
        description="IPCA - Brazilian Consumer Price Index (Monthly YoY %)",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=35 * 24 * 3600,  # 35 days
        min_value=-10_00000000,            # -10% (scaled)
        max_value=100_00000000,            # 100% (scaled)
        is_percentage=True,
        update_frequency="monthly"
    ),
    RateType.CDI: RateConfig(
        bcb_series=12,
        description="CDI - Interbank Deposit Rate (Annualized %)",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=2 * 24 * 3600,   # 2 days
        min_value=0,                       # 0%
        max_value=50_00000000,             # 50%
        is_percentage=True,
        update_frequency="daily"
    ),
    RateType.SELIC: RateConfig(
        bcb_series=432,
        description="SELIC - Central Bank Target Rate (%)",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=2 * 24 * 3600,   # 2 days
        min_value=0,                       # 0%
        max_value=50_00000000,             # 50%
        is_percentage=True,
        update_frequency="daily"
    ),
    RateType.PTAX: RateConfig(
        bcb_series=1,
        description="PTAX - Official USD/BRL Exchange Rate",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=2 * 24 * 3600,   # 2 days
        min_value=1_00000000,              # 1.0 BRL/USD
        max_value=15_00000000,             # 15.0 BRL/USD
        is_percentage=False,
        update_frequency="daily"
    ),
    RateType.IGPM: RateConfig(
        bcb_series=189,
        description="IGP-M - General Market Price Index (Monthly %)",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=35 * 24 * 3600,  # 35 days
        min_value=-10_00000000,            # -10%
        max_value=100_00000000,            # 100%
        is_percentage=True,
        update_frequency="monthly"
    ),
    RateType.TR: RateConfig(
        bcb_series=226,
        description="TR - Reference Rate (%)",
        decimals=CHAINLINK_DECIMALS,
        heartbeat_seconds=2 * 24 * 3600,   # 2 days
        min_value=0,                       # 0%
        max_value=50_00000000,             # 50%
        is_percentage=True,
        update_frequency="daily"
    ),
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class RateData:
    """
    Processed rate data ready for on-chain submission.
    
    Follows Chainlink AggregatorV3Interface conventions:
    - answer: int256 scaled by 10^decimals
    - decimals: uint8 (always 8 for fiat feeds)
    - updatedAt: uint256 timestamp
    
    Attributes:
        rate_type: Type of rate (IPCA, CDI, etc.)
        answer: Chainlink-compatible scaled integer value (10^8 precision)
        raw_value: Original float value from BCB
        decimals: Number of decimal places (always 8)
        real_world_date: BCB reference date as YYYYMMDD integer
        real_world_date_str: Original date string from BCB
        timestamp: Python datetime of the data point
        source: Data source identifier (e.g., "BCB-433")
        description: Human-readable description
    """
    rate_type: RateType
    answer: int                    # Chainlink-compatible: scaled by 10^8
    raw_value: float               # Original BCB value
    decimals: int                  # Always 8 for Chainlink compatibility
    real_world_date: int           # YYYYMMDD format for on-chain storage
    real_world_date_str: str       # Original BCB date string
    timestamp: datetime            # Python datetime
    source: str                    # "BCB-{series_code}"
    description: str               # Rate description
    
    @property
    def answer_as_percentage(self) -> float:
        """Convert answer back to percentage for display."""
        return self.answer / CHAINLINK_PRECISION
    
    @property
    def answer_as_basis_points(self) -> int:
        """
        Convert to basis points (1 bp = 0.01% = 0.0001).
        Common in fixed income: 450 bps = 4.50%
        """
        # answer is percentage * 10^8, so divide by 10^6 to get bps
        return self.answer // (10 ** 6)
    
    def to_chainlink_format(self) -> Dict[str, Any]:
        """
        Format for Chainlink AggregatorV3Interface.latestRoundData() response.
        
        Returns dict matching:
        - roundId: uint80
        - answer: int256
        - startedAt: uint256
        - updatedAt: uint256
        - answeredInRound: uint80
        """
        ts = int(self.timestamp.timestamp())
        return {
            "roundId": 0,  # Set by contract
            "answer": self.answer,
            "startedAt": ts,
            "updatedAt": ts,
            "answeredInRound": 0,  # Set by contract
        }
    
    def to_oracle_update_params(self) -> Dict[str, Any]:
        """
        Format for BrazilianMacroOracle.updateAnswer() call.
        """
        return {
            "rateType": self.rate_type.value,
            "answer": self.answer,
            "realWorldDate": self.real_world_date,
            "source": self.source,
        }


# =============================================================================
# EXCEPTIONS
# =============================================================================

class BCBClientError(Exception):
    """Base exception for BCB client errors."""
    pass


class BCBAPIError(BCBClientError):
    """API request failed."""
    pass


class BCBParseError(BCBClientError):
    """Failed to parse API response."""
    pass


class BCBNoDataError(BCBClientError):
    """No data available for requested period."""
    pass


class BCBValidationError(BCBClientError):
    """Data validation failed (circuit breaker)."""
    pass


# =============================================================================
# BCB CLIENT
# =============================================================================

class BCBClient:
    """
    Client for fetching macroeconomic data from Banco Central do Brasil API.
    
    Transforms BCB data into Chainlink-compatible format with 8 decimal precision.
    
    Usage:
        async with BCBClient() as client:
            # Get latest CDI rate
            cdi = await client.fetch_latest(RateType.CDI)
            print(f"CDI: {cdi.raw_value}% -> {cdi.answer} (8 decimals)")
            print(f"CDI in bps: {cdi.answer_as_basis_points}")
            
            # Get oracle update params
            params = cdi.to_oracle_update_params()
            # -> {'rateType': 'CDI', 'answer': 1090000000, 'realWorldDate': 20241126, 'source': 'BCB-12'}
    
    Standards:
        - Chainlink: 8 decimals for fiat feeds
        - ISO 4217: BRL = 986, 2 minor units
        - Financial: Basis points for rate changes
    """
    
    BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados"
    TIMEOUT = 30.0
    
    def __init__(self, timeout: float = TIMEOUT, validate: bool = True):
        """
        Initialize BCB client.
        
        Args:
            timeout: HTTP request timeout in seconds
            validate: Enable circuit breaker validation
        """
        self.timeout = timeout
        self.validate = validate
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self) -> "BCBClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
    
    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    # =========================================================================
    # URL BUILDING
    # =========================================================================
    
    def _build_url(
        self, 
        rate_type: RateType, 
        count: Optional[int] = None,
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> str:
        """
        Build BCB API URL.
        
        Args:
            rate_type: Type of rate to fetch
            count: Number of most recent records
            start_date: Start date in DD/MM/YYYY format
            end_date: End date in DD/MM/YYYY format
            
        Returns:
            Full API URL
        """
        config = RATE_CONFIGS[rate_type]
        base = self.BASE_URL.format(series=config.bcb_series)
        
        if count:
            return f"{base}/ultimos/{count}?formato=json"
        elif start_date and end_date:
            return f"{base}?formato=json&dataInicial={start_date}&dataFinal={end_date}"
        else:
            return f"{base}?formato=json"
    
    # =========================================================================
    # PARSING & TRANSFORMATION
    # =========================================================================
    
    def _parse_bcb_date(self, date_str: str) -> tuple[int, datetime]:
        """
        Parse BCB date format (DD/MM/YYYY) to integer and datetime.
        
        Args:
            date_str: Date in DD/MM/YYYY format
            
        Returns:
            Tuple of (YYYYMMDD integer, datetime object)
            
        Raises:
            BCBParseError: Invalid date format
        """
        try:
            dt = datetime.strptime(date_str, "%d/%m/%Y")
            date_int = int(dt.strftime("%Y%m%d"))
            return date_int, dt
        except ValueError as e:
            raise BCBParseError(f"Invalid date format '{date_str}': {e}") from e
    
    def _scale_to_chainlink(self, value: float) -> int:
        """
        Scale a float value to Chainlink 8-decimal integer format.
        
        Chainlink Convention:
        - USD feeds use 8 decimals
        - 4.50% becomes 450000000 (4.5 * 10^8)
        - 5.1234 BRL/USD becomes 512340000 (5.1234 * 10^8)
        
        Args:
            value: Raw float value from BCB
            
        Returns:
            Scaled integer with 8 decimal precision
        """
        # Use round() to handle floating point precision issues
        return int(round(value * CHAINLINK_PRECISION))
    
    def _validate_value(self, rate_type: RateType, scaled_value: int, raw_value: float) -> None:
        """
        Validate value against circuit breaker bounds.
        
        Args:
            rate_type: Type of rate
            scaled_value: Chainlink-scaled value
            raw_value: Original value for error message
            
        Raises:
            BCBValidationError: Value outside acceptable range
        """
        if not self.validate:
            return
            
        config = RATE_CONFIGS[rate_type]
        
        if scaled_value < config.min_value:
            raise BCBValidationError(
                f"{rate_type.value} value {raw_value} below minimum "
                f"({config.min_value / CHAINLINK_PRECISION})"
            )
        
        if scaled_value > config.max_value:
            raise BCBValidationError(
                f"{rate_type.value} value {raw_value} above maximum "
                f"({config.max_value / CHAINLINK_PRECISION})"
            )
    
    def _process_response(self, data: List[Dict], rate_type: RateType) -> List[RateData]:
        """
        Process raw BCB API response into Chainlink-compatible RateData objects.
        
        BCB Format: {"data": "26/11/2024", "valor": "10.90"}
        Output: RateData with answer=1090000000 (8 decimals)
        
        Args:
            data: Raw JSON response from BCB API
            rate_type: Type of rate
            
        Returns:
            List of RateData, sorted by date descending (most recent first)
        """
        results = []
        config = RATE_CONFIGS[rate_type]
        
        for item in data:
            try:
                # Parse date
                date_int, dt = self._parse_bcb_date(item["data"])
                
                # Parse and scale value
                # BCB uses comma as decimal separator in some locales
                raw_str = str(item["valor"]).replace(",", ".")
                raw_value = float(raw_str)
                
                # Scale to Chainlink 8-decimal format
                scaled_value = self._scale_to_chainlink(raw_value)
                
                # Validate against circuit breakers
                self._validate_value(rate_type, scaled_value, raw_value)
                
                results.append(RateData(
                    rate_type=rate_type,
                    answer=scaled_value,
                    raw_value=raw_value,
                    decimals=CHAINLINK_DECIMALS,
                    real_world_date=date_int,
                    real_world_date_str=item["data"],
                    timestamp=dt,
                    source=f"BCB-{config.bcb_series}",
                    description=config.description,
                ))
                
            except BCBValidationError:
                raise  # Re-raise validation errors
            except BCBParseError as e:
                logger.warning(f"Skipping invalid record for {rate_type.value}: {e}")
                continue
            except (KeyError, TypeError, ValueError) as e:
                logger.warning(f"Skipping malformed record for {rate_type.value}: {e}")
                continue
        
        # Sort by date descending (most recent first)
        results.sort(key=lambda x: x.real_world_date, reverse=True)
        return results
    
    # =========================================================================
    # HTTP REQUESTS
    # =========================================================================
    
    async def _request(self, url: str) -> List[Dict]:
        """
        Make HTTP request to BCB API.
        
        Args:
            url: Full API URL
            
        Returns:
            Parsed JSON response
            
        Raises:
            BCBAPIError: Request failed
            BCBNoDataError: Empty response
        """
        client = self._get_client()
        
        try:
            logger.debug(f"BCB API Request: {url}")
            response = await client.get(url)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                raise BCBNoDataError(f"Empty response from BCB API: {url}")
            
            return data
            
        except httpx.HTTPStatusError as e:
            raise BCBAPIError(
                f"BCB API HTTP {e.response.status_code}: {e.response.text}"
            ) from e
        except httpx.RequestError as e:
            raise BCBAPIError(f"BCB API request failed: {e}") from e
        except ValueError as e:
            raise BCBParseError(f"Invalid JSON from BCB API: {e}") from e
    
    # =========================================================================
    # PUBLIC API
    # =========================================================================
    
    async def fetch_latest(self, rate_type: RateType) -> RateData:
        """
        Fetch the most recent value for a rate.
        
        Args:
            rate_type: Type of rate to fetch
            
        Returns:
            Most recent RateData in Chainlink format
            
        Raises:
            BCBNoDataError: No data available
            BCBValidationError: Value failed circuit breaker
        """
        url = self._build_url(rate_type, count=1)
        data = await self._request(url)
        results = self._process_response(data, rate_type)
        
        if not results:
            raise BCBNoDataError(f"No valid data for {rate_type.value}")
        
        result = results[0]
        logger.info(
            f"Fetched {rate_type.value}: {result.raw_value} -> "
            f"{result.answer} (8 dec) | {result.real_world_date_str}"
        )
        return result
    
    async def fetch_history(
        self, 
        rate_type: RateType, 
        count: int = 10
    ) -> List[RateData]:
        """
        Fetch historical values for a rate.
        
        Args:
            rate_type: Type of rate to fetch
            count: Number of records to fetch
            
        Returns:
            List of RateData, most recent first
        """
        url = self._build_url(rate_type, count=count)
        data = await self._request(url)
        results = self._process_response(data, rate_type)
        
        logger.info(f"Fetched {len(results)} {rate_type.value} historical records")
        return results
    
    async def fetch_date_range(
        self, 
        rate_type: RateType,
        start_date: datetime, 
        end_date: datetime
    ) -> List[RateData]:
        """
        Fetch values for a specific date range.
        
        Args:
            rate_type: Type of rate to fetch
            start_date: Start of range
            end_date: End of range
            
        Returns:
            List of RateData, most recent first
        """
        start_str = start_date.strftime("%d/%m/%Y")
        end_str = end_date.strftime("%d/%m/%Y")
        
        url = self._build_url(rate_type, start_date=start_str, end_date=end_str)
        data = await self._request(url)
        results = self._process_response(data, rate_type)
        
        logger.info(
            f"Fetched {len(results)} {rate_type.value} records "
            f"({start_str} to {end_str})"
        )
        return results
    
    async def fetch_all_latest(self) -> Dict[RateType, RateData]:
        """
        Fetch latest values for all supported rates.
        
        Returns:
            Dictionary mapping rate types to their latest values
        """
        results = {}
        
        for rate_type in RateType:
            try:
                results[rate_type] = await self.fetch_latest(rate_type)
            except BCBClientError as e:
                logger.error(f"Failed to fetch {rate_type.value}: {e}")
                continue
        
        return results
    
    async def health_check(self) -> bool:
        """
        Check if BCB API is accessible.
        
        Returns:
            True if API is responding
        """
        try:
            await self.fetch_latest(RateType.CDI)
            return True
        except BCBClientError:
            return False
    
    @staticmethod
    def get_rate_config(rate_type: RateType) -> RateConfig:
        """Get configuration for a rate type."""
        return RATE_CONFIGS[rate_type]
    
    @staticmethod
    def get_all_rate_configs() -> Dict[RateType, RateConfig]:
        """Get all rate configurations."""
        return RATE_CONFIGS.copy()


# =============================================================================
# SYNCHRONOUS WRAPPER
# =============================================================================

class BCBClientSync:
    """
    Synchronous wrapper for BCBClient.
    
    Usage:
        client = BCBClientSync()
        cdi = client.fetch_latest(RateType.CDI)
        client.close()
    """
    
    def __init__(self, validate: bool = True):
        import asyncio
        self._loop = asyncio.new_event_loop()
        self._client = BCBClient(validate=validate)
    
    def _run(self, coro):
        return self._loop.run_until_complete(coro)
    
    def fetch_latest(self, rate_type: RateType) -> RateData:
        return self._run(self._client.fetch_latest(rate_type))
    
    def fetch_history(self, rate_type: RateType, count: int = 10) -> List[RateData]:
        return self._run(self._client.fetch_history(rate_type, count))
    
    def fetch_all_latest(self) -> Dict[RateType, RateData]:
        return self._run(self._client.fetch_all_latest())
    
    def health_check(self) -> bool:
        return self._run(self._client.health_check())
    
    def close(self) -> None:
        self._run(self._client.close())
        self._loop.close()


# =============================================================================
# CLI TESTING
# =============================================================================

if __name__ == "__main__":
    import asyncio
    
    async def main():
        print("\n" + "=" * 70)
        print("BCB CLIENT - Brazilian Macro Oracle Data Fetcher")
        print("Chainlink Compatible (8 decimals) | ISO 4217 Compliant")
        print("=" * 70)
        
        async with BCBClient() as client:
            # Fetch all latest rates
            print("\n📊 Fetching all Brazilian macro rates from BCB API...\n")
            rates = await client.fetch_all_latest()
            
            # Display in table format
            print(f"{'Rate':<6} | {'Raw Value':>12} | {'Chainlink (8 dec)':>18} | {'Basis Pts':>10} | {'Date':>12} | Source")
            print("-" * 85)
            
            for rate_type, data in rates.items():
                config = RATE_CONFIGS[rate_type]
                unit = "%" if config.is_percentage else "BRL"
                print(
                    f"{rate_type.value:<6} | "
                    f"{data.raw_value:>11.4f}{unit[0]} | "
                    f"{data.answer:>18,} | "
                    f"{data.answer_as_basis_points:>10,} | "
                    f"{data.real_world_date_str:>12} | "
                    f"{data.source}"
                )
            
            # Show Chainlink format example
            print("\n" + "=" * 70)
            print("📋 CHAINLINK FORMAT EXAMPLE (CDI)")
            print("=" * 70)
            
            if RateType.CDI in rates:
                cdi = rates[RateType.CDI]
                chainlink_data = cdi.to_chainlink_format()
                oracle_params = cdi.to_oracle_update_params()
                
                print(f"\nlatestRoundData() format:")
                for k, v in chainlink_data.items():
                    print(f"  {k}: {v}")
                
                print(f"\nupdateAnswer() params:")
                for k, v in oracle_params.items():
                    print(f"  {k}: {v}")
            
            # Show rate configs
            print("\n" + "=" * 70)
            print("⚙️  RATE CONFIGURATIONS")
            print("=" * 70)
            
            for rate_type, config in RATE_CONFIGS.items():
                print(f"\n{rate_type.value}:")
                print(f"  BCB Series: {config.bcb_series}")
                print(f"  Decimals: {config.decimals}")
                print(f"  Heartbeat: {config.heartbeat_seconds // 3600}h")
                print(f"  Min/Max: {config.min_value / CHAINLINK_PRECISION} / {config.max_value / CHAINLINK_PRECISION}")
            
            # Health check
            print(f"\n✅ BCB API Health: {'OK' if await client.health_check() else 'FAIL'}")
    
    asyncio.run(main())
"""

**Key Standards Applied:**

| Standard | Implementation |
|----------|----------------|
| **Chainlink** | 8 decimals for all fiat feeds (USD convention) |
| **ISO 4217** | BRL = 986, 2 minor units (documented) |
| **Basis Points** | 1 bp = 0.01% = 0.0001; helper method included |
| **Signed Values** | Supports negative rates (deflation, negative spreads) |

**Value Encoding Examples:**
```
CDI 10.90% → answer = 1,090,000,000 (10.9 * 10^8)
IPCA 0.56% → answer = 56,000,000 (0.56 * 10^8)
PTAX 5.81  → answer = 581,000,000 (5.81 * 10^8)

***Testing***

python bcb_client.py
expect:

BCB CLIENT - Brazilian Macro Oracle Data Fetcher
Chainlink Compatible (8 decimals) | ISO 4217 Compliant
====================================================

"""