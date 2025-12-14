# DELOS REST API Reference

## Overview

The DELOS REST API provides programmatic access to Brazilian macroeconomic indicators from the BrazilianMacroOracle smart contract and supporting backend services.

**Base URL:** `http://localhost:8000`
**API Documentation (Swagger):** `http://localhost:8000/docs`
**ReDoc:** `http://localhost:8000/redoc`

## Authentication

Currently, the API does not require authentication. For production deployments, implement API key or OAuth2 authentication.

## Rate Limiting

No rate limiting is currently enforced. For production, consider implementing rate limiting to prevent abuse.

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource does not exist |
| 500 | Internal Server Error |
| 502 | Bad Gateway - BCB API error |

---

## Endpoints

### Health

#### GET /health

Check system health status.

**Response Schema:**
```json
{
  "status": "string",           // "healthy" | "degraded" | "unhealthy"
  "bcb_api": true,              // BCB API accessibility
  "oracle_connection": true,    // Blockchain connection
  "scheduler_running": true,    // Scheduler daemon status
  "last_update": "string|null", // ISO 8601 timestamp
  "version": "1.0.0"
}
```

**Example Response:**
```json
{
  "status": "healthy",
  "bcb_api": true,
  "oracle_connection": true,
  "scheduler_running": true,
  "last_update": null,
  "version": "1.0.0"
}
```

**Status Levels:**
- `healthy`: All systems operational
- `degraded`: Some systems unavailable but core functionality works
- `unhealthy`: Critical systems down

---

### Rates

#### GET /rates

Get all current rates from the oracle contract.

**Response Schema:**
```json
[
  {
    "rate_type": "string",
    "answer": 0,                 // Chainlink-scaled value (10^8)
    "raw_value": 0.0,            // Human-readable value
    "real_world_date": 0,        // YYYYMMDD format
    "timestamp": 0,              // Unix timestamp
    "source": "string",          // e.g., "BCB-433"
    "is_stale": false,
    "heartbeat_seconds": 0
  }
]
```

**Example Response:**
```json
[
  {
    "rate_type": "IPCA",
    "answer": 56000000,
    "raw_value": 0.56,
    "real_world_date": 20241101,
    "timestamp": 1732636800,
    "source": "BCB-433",
    "is_stale": false,
    "heartbeat_seconds": 3024000
  },
  {
    "rate_type": "CDI",
    "answer": 1090000000,
    "raw_value": 10.9,
    "real_world_date": 20241126,
    "timestamp": 1732636800,
    "source": "BCB-12",
    "is_stale": false,
    "heartbeat_seconds": 172800
  }
]
```

---

#### GET /rates/{rate_type}

Get a specific rate from the oracle contract.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| rate_type | string | Rate type: IPCA, CDI, SELIC, PTAX, IGPM, TR |

**Response Schema:**
```json
{
  "rate_type": "string",
  "answer": 0,
  "raw_value": 0.0,
  "real_world_date": 0,
  "timestamp": 0,
  "source": "string",
  "is_stale": false,
  "heartbeat_seconds": 0
}
```

**Example Request:**
```bash
curl http://localhost:8000/rates/CDI
```

**Example Response:**
```json
{
  "rate_type": "CDI",
  "answer": 1090000000,
  "raw_value": 10.9,
  "real_world_date": 20241126,
  "timestamp": 1732636800,
  "source": "BCB-12",
  "is_stale": false,
  "heartbeat_seconds": 172800
}
```

**Error Response (400):**
```json
{
  "detail": "Invalid rate type. Valid types: ['IPCA', 'CDI', 'SELIC', 'PTAX', 'IGPM', 'TR']"
}
```

---

#### GET /rates/{rate_type}/history

Get historical rates from local storage.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| rate_type | string | Rate type: IPCA, CDI, SELIC, PTAX, IGPM, TR |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| days | integer | 30 | Number of days of history (1-365) |

**Response Schema:**
```json
{
  "rate_type": "string",
  "history": [
    {
      "rate_type": "string",
      "answer": 0,
      "raw_value": 0.0,
      "real_world_date": 0,
      "timestamp": 0,
      "source": "string",
      "is_stale": false,
      "heartbeat_seconds": 0
    }
  ],
  "count": 0
}
```

**Example Request:**
```bash
curl "http://localhost:8000/rates/IPCA/history?days=30"
```

---

### Sync

#### POST /sync

Manually trigger rate synchronization from BCB to oracle.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| rate_type | string | null | Specific rate to sync (optional) |
| force | boolean | false | Force update even if same date |

**Response Schema:**
```json
{
  "success": true,
  "rates_updated": 0,
  "rates_skipped": 0,
  "rates_failed": 0,
  "anomalies_detected": 0,
  "tx_hash": "string|null",
  "error": "string|null"
}
```

**Example Request (All Rates):**
```bash
curl -X POST http://localhost:8000/sync
```

**Example Request (Specific Rate):**
```bash
curl -X POST "http://localhost:8000/sync?rate_type=CDI"
```

**Example Response:**
```json
{
  "success": true,
  "rates_updated": 4,
  "rates_skipped": 2,
  "rates_failed": 0,
  "anomalies_detected": 0,
  "tx_hash": "0x1234567890abcdef...",
  "error": null
}
```

---

### Scheduler

#### GET /scheduler/jobs

Get all scheduled jobs and their next run times.

**Response Schema:**
```json
[
  {
    "id": "string",
    "name": "string",
    "next_run": "string|null",  // ISO 8601
    "trigger": "string"
  }
]
```

**Example Response:**
```json
[
  {
    "id": "daily_rates",
    "name": "Daily Rate Update (CDI, SELIC, PTAX, TR)",
    "next_run": "2024-11-27T19:00:00-03:00",
    "trigger": "cron[hour='19', minute='0', day_of_week='mon-fri']"
  },
  {
    "id": "monthly_rates",
    "name": "Monthly Rate Update (IPCA, IGPM)",
    "next_run": "2024-12-10T10:00:00-03:00",
    "trigger": "cron[day='10', hour='10', minute='0']"
  },
  {
    "id": "stale_check",
    "name": "Stale Data Check",
    "next_run": "2024-11-27T16:00:00-03:00",
    "trigger": "cron[hour='*/4']"
  }
]
```

---

#### GET /scheduler/runs

Get recent scheduler job runs.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | integer | 20 | Number of runs to return (1-100) |

**Response Schema:**
```json
[
  {
    "id": 0,
    "job_id": "string",
    "started_at": "string",    // ISO 8601
    "ended_at": "string|null", // ISO 8601
    "status": "string",        // "running" | "completed" | "failed"
    "rates_processed": 0,
    "rates_updated": 0,
    "error_message": "string|null"
  }
]
```

**Example Request:**
```bash
curl "http://localhost:8000/scheduler/runs?limit=10"
```

---

### BCB Direct

#### GET /bcb/latest/{rate_type}

Fetch latest rate directly from BCB API (bypasses oracle).

Useful for debugging and comparing with on-chain data.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| rate_type | string | Rate type: IPCA, CDI, SELIC, PTAX, IGPM, TR |

**Response Schema:**
```json
{
  "rate_type": "string",
  "answer": 0,
  "raw_value": 0.0,
  "real_world_date": 0,
  "real_world_date_str": "string",  // Original DD/MM/YYYY format
  "source": "string",
  "description": "string",
  "timestamp": "string"             // ISO 8601
}
```

**Example Request:**
```bash
curl http://localhost:8000/bcb/latest/SELIC
```

**Example Response:**
```json
{
  "rate_type": "SELIC",
  "answer": 1125000000,
  "raw_value": 11.25,
  "real_world_date": 20241126,
  "real_world_date_str": "26/11/2024",
  "source": "BCB-432",
  "description": "SELIC - Central Bank Target Rate (%)",
  "timestamp": "2024-11-26T00:00:00"
}
```

**Error Response (502):**
```json
{
  "detail": "BCB API error: Connection timeout"
}
```

---

### Anomalies

#### GET /anomalies

Get detected anomalies from the database.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| rate_type | string | null | Filter by rate type (optional) |
| days | integer | 7 | Number of days to look back (1-90) |
| limit | integer | 100 | Maximum records to return (1-500) |

**Response Schema:**
```json
[
  {
    "id": 0,
    "rate_type": "string",
    "detected_at": "string",       // ISO 8601
    "anomaly_type": "string",      // "value_spike" | "stale_data" | "velocity"
    "current_value": 0.0,
    "expected_range_low": 0.0,
    "expected_range_high": 0.0,
    "std_devs": 0.0,               // Z-score
    "message": "string"
  }
]
```

**Anomaly Types:**
| Type | Description |
|------|-------------|
| value_spike | Value > N standard deviations from mean |
| stale_data | Data age exceeds heartbeat threshold |
| velocity | Rate of change exceeds threshold |

**Example Request:**
```bash
curl "http://localhost:8000/anomalies?rate_type=CDI&days=7"
```

**Example Response:**
```json
[
  {
    "id": 1,
    "rate_type": "CDI",
    "detected_at": "2024-11-26T19:00:00",
    "anomaly_type": "value_spike",
    "current_value": 15.5,
    "expected_range_low": 10.2,
    "expected_range_high": 11.8,
    "std_devs": 4.2,
    "message": "Value 15.50 is 4.20 std devs above mean 11.00 (threshold: 3.0)"
  }
]
```

---

### Stats

#### GET /stats

Get database statistics.

**Response Schema:**
```json
{
  "rates_count": 0,
  "oracle_updates_count": 0,
  "anomalies_count": 0,
  "scheduler_runs_count": 0,
  "database_path": "string"
}
```

**Example Response:**
```json
{
  "rates_count": 180,
  "oracle_updates_count": 30,
  "anomalies_count": 2,
  "scheduler_runs_count": 15,
  "database_path": "data/rates.db"
}
```

---

## Data Models

### RateResponse

```typescript
interface RateResponse {
  rate_type: string;           // "IPCA" | "CDI" | "SELIC" | "PTAX" | "IGPM" | "TR"
  answer: number;              // Chainlink-scaled value (10^8)
  raw_value: number;           // Human-readable value
  real_world_date: number;     // YYYYMMDD format
  timestamp: number;           // Unix timestamp
  source: string;              // "BCB-{series}"
  is_stale: boolean;           // True if exceeds heartbeat
  heartbeat_seconds?: number;  // Expected max age
}
```

### SyncResponse

```typescript
interface SyncResponse {
  success: boolean;
  rates_updated: number;
  rates_skipped: number;
  rates_failed?: number;
  anomalies_detected?: number;
  tx_hash?: string;            // Blockchain transaction hash
  error?: string;
}
```

### AnomalyResponse

```typescript
interface AnomalyResponse {
  id: number;
  rate_type: string;
  detected_at: string;         // ISO 8601
  anomaly_type: string;        // "value_spike" | "stale_data" | "velocity"
  current_value: number;
  expected_range_low: number;
  expected_range_high: number;
  std_devs: number;            // Z-score
  message: string;
}
```

---

## Code Examples

### Python

```python
import httpx
import asyncio

API_URL = "http://localhost:8000"

async def main():
    async with httpx.AsyncClient() as client:
        # Health check
        health = await client.get(f"{API_URL}/health")
        print(f"Status: {health.json()['status']}")

        # Get all rates
        rates = await client.get(f"{API_URL}/rates")
        for rate in rates.json():
            print(f"{rate['rate_type']}: {rate['raw_value']}")

        # Get specific rate
        cdi = await client.get(f"{API_URL}/rates/CDI")
        print(f"CDI: {cdi.json()['raw_value']}%")

        # Get history
        history = await client.get(f"{API_URL}/rates/IPCA/history?days=30")
        print(f"IPCA records: {history.json()['count']}")

        # Manual sync
        sync = await client.post(f"{API_URL}/sync?rate_type=CDI")
        print(f"Sync result: {sync.json()}")

asyncio.run(main())
```

### JavaScript/TypeScript

```typescript
const API_URL = 'http://localhost:8000';

async function getRates() {
  // Get all rates
  const response = await fetch(`${API_URL}/rates`);
  const rates = await response.json();

  for (const rate of rates) {
    console.log(`${rate.rate_type}: ${rate.raw_value}%`);
  }
}

async function syncRate(rateType: string) {
  const response = await fetch(`${API_URL}/sync?rate_type=${rateType}`, {
    method: 'POST',
  });
  const result = await response.json();
  console.log(`Updated: ${result.rates_updated}, Skipped: ${result.rates_skipped}`);
}

async function checkAnomalies() {
  const response = await fetch(`${API_URL}/anomalies?days=7`);
  const anomalies = await response.json();

  for (const anomaly of anomalies) {
    console.log(`[${anomaly.anomaly_type}] ${anomaly.rate_type}: ${anomaly.message}`);
  }
}
```

### cURL

```bash
# Health check
curl http://localhost:8000/health

# Get all rates
curl http://localhost:8000/rates

# Get specific rate
curl http://localhost:8000/rates/CDI

# Get rate history
curl "http://localhost:8000/rates/IPCA/history?days=30"

# Manual sync
curl -X POST http://localhost:8000/sync

# Sync specific rate
curl -X POST "http://localhost:8000/sync?rate_type=CDI"

# Get scheduler jobs
curl http://localhost:8000/scheduler/jobs

# Get anomalies
curl "http://localhost:8000/anomalies?days=7"

# Get stats
curl http://localhost:8000/stats

# Direct BCB fetch
curl http://localhost:8000/bcb/latest/SELIC
```

---

## Error Handling

### Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common Errors

#### Invalid Rate Type (400)
```json
{
  "detail": "Invalid rate type. Valid types: ['IPCA', 'CDI', 'SELIC', 'PTAX', 'IGPM', 'TR']"
}
```

#### Rate Not Found (404)
```json
{
  "detail": "Rate CDI not found in oracle"
}
```

#### BCB API Error (502)
```json
{
  "detail": "BCB API error: Connection timeout"
}
```

#### Internal Server Error (500)
```json
{
  "detail": "Internal error message"
}
```

---

## Rate Limits and Best Practices

1. **Polling Frequency**: Poll `/rates` no more than once per minute
2. **History Requests**: Limit history requests to reasonable date ranges (30-90 days)
3. **Sync Requests**: Avoid frequent manual sync calls; let scheduler handle updates
4. **Error Handling**: Implement exponential backoff for retries
5. **Caching**: Consider caching responses on the client side for 30-60 seconds

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial API release |
