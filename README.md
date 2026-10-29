# Live Link: https://dfsgjks-p23s.vercel.app/
# Demo Video: https://www.loom.com/share/d6da6804e9644878a71a2d2edb3cf756
# Codebase Walkthrough: https://www.loom.com/share/ec6a7b8eccdc4de9a4271b89ec4edacd

# WindBand: UK Wind Forecast Accuracy Portal

A specialized Python FastAPI backend and React dashboard providing UK day-ahead wind forecast accuracy analysis and decision-time forecasting for energy trading desks.

Built using historical **Elexon BMRS** datasets for January 2026 delivery days (`2026-01-01T00:00:00Z` to `2026-02-01T00:00:00Z`).

---

## 1. Project Overview & Domain Logic

### The Decision-Time Problem
Electricity buyers in the UK day-ahead power market make commitment and procurement decisions for delivery day **D** on day **D-1** prior to the market gate closure. To evaluate the true risk of wind generation shortfalls or surpluses, traders need to evaluate the **latest forecast published before their decision cutoff**, rather than the final outturn forecast published minutes before delivery.

### Key Rules & Cutoff Assumption
1. **Decision Cutoff Assumption**:
   - For every 30-minute delivery slot time $ on delivery day $, the default day-ahead cutoff is defined as:
     2770\text{cutoff} = (D - 1\ \text{day})\ \text{at}\ \text{09:00 UTC}2770
   - **The 09:00 UTC cutoff is an explicit operating assumption** representing the morning trading desk workflow ahead of the day-ahead auction (EPEX SPOT / Nord Pool).
   - The cutoff time is fully configurable via query parameters (`?cutoff=HH:MM`) or environment configuration (`DEFAULT_CUTOFF`).
2. **WINDFOR Hourly Granularity & Forward Fill**:
   - Elexon BMRS `WINDFOR` forecasts publish at hourly intervals (`:00`).
   - For half-hourly settlement periods, the hourly forecast is carried forward to its subsequent `:30` slot (`forward_fill_hourly_forecasts`, max 30 minutes, preserving the identical `publish_time`).
3. **Forecast Selection**:
   - For delivery slot $, candidate forecasts must satisfy $\text{publish\_time} \le \text{cutoff}$.
   - The candidate with the latest `publish_time` is selected.
   - If no forecast exists prior to cutoff, the forecast is returned as `null` (never `0`).
4. **Accuracy Metrics & Fixed Planning Band**:
   - $\text{Error} = \text{Forecast} - \text{Actual}$ (positive = over-forecast, negative = under-forecast).
   - $\text{MAE} = \text{mean}(|\text{error}|)$, $\text{RMSE} = \sqrt{\text{mean}(\text{error}^2)}$, $\text{Bias} = \text{mean}(\text{error})$.
   - $\text{MAPE} = \text{mean}(|\text{error}| / \text{actual}) \times 100$, strictly excluding rows where $\text{actual} = 0$.
   - **Historical Planning Band**: per slot, $\text{band\_low} = \max(0, \text{forecast} - P90(\text{error}))$ and $\text{band\_high} = \text{forecast} - P10(\text{error})$.
     **Crucially, percentiles are computed from the full January 2026 decision-time error series for the same cutoff.** This ensures the band represents a fixed historical in-sample reference, avoids leaking the target day's own actuals into its band, and remains stable when zooming.
   - **By Horizon Analysis**: joins all historical forecasts to actuals, excludes $\text{horizon\_hours} < 0$, and groups errors into horizon buckets (`0-6`, `6-12`, `12-24`, `24-36`, `36-48`, `48+`).

---

## 2. Key Findings & Market Insights (January 2026)

From the evaluated 1,488 settlement periods (31 days $\times$ 48 half-hours, 0 missing actual slots):
- **Systemic Over-Forecasting Bias**: The month-level bias is **+1,852 MW** (MAE = **2,145 MW**, RMSE = **2,616 MW**, MAPE = **22.4%**). Across the month, wind forecasts consistently predicted significantly more generation than physically materialized.
- **Largest Single-Slot Over-Forecast**: On **12 Jan 2026 at 01:00 UTC**, the forecast predicted **20,942 MW** while actual generation was only **14,048 MW** (an error of **+6,894 MW**, with a 17.5h horizon).
- **Largest Single-Slot Under-Forecast**: On **08 Jan 2026 at 18:30 UTC**, the forecast predicted **5,349 MW** while actual generation surged to **9,184 MW** (an error of **-3,835 MW**, with a 35.0h horizon).
- **Lead-Time Error Degradation**: MAE increases steadily with forecast lead time, from **1,768 MW** at 0-6h horizon to **2,372 MW** at 48+ hours.

---

## 3. Architecture & Design Decisions

```
[OFFLINE INGEST, ONCE]
Elexon BMRS API ---> scripts/ingest.py ---> backend/data/actuals.parquet   (1,488 rows)
                                       ---> backend/data/forecasts.parquet (18,080 rows)
                                                    |
[RUNTIME ARCHITECTURE]                              v
Browser (React) ---> FastAPI Routes ---> In-Memory Cache ---> DataStore (Loaded once or on-demand)
                          |                     |                      |
                          v                     v                      v
                     Validation           decision_time             metrics
```

- **No Database**: January 2026 is closed historical data. An immutable snapshot of cleaned Parquet files (committed to `backend/data/`) is loaded into memory at startup or on first property access.
- **Zero Runtime Elexon Calls**: The web service is fully decoupled from external Elexon API rate limits or downtime.
- **Stateless & Scalable**: In-memory caching and vectorized pandas operations ensure full-month queries resolve in under 35 ms.
- **Strict One-Way Dependency**: `routes -> services -> data_store`. Services remain agnostic to HTTP layers.
- **Missing Data Contract**: Missing forecasts or actuals are emitted as JSON `null`, never `NaN`, `Infinity`, or `0`.
- **Production Path**: In a live multi-month production environment, an automated worker (Airflow or Celery) would ingest Elexon stream endpoints periodically into a time-series database (e.g. TimescaleDB or ClickHouse), with Redis caching hot day-ahead queries.

---

## 4. Directory Layout

```
windband/
├── README.md                          # Repository documentation
├── docker-compose.yml                 # Local multi-container compose (backend:8000 + web:3000)
├── docs/
│   └── BUILD_GUIDE.md                 # Complete build specification
├── backend/
│   ├── api/
│   │   └── index.py                   # Vercel Serverless Function entrypoint
│   ├── app/
│   │   ├── main.py                    # FastAPI application, CORS, lifespan, timing logs
│   │   ├── config.py                  # Environment settings via pydantic-settings
│   │   ├── schemas.py                 # Strict Pydantic response models (null serialization)
│   │   ├── cache.py                   # LRU in-memory cache
│   │   ├── api/
│   │   │   └── routes.py              # REST API route handlers and 422 validations
│   │   └── services/
│   │       ├── data_store.py          # Parquet / CSV.GZ in-memory data store with lazy load
│   │       ├── decision_time.py       # Core decision-time forecast alignment & forward fill
│   │       └── metrics.py             # MAE, RMSE, bias, MAPE, by-hour, by-horizon, band
│   ├── data/
│   │   ├── actuals.parquet            # 1,488 half-hour actuals (January 2026)
│   │   └── forecasts.parquet          # 18,080 forecast rows (WINDFOR)
│   ├── scripts/
│   │   ├── explore_api.py             # Elexon API exploratory probe
│   │   └── ingest.py                  # One-time chunked snapshot ingest script
│   ├── tests/
│   │   ├── test_decision_time.py      # Unit tests for cutoff and alignment logic
│   │   ├── test_metrics.py            # Unit tests for accuracy statistics and planning band
│   │   └── test_api.py                # End-to-end integration tests using TestClient
│   ├── .dockerignore
│   ├── .env.example
│   ├── .gitignore
│   ├── .vercelignore
│   ├── Dockerfile                     # Production backend container image
│   ├── requirements.txt               # Production runtime dependencies
│   ├── requirements-dev.txt           # Test & development dependencies
│   └── vercel.json                    # Vercel deployment configuration
└── frontend/
    ├── index.html                     # HTML5 root with WindBand title and favicon
    ├── nginx.conf                     # Nginx configuration for containerized frontend
    ├── package.json                   # Dependencies: React 19, Recharts, React Query
    ├── tsconfig.json                  # Strict TypeScript configuration
    ├── vite.config.ts                 # Dev server with /api and /health reverse proxy
    ├── .dockerignore
    ├── .env.example                   # VITE_API_BASE_URL
    ├── .gitignore
    ├── Dockerfile                     # Multi-stage production build (Node -> Nginx)
    ├── vercel.json                    # SPA routing fallback
    └── src/
        ├── App.tsx                    # Main dashboard layout and debounced state
        ├── main.tsx                   # React root with QueryClientProvider
        ├── styles.css                 # Responsive layout and theme
        ├── test-setup.ts              # Vitest jsdom test setup and mocks
        ├── api/
        │   ├── client.ts              # Typed fetch client with 422 error parsing
        │   └── types.ts               # TypeScript interfaces matching backend models
        ├── components/
        │   ├── Controls.tsx           # Datetime inputs, preset buttons, cutoff
        │   ├── KpiStrip.tsx           # Summary cards with plain-language bias
        │   ├── SeriesChart.tsx        # Recharts ComposedChart with band, actual, forecast, brush
        │   ├── MetricsPanel.tsx       # Accuracy metrics side panel with P10/P50/P90
        │   ├── ByHourChart.tsx        # Diurnal 24h MAE bars and bias line
        │   ├── ByHorizonChart.tsx     # Lead-time horizon degradation curve
        │   ├── MethodologyNote.tsx    # Collapsible domain & methodology documentation
        │   └── States.tsx             # Skeleton loader, ErrorBox with retry, EmptyState
        ├── hooks/
        │   └── useWindData.ts         # React Query hooks with cache keys
        ├── lib/
        │   ├── format.ts              # MW, percentage, bias, and UTC date formatters
        │   └── range.ts               # Date range window, clamp, preset, and validation
        └── __tests__/                 # Vitest component and unit test suites
```

---

## 5. How to Run Locally

### Prerequisites
- Python 3.12+
- Node.js 20+ and npm
- Docker and Docker Compose (optional, for container runs)

### Running Everything with Docker Compose (Recommended)
From the repository root:
```bash
docker compose up --build
```
- Frontend dashboard: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`

---

### Running the Backend Standalone
1. Navigate to `backend/`:
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
   pip install -r requirements-dev.txt
   ```
4. Start the backend:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
5. Run backend tests (27 tests):
   ```bash
   pytest -v
   ```

---

### Running the Frontend Standalone
1. Navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Vite dev server:
   ```bash
   npm run dev
   ```
   *(Automatically proxies `/api` and `/health` calls to `http://localhost:8000`)*
4. Run frontend tests (42 tests):
   ```bash
   npm test
   ```
5. Build production bundle:
   ```bash
   npm run build
   ```

---

### Re-running Ingest (Offline)
To re-fetch the snapshot from the live Elexon BMRS API:
```bash
cd backend
python scripts/ingest.py
```

---

## 6. Deployment Guide (Vercel)

Both the backend and frontend are configured for independent deployment on Vercel's free Hobby tier.

### 1. Backend Deployment (Python Serverless Function)
- Create a new project in Vercel linked to the repository.
- Set **Root Directory** to `backend`.
- Framework Preset: **Other**.
- Set Environment Variables:
  - `DEFAULT_CUTOFF`: `09:00`
  - `ALLOWED_ORIGINS`: `https://<your-frontend-project>.vercel.app,http://localhost:3000`
- Deploy: `vercel --prod`

### 2. Frontend Deployment (Static Vite SPA)
- Create a second project in Vercel linked to the repository.
- Set **Root Directory** to `frontend`.
- Framework Preset: **Vite**.
- Set Environment Variables:
  - `VITE_API_BASE_URL`: `https://<your-backend-project>.vercel.app`
- Deploy: `vercel --prod`
- Add the production frontend URL to the backend's `ALLOWED_ORIGINS` setting and redeploy backend.

### Live Deployments (Placeholders)
- **Frontend App**: `https://windband-web.vercel.app` *(replace with live URL)*
- **Backend API**: `https://windband-api.vercel.app` *(replace with live URL)*

---

## 7. API Reference

All query parameters use UTC. Delivery times must fall within January 2026: `[2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z]`.

### `GET /health`
Returns backend operational status.
```json
{ "status": "ok" }
```

### `GET /api/meta`
Returns dataset bounds, row counts, and the default decision cutoff.
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

### `GET /api/series`
Returns 30-minute decision-time forecast series with actuals, signed errors, and planning bands.
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional, default `"09:00"`).
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
      "band_low": 7267.1,
      "band_high": 12086.1
    }
  ]
}
```

### `GET /api/metrics`
Returns aggregate forecast accuracy metrics across the selected window.
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional).
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

### `GET /api/metrics/by-hour`
Returns accuracy metrics grouped by UTC hour of the delivery day (0 to 23).
- **Parameters**: `start` (required), `end` (required), `cutoff` (optional).

### `GET /api/metrics/by-horizon`
Returns accuracy metrics across all published forecasts grouped by forecast horizon bucket (`0-6`, `6-12`, `12-24`, `24-36`, `36-48`, `48+`).
- **Parameters**: `start` (required), `end` (required).

---

## 8. Known Limits & Methodology Notes

1. **Hourly Forecast Carry-Forward**: Elexon BMRS WINDFOR only publishes forecasts on hourly boundaries (`:00`). The system carries each hourly forecast forward to its subsequent `:30` slot to align with 48 half-hour settlement periods.
2. **By-Horizon Granularity**: By-horizon metrics evaluate all published raw WINDFOR forecasts against actuals for hourly (`:00`) slots without carry-forward; bucket sample counts reflect hourly resolution.
3. **Cutoff Assumption**: The 09:00 UTC cutoff is a modeling baseline representing trading desk workflow ahead of Day-Ahead auction gate closure. Trading desks can customize this via `?cutoff=HH:MM`.
4. **In-Sample Planning Band**: Planning error bands are derived from the entire January 2026 decision-time error distribution for the given cutoff, providing a reliable historical reference envelope rather than a predictive confidence interval.

---

## 9. AI Tool Disclosure

In accordance with project guidelines, AI coding assistants (GitHub Copilot powered by Gemini 3.8 Flash) were utilized throughout development to assist with project scaffolding, Elexon BMRS API exploration, writing vectorized Pandas algorithms, React/TypeScript UI component implementation, unit testing, and documentation. All domain logic, calculations, and tests were verified against real Elexon BMRS data.
