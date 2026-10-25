# Backend Build Guide: UK Wind Forecast Accuracy Portal

> **Instructions for the coding assistant (read first).**
> - Work **one step at a time**. After each step, stop, summarize what you changed, and wait for my "next".
> - **Backend only.** Do not create any frontend code.
> - Keep code simple, typed, and small. No over-engineering. No database.
> - Never invent API parameters or response fields. Verify against the real Elexon API (Step 2) and tell me if reality differs from this document.
> - Ask me before adding any dependency not listed here.
> - Every step ends with an **Acceptance check**. Run it and show the result before stopping.

---

## 0. Context

### The assignment
I am a product developer delivering a pilot web app to a UK energy utility. The client's team buys electricity on the **UK day-ahead market**. The purchase decision for delivery day **D** is made on **D-1**. They need to know how much power to buy beyond wind generation, so they depend on **wind forecasts**.

The app must let them:
1. See the **latest wind forecast available at decision time** (the most recent forecast published before the day-ahead cutoff).
2. **Quantify forecast accuracy** so they can plan with the error in mind.

### Scope limits (from the assignment)
- Data: **Elexon BMRS only**. National-level **wind only**. Nothing else.
- Decisions made in **January 2026** only (delivery days 2026-01-01 to 2026-01-31).
- Stack: React (frontend, later), **Python backend**, **Docker**, deployed on Vercel or Heroku (backend on Heroku).
- Max 16 hours total effort. AI tools are allowed but must be disclosed in the final README.

### Data sources
| Dataset | Meaning | Endpoint | Fields we need |
|---|---|---|---|
| **FUELHH** (actuals) | Wind power really produced, one row per 30-min slot | `/datasets/FUELHH/stream` | `startTime`, `generation`, filter `fuelType = WIND` |
| **WINDFOR** (forecasts) | Forecast made at `publishTime` for slot `startTime`. Same slot has many forecasts | `/datasets/WINDFOR/stream` | `startTime`, `publishTime`, `generation` |

Units: `generation` is in **MW**. All times are **UTC**. January is GMT, so UTC equals UK local time (no DST issue).

Docs: https://bmrs.elexon.co.uk/api-documentation (base URL is expected to be `https://data.elexon.co.uk/bmrs/api/v1`; **verify in Step 2**).

### We do NOT predict anything
We only fetch Elexon's forecasts and actuals, align them, and measure the error.

---

## 1. Architecture (decisions already made)

```
[OFFLINE, once]
Elexon API --> scripts/ingest.py --> data/actuals.parquet
                                     data/forecasts.parquet
                                            | copied into Docker image at build

[RUNTIME]
Browser --HTTPS/JSON--> FastAPI routes --> cache --> decision_time service --> metrics service
                         (validate only)             ^ reads DataFrames loaded once at startup
```

### Key decisions
- **No database.** January 2026 is closed, read-only, small history. A one-time **snapshot** (Parquet files committed to the repo) is loaded into pandas at startup.
- **The app never calls Elexon at runtime.** Only the ingest script does.
- **Stateless and read-only**, so it scales horizontally. Responses are cacheable.
- **Dependency direction is one way:** `routes -> services -> data`. Services know nothing about HTTP. The data layer knows nothing about the API.
- **Missing data is `null`, never `0`.**
- **Production path (for the tech lead review):** scheduled ingest + database + live data.

---

## 2. Target directory layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, startup loading
│   ├── config.py            # env-based settings
│   ├── schemas.py           # Pydantic response models
│   ├── cache.py             # tiny in-memory cache
│   ├── api/
│   │   └── routes.py        # thin endpoints, validation only
│   └── services/
│       ├── data_store.py    # loads parquet into DataFrames
│       ├── decision_time.py # CORE: latest forecast before cutoff
│       └── metrics.py       # MAE, RMSE, bias, by-hour, by-horizon, band
├── scripts/
│   ├── explore_api.py       # Step 2 (throwaway exploration)
│   └── ingest.py            # Step 3 (one-time snapshot)
├── data/
│   ├── actuals.parquet
│   └── forecasts.parquet
├── tests/
│   ├── test_decision_time.py
│   ├── test_metrics.py
│   └── test_api.py
├── requirements.txt
├── .env.example
├── .dockerignore
├── Dockerfile
├── heroku.yml
└── README.md                # final submission README (written in Step 11)
```

---

## 3. Domain rules (the logic that must be exactly right)

### Decision-time forecast
For each 30-min delivery slot with `startTime = t` on delivery day `D`:
1. `cutoff = (D - 1 day) at CUTOFF_TIME` (UTC, default `09:00`, configurable as `HH:MM`).
2. Among WINDFOR rows with that `startTime`, keep those with `publishTime <= cutoff`.
3. Choose the row with the **latest** `publishTime`.
4. If none exists, forecast is `null`.

**The cutoff default is an assumption.** The assignment does not define it. Keep it configurable, state it clearly in the README and the video, and I will check it against the real GB day-ahead gate closure.

### Per-slot output
| Field | Definition |
|---|---|
| `time` | slot `startTime` (UTC, ISO 8601) |
| `forecast` | MW, chosen forecast (nullable) |
| `publish_time` | when the chosen forecast was published (nullable) |
| `horizon_hours` | `startTime - publishTime` in hours (nullable) |
| `actual` | MW from FUELHH (nullable) |
| `error` | `forecast - actual` (null if either is null) |

Positive error = over-forecast. Negative = under-forecast.

### Metrics (computed on rows where `error` is not null)
- **MAE** = mean(|error|)
- **RMSE** = sqrt(mean(error²))
- **Bias** = mean(error)
- **MAPE** = mean(|error| / actual) × 100, **excluding rows where actual == 0**
- **Error percentiles** = P10, P50, P90 of `error`
- **Count** of rows used, and count of rows dropped for missing data
- **By hour of day:** MAE, bias, count grouped by UTC hour of `time`
- **By horizon:** use **all** forecasts (not only the decision-time one) joined to actuals. Bucket `horizon_hours` (e.g., 0-6, 6-12, 12-24, 24-36, 36-48, 48+). Report MAE, bias, count per bucket.
- **Planning band** (per slot): since `actual = forecast - error`, use
  `band_low = forecast - P90(error)` and `band_high = forecast - P10(error)`,
  with percentiles taken from the selected range. Clamp `band_low` at 0.

---

## 4. API contract

Base path `/api`. All query params in UTC.

| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/health` | none | `{"status":"ok"}` |
| GET | `/api/meta` | none | data bounds, default cutoff, row counts |
| GET | `/api/series` | `start`, `end`, `cutoff` (optional) | list of per-slot rows + band |
| GET | `/api/metrics` | `start`, `end`, `cutoff` (optional) | overall metrics |
| GET | `/api/metrics/by-hour` | `start`, `end`, `cutoff` (optional) | metrics per hour of day |
| GET | `/api/metrics/by-horizon` | `start`, `end` | metrics per horizon bucket |

### Validation rules (return HTTP 422 with a clear message)
- `start` and `end` are ISO 8601; `start < end`.
- Both inside **2026-01-01T00:00Z to 2026-02-01T00:00Z** (delivery window).
- `cutoff` matches `HH:MM`, valid time.

`start` and `end` refer to **delivery slot times**.

---

## 5. Steps

### Step 1. Scaffold and environment
**Tasks**
- Create the `backend/` layout above (empty files are fine).
- Create a virtual environment inside `backend/`.
- `requirements.txt` (pin versions after installing): `fastapi`, `uvicorn[standard]`, `pandas`, `pyarrow`, `httpx`, `pydantic-settings`, `pytest`.
- Add `.gitignore` (venv, `__pycache__`, `.env`). Do **not** ignore `data/*.parquet`.
- `app/main.py`: minimal FastAPI app with `/health`.

**Acceptance check:** `uvicorn app.main:app --reload` runs and `GET /health` returns `{"status":"ok"}`.

---

### Step 2. Explore the Elexon API (throwaway)
**Tasks**
- Write `scripts/explore_api.py` using `httpx`.
- Check the real base URL, parameter names, date-range limits, response format (JSON), and field names for both streams.
- Fetch a **small** sample (one day) of FUELHH with `fuelType=WIND`, and WINDFOR.
- Print: columns, a few rows, row counts, how many distinct `publishTime` values exist per `startTime` in WINDFOR, and the earliest/latest horizon seen.

**Report back to me:**
1. Exact param names for date filtering on each stream (for example whether WINDFOR filters by `publishDateTimeFrom/To` and FUELHH by `settlementDateFrom/To`; confirm, do not assume).
2. Maximum date range per call.
3. Whether `fuelType` can be filtered server-side.
4. Whether WINDFOR slots are 30-min or hourly.
5. Anything that contradicts this document.

**Acceptance check:** you can show sample rows for both datasets and I agree with the findings. **Stop and wait.**

---

### Step 3. Ingest script (the snapshot)
**Tasks**
- `scripts/ingest.py` fetches and writes `data/actuals.parquet` and `data/forecasts.parquet`.
- **Actuals:** delivery slots from `2026-01-01T00:00Z` to `2026-02-01T00:00Z`, `fuelType = WIND`. Keep `startTime`, `generation`.
- **Forecasts:** must cover every January cutoff, so fetch forecasts with `publishTime` starting around **2025-12-30** through **2026-01-31**, then keep only rows with `startTime` in the delivery window. Keep `startTime`, `publishTime`, `generation`.
- Fetch in **chunks** that respect the API range limit found in Step 2. Add simple retry with backoff.
- Parse times as **UTC-aware datetimes**. Rename columns to snake_case: `start_time`, `publish_time`, `generation`.
- Drop duplicates (actuals on `start_time`; forecasts on `start_time + publish_time`). Sort.
- Print a summary: row counts, min/max times, number of missing actual slots (expect 1488 slots for 31 days).
- The script must be **idempotent** (re-run gives the same output).

**Acceptance check:** run it, show the summary, and confirm both Parquet files exist and open with pandas.

---

### Step 4. Data store
**Tasks**
- `app/services/data_store.py`: a class or module that loads both Parquet files **once at startup** into DataFrames with UTC datetimes.
- Expose read-only accessors. No mutation after load.
- Wire it into FastAPI startup (lifespan) in `main.py`.
- `config.py`: `DATA_DIR`, `DEFAULT_CUTOFF` (default `"09:00"`), `ALLOWED_ORIGINS` (comma-separated), loaded from env. Add `.env.example`.
- Implement `GET /api/meta`.

**Acceptance check:** `/api/meta` returns row counts, min/max times, and the default cutoff.

---

### Step 5. Decision-time service (core, test heavily)
**Tasks**
- `app/services/decision_time.py` with a function like `build_series(actuals, forecasts, start, end, cutoff) -> DataFrame` following Section 3.
- Use a vectorized approach (for example `pandas.merge_asof` per slot with a computed cutoff column, or sort + groupby). No per-row Python loops over thousands of rows.
- Return all slots in `[start, end)`, with nulls where data is missing.
- Write `tests/test_decision_time.py` with small hand-built DataFrames covering:
  1. Picks the latest forecast at or before the cutoff.
  2. A forecast published exactly **at** the cutoff is included.
  3. A forecast published after the cutoff is excluded.
  4. No forecast before the cutoff gives a null forecast (not 0).
  5. Missing actual gives null error.
  6. Different cutoff times change the chosen forecast.
  7. Horizon is computed correctly.

**Acceptance check:** `pytest tests/test_decision_time.py` passes. Show me one real day (for example 2026-01-10) printed from the real data.

---

### Step 6. Metrics service
**Tasks**
- `app/services/metrics.py` taking the aligned DataFrame from Step 5. It must **not** touch raw data (except the by-horizon function, which takes actuals and all forecasts).
- Functions: `overall_metrics`, `metrics_by_hour`, `metrics_by_horizon`, `planning_band` per Section 3.
- Handle empty input and all-null input without crashing (return nulls and count 0).
- Write `tests/test_metrics.py` with tiny hand-checked numbers: MAE, RMSE, bias, MAPE excluding zero actuals, percentiles, empty input, bucket edges.

**Acceptance check:** `pytest` passes. Show metrics for the full month using the default cutoff.

---

### Step 7. API layer
**Tasks**
- `app/schemas.py`: Pydantic models for every response. Nullable fields must serialize as JSON `null`, never `NaN`.
- `app/api/routes.py`: implement the endpoints in Section 4. Routes only validate and delegate to services.
- Validation per Section 4, returning 422 with clear messages.
- `app/cache.py`: small in-memory cache (dict or `functools.lru_cache`) keyed by `(endpoint, start, end, cutoff)`.
- CORS in `main.py` from `ALLOWED_ORIGINS`.
- `tests/test_api.py` using FastAPI `TestClient`: happy path for each endpoint, plus out-of-range, bad cutoff, and `start >= end`.

**Acceptance check:** `pytest` passes, and `/docs` (Swagger) shows all endpoints and returns real data for a January range.

---

### Step 8. Hardening and sanity checks
**Tasks**
- Verify no `NaN`/`Infinity` leaks in any JSON response.
- Check response time for the full month (target: well under 1 second after the first call).
- Add simple logging (request path, duration).
- Manually sanity-check two or three values against the raw parquet data.

**Acceptance check:** summary of checks, with any issues found.

---

### Step 9. Dockerize
**Tasks**
- `Dockerfile`: `python:3.12-slim`, install requirements, copy `app/` and `data/`, run as non-root, listen on `$PORT` (default 8000), command `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- `.dockerignore`: venv, `__pycache__`, `tests`, `.env`, `scripts` (the data is already in `data/`).
- Keep the image small. Use layer caching (copy `requirements.txt` first).

**Acceptance check:** `docker build` and `docker run -p 8000:8000` work, and `/health` and `/api/meta` respond from the container.

---

### Step 10. Heroku deployment prep (container stack)
**Tasks**
- Add `heroku.yml` that builds the Dockerfile for the `web` process.
- Document the commands: `heroku create`, `heroku stack:set container`, set config vars (`ALLOWED_ORIGINS`, `DEFAULT_CUTOFF`), `git push heroku main` (or the subtree push if `backend/` is a subfolder).
- Confirm the app reads `$PORT`.

**Acceptance check:** the commands are written down and checked for correctness. I will run the deploy myself.

---

### Step 11. Final README (submission-ready)
Rewrite this file as the repo README with:
- What the project is, and the **cutoff assumption stated clearly**.
- Directory and file overview.
- How to run: ingest, local dev, tests, Docker.
- API endpoint list with example calls.
- Design decisions (no DB, snapshot, stateless, one-way dependencies) and the production path.
- Link placeholder for the deployed app.
- **A line disclosing that AI tools were used to assist development.**

**Acceptance check:** a stranger can clone the repo and run the backend using only the README.

---

## 6. Rules of thumb
- Small functions, type hints, clear names.
- Tests focus on the decision-time and metrics logic, because that is where mistakes hurt most.
- If something in this document looks wrong or the API behaves differently, **stop and tell me** instead of guessing.