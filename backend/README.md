# UK Wind Forecast Accuracy Portal — Backend

A specialized Python FastAPI backend providing UK day-ahead wind forecast accuracy analysis and decision-time forecasting for energy trading teams.

Built using historical **Elexon BMRS** datasets for January 2026 delivery days (`2026-01-01T00:00:00Z` to `2026-02-01T00:00:00Z`).

---

## 1. Project Overview & Domain Logic

### The Decision-Time Problem
Electricity buyers in the UK day-ahead power market make commitment and procurement decisions for delivery day **D** on day **D-1** prior to the market gate closure. To evaluate the true risk of wind generation shortfalls or surpluses, traders need to evaluate the **latest forecast published before their decision cutoff**, rather than the final outturn forecast published minutes before delivery.

### Key Rules & Cutoff Assumption
1. **Decision Cutoff Assumption**:
   - For every 30-minute delivery slot $ on delivery day $, the default day-ahead cutoff is defined as:
     2758\text{cutoff} = (D - 1\ \text{day})\ \text{at}\ \text{09:00 UTC}2758
   - **The 09:00 UTC cutoff is an explicit operating assumption** representing the morning trading desk workflow ahead of the day-ahead auction (EPEX SPOT / Nord Pool).
   - The cutoff time is fully configurable via query parameters (`?cutoff=HH:MM`) or environment configuration (`DEFAULT_CUTOFF`).
2. **WINDFOR Hourly Granularity & Forward Fill**:
   - Elexon BMRS `WINDFOR` forecasts publish at hourly intervals (`:00`).
   - For half-hourly settlement periods, the hourly forecast is carried forward to its subsequent `:30` slot (`forward_fill_hourly_forecasts`, max 30 minutes, preserving the identical `publish_time`).
3. **Forecast Selection**:
   - For delivery slot $, candidate forecasts must satisfy $\text{publish\_time} \le \text{cutoff}$.
   - The candidate with the latest `publish_time` is selected.
   - If no forecast exists prior to cutoff, the forecast is returned as `null` (never `0`).
4. **Accuracy Metrics & Planning Band**:
   - $\text{error} = \text{forecast} - \text{actual}$ (positive = over-forecast, negative = under-forecast).
   - $\text{MAE} = \text{mean}(|\text{error}|)$, $\text{RMSE} = \sqrt{\text{mean}(\text{error}^2)}$, $\text{Bias} = \text{mean}(\text{error})$.
   - $\text{MAPE} = \text{mean}(|\text{error}| / \text{actual}) \times 100$, strictly excluding rows where $\text{actual} = 0$.
   - **Planning Band**: per slot, $\text{band\_low} = \max(0, \text{forecast} - P90(\text{error}))$ and $\text{band\_high} = \text{forecast} - P10(\text{error})$, derived from the selected range's error percentiles.
   - **By Horizon Analysis**: joins all historical forecasts to actuals, excludes $\text{horizon\_hours} < 0$, and groups errors into horizon buckets (`0-6`, `6-12`, `12-24`, `24-36`, `36-48`, `48+`).

---

## 2. Architecture & Design Decisions

```
[OFFLINE INGEST]
Elexon BMRS API ---> scripts/ingest.py ---> backend/data/actuals.parquet   (1,488 rows)
                                       ---> backend/data/forecasts.parquet (18,080 rows)
                                                    |
[RUNTIME ARCHITECTURE]                              v
Client ---> FastAPI Routes ---> In-Memory Cache ---> DataStore (Loaded once at startup)
                 |                     |                      |
                 v                     v                      v
            Validation           decision_time             metrics
```

- **No Database**: January 2026 is closed historical data. An immutable snapshot of cleaned Parquet files (committed to `backend/data/`) is loaded into pandas once at application startup.
- **Zero Runtime Elexon Calls**: The web service is fully decoupled from external Elexon API rate limits or downtime.
- **Stateless & Scalable**: In-memory caching and vectorised pandas operations ensure full-month queries resolve in under 35 ms.
- **Strict One-Way Dependency**: `routes -> services -> data_store`. Services remain agnostic to HTTP layers.
- **Missing Data Contract**: Missing forecasts or actuals are emitted as JSON `null`, never `NaN`, `Infinity`, or `0`.
- **Production Path**: In a live multi-month production environment, an automated worker (Airflow, Celery, or AWS Lambda) would ingest Elexon stream endpoints periodically into a time-series database (e.g. TimescaleDB or ClickHouse), with Redis caching hot day-ahead queries.

---

## 3. Directory Layout

```
forecaster/
├── README.md                          # Repository documentation
└── backend/
    ├── api/
    │   └── index.py                   # Vercel Serverless Function entrypoint
    ├── app/
    │   ├── main.py                    # FastAPI application, CORS, lifespan, timing logs
    │   ├── config.py                  # Environment settings via pydantic-settings
    │   ├── schemas.py                 # Strict Pydantic response models (null serialization)
    │   ├── cache.py                   # LRU in-memory cache
    │   ├── api/
    │   │   └── routes.py              # REST API route handlers and 422 validations
    │   └── services/
    │       ├── data_store.py          # Parquet / CSV.GZ in-memory data store
    │       ├── decision_time.py       # Core decision-time forecast alignment & forward fill
    │       └── metrics.py             # MAE, RMSE, bias, MAPE, by-hour, by-horizon, band
    ├── data/
    │   ├── actuals.parquet            # 1,488 half-hour actuals (January 2026)
    │   └── forecasts.parquet          # 18,080 forecast rows (WINDFOR)
    ├── scripts/
    │   ├── explore_api.py             # Elexon API exploratory probe
    │   └── ingest.py                  # One-time chunked snapshot ingest script
    ├── tests/
    │   ├── test_decision_time.py      # Unit tests for cutoff and alignment logic
    │   ├── test_metrics.py            # Unit tests for accuracy statistics and planning band
    │   └── test_api.py                # End-to-end integration tests using TestClient
    ├── .dockerignore
    ├── .env.example
    ├── .gitignore
    ├── Dockerfile                     # Production container image
    ├── docker-compose.yml             # Local multi-container setup
    ├── requirements.txt               # Pinned dependencies
    └── vercel.json                    # Vercel deployment configuration
```

---

## 4. How to Run

### Prerequisites
- Python 3.12+ (or 3.14)
- Docker (optional, for container runs)

### Local Development
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
5. Check health:
   ```bash
   curl http://127.0.0.1:8000/health
   # {"status":"ok"}
   ```

### Running Tests
Execute the comprehensive test suite (25 passing tests):
```bash
cd backend
pytest -v
```

### Running via Docker
Build and run the container locally:
```bash
cd backend
docker build -t forecaster-backend .
docker run -p 8000:8000 forecaster-backend
```

Or using Docker Compose:
```bash
cd backend
docker compose up --build
```

### Re-running Ingest (Offline)
To re-fetch the snapshot from the live Elexon BMRS API:
```bash
cd backend
python scripts/ingest.py
```

---

## 5. Deployment Guide (Vercel)

The backend is configured for serverless deployment on Vercel:
1. **Entrypoint**: `backend/api/index.py` routes incoming serverless requests to the FastAPI `app`.
2. **Configuration (`backend/vercel.json`)**: Configured with wildcard route rewrites and explicit `"includeFiles": "data/**"` to ensure the Parquet files are packaged with the function bundle.
3. **Deploy with Vercel CLI**:
   ```bash
   cd backend
   vercel
   vercel --prod
   ```
4. **Environment Variables on Vercel**:
   - `ALLOWED_ORIGINS`: Comma-separated CORS origins (e.g., `https://your-frontend.vercel.app,http://localhost:3000`).
   - `DEFAULT_CUTOFF`: Default cutoff time (e.g., `09:00`).
5. **Deployment Link**:
   - Production API: `https://<your-vercel-deployment>.vercel.app` (Placeholder)

---

## 6. API Reference

All query parameters use UTC. Delivery times must fall within January 2026: `[2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z]`.

### 1. `GET /health`
Returns service operational status.
```bash
curl http://localhost:8000/health
```
```json
{ "status": "ok" }
```

### 2. `GET /api/meta`
Returns dataset bounds, row counts, and the default decision cutoff.
```bash
curl http://localhost:8000/api/meta
```
```json
{
  "actuals": {
    "min_time": "2026-01-01T00:00:00Z",
    "max_time": "2026-01-31T23:30:00Z",
    "row_count": 1488
  },
  "forecasts": {
    "min_time": "2026-01-01T00:00:00Z",
    "max_time": "2026-01-31T23:00:00Z",
    "row_count": 18080
  },
  "default_cutoff": "09:00"
}
```

### 3. `GET /api/series`
Returns the 30-minute decision-time forecast series with actuals, errors, and planning bands.
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional, default `"09:00"`).
```bash
curl "http://localhost:8000/api/series?start=2026-01-10T00:00:00Z&end=2026-01-10T02:00:00Z&cutoff=09:00"
```
```json
{
  "count": 4,
  "data": [
    {
      "time": "2026-01-10T00:00:00Z",
      "forecast": 11542.0,
      "publish_time": "2026-01-09T07:30:00Z",
      "horizon_hours": 16.5,
      "actual": 11309.0,
      "error": 233.0,
      "band_low": 10387.0,
      "band_high": 11309.0
    }
  ]
}
```

### 4. `GET /api/metrics`
Returns aggregate forecast accuracy metrics across the selected window.
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional).
```bash
curl "http://localhost:8000/api/metrics?start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z&cutoff=09:00"
```
```json
{
  "mae": 2145.17,
  "rmse": 2615.81,
  "bias": 1851.9,
  "mape": 22.44,
  "p10": -544.1,
  "p50": 1703.0,
  "p90": 4274.9,
  "count": 1488,
  "dropped_count": 0
}
```

### 5. `GET /api/metrics/by-hour`
Returns accuracy metrics grouped by UTC hour of the day (0 to 23).
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional).
```bash
curl "http://localhost:8000/api/metrics/by-hour?start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z"
```

### 6. `GET /api/metrics/by-horizon`
Returns accuracy metrics across all forecasts grouped by forecast horizon bucket (`0-6`, `6-12`, `12-24`, `24-36`, `36-48`, `48+`).
- **Parameters**: `start` (required), `end` (required).
```bash
curl "http://localhost:8000/api/metrics/by-horizon?start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z"
```

---

## 7. AI Tool Disclosure

In accordance with project guidelines, AI coding assistants (GitHub Copilot powered by Gemini 3.8 Flash) were utilized to assist with scaffolding, data exploration against the Elexon BMRS API, writing vectorized Pandas algorithms, unit testing, and documentation formatting. All domain logic, calculations, and tests were verified against real Elexon BMRS data.
