# WindBand: Build Guide (Backend + Frontend)

> **File location:** save as `docs/BUILD_GUIDE.md`. This is the instruction file for the coding assistant. The root `README.md` is the separate submission README (Step 11). **Never overwrite one with the other.**

> **Instructions for the coding assistant (read first).**
> - Work **one step at a time**. After each step, stop, summarize what you changed, and wait for my "next".
> - Work only on the part named in my current instruction. **Backend** steps are in Part A, **frontend** steps in Part B.
> - Keep code simple, typed, and small. No over-engineering. No database.
> - Never invent API parameters or response fields. Verify against the real Elexon API (Step 2) and tell me if reality differs from this document.
> - Ask me before adding any dependency not listed here.
> - Every step ends with an **Acceptance check**. Run it and show the result before stopping.

---

## Status (read before doing anything)

| Part | State |
|---|---|
| Backend Steps 1-7 | **Done.** 25 tests pass. Real data verified (1,488 actuals, 18,080 forecast rows, 0 missing actuals). |
| Dockerfile, Vercel entrypoint (`api/index.py`, `vercel.json`), request logging, CSV fallback | **Done.** |
| Step 8b (review fixes) | **Open.** Planning band, lazy loading, requirements split, README errors, compose location. |
| Steps 9-10 | **Files done, verification open** (docker run, Vercel deploy). |
| Step 11 (submission README) | **Drafted, needs fixes** (Step 8b item 4), finalize last. |
| Frontend (Part B) | **Not started.** |

### Plan changes since the first version of this guide
1. **WINDFOR is hourly, FUELHH is half-hourly.** Each hourly forecast is carried forward to its `:30` slot (implemented in `decision_time.py`).
2. **Hosting is Vercel only (free).** Heroku is dropped (no free tier). Backend runs as a FastAPI Python function on Vercel, frontend as a static Vite build on Vercel. Docker is for local and reproducible runs.
3. **Forecast ingest window.** The snapshot starts at publishTime 2025-12-30. Starting at 2025-12-28 would only add 48h+ horizon rows for 1-2 Jan (the by-horizon `48+` bucket). Optional re-run, low priority.
4. **Product name is WindBand.** Use it in the UI title, README title, and page `<title>`.

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
- Stack: React frontend, **Python backend**, **Docker**, deployed on Vercel (both parts, free Hobby plan). The assignment allows Vercel or Heroku; Heroku has no free tier.
- Max 16 hours total effort. AI tools are allowed but must be disclosed in the final README.

### Data sources
| Dataset | Meaning | Endpoint | Fields we need |
|---|---|---|---|
| **FUELHH** (actuals) | Wind power really produced, one row per 30-min slot | `/datasets/FUELHH/stream` | `startTime`, `generation`, filter `fuelType = WIND` |
| **WINDFOR** (forecasts) | Forecast made at `publishTime` for slot `startTime`. Same slot has many forecasts | `/datasets/WINDFOR/stream` | `startTime`, `publishTime`, `generation` |

Units: `generation` is in **MW**. All times are **UTC**. January is GMT, so UTC equals UK local time (no DST issue).

Docs: https://bmrs.elexon.co.uk/api-documentation (base URL is expected to be `https://data.elexon.co.uk/bmrs/api/v1`; **verify in Step 2**).

**Granularity:** FUELHH is half-hourly (48 slots/day). WINDFOR is **hourly** (`:00` only). Batches are published roughly every 3 hours, and each batch covers about 66 hours ahead and also re-publishes past hours (so `startTime - publishTime` can be negative).

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
- **Hosting:** Vercel Hobby (free) for both parts. Docker (`Dockerfile`, `docker-compose.yml`) is for local runs only; say this in the README and video.
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
├── .env.example
├── .dockerignore
├── Dockerfile
├── vercel.json              # Step 10
├── api/index.py             # Step 10: Vercel entrypoint exposing `app`
├── requirements.txt         # runtime only (Step 8b)
└── requirements-dev.txt     # pytest, httpx (Step 8b)

# repo root
# ├── README.md              # this guide, rewritten as the final README in Step 11
# ├── docker-compose.yml     # backend (Step 9) + web (Step B8)
# └── frontend/              # see Part B
```

---

## 3. Domain rules (the logic that must be exactly right)

### Decision-time forecast
For each 30-min delivery slot with `startTime = t` on delivery day `D`:
1. `cutoff = (D - 1 day) at CUTOFF_TIME` (UTC, default `09:00`, configurable as `HH:MM`).
2. Among WINDFOR rows with that `startTime`, keep those with `publishTime <= cutoff`.
3. Choose the row with the **latest** `publishTime`.
4. If none exists, forecast is `null`.

**Hourly to half-hourly:** a forecast for `:00` is reused for the following `:30` slot with the same `publish_time`. Overall metrics therefore use 48 slots/day; the by-horizon metric uses `:00` slots only (no carry-forward), so its counts differ. State this in the methodology note.

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
  `band_low = forecast - P90(error)` and `band_high = forecast - P10(error)`, clamped at 0.
  **Percentiles come from a fixed reference: the whole January 2026 decision-time error series for the same cutoff, not the selected range.** (Using the selected range leaks that day's own actuals into its band and makes the band change with the zoom. Label it "historical error band, in-sample" in the UI.)

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

### Response shapes (as implemented)
- `/api/meta`: `{actuals:{min_time,max_time,row_count}, forecasts:{...}, default_cutoff}`
- `/api/series`: `{count, data:[{time, forecast, publish_time, horizon_hours, actual, error, band_low, band_high}]}`, all value fields nullable
- `/api/metrics`: `{mae, rmse, bias, mape, p10, p50, p90, count, dropped_count}`
- `/api/metrics/by-hour`: `[{hour, mae, bias, count}]` (24 items)
- `/api/metrics/by-horizon`: `[{bucket, mae, bias, count}]` (buckets 0-6, 6-12, 12-24, 24-36, 36-48, 48+)

### Validation rules (return HTTP 422 with a clear message)
- `start` and `end` are ISO 8601; `start < end`.
- Both inside **2026-01-01T00:00Z to 2026-02-01T00:00Z** (delivery window).
- `cutoff` matches `HH:MM`, valid time.

`start` and `end` refer to **delivery slot times**.

---

## 5. Part A: Backend steps

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
- **Forecasts:** must cover every January cutoff, so fetch forecasts with `publishTime` starting around **2025-12-28 to 2025-12-30** through **2026-01-31**, then keep only rows with `startTime` in the delivery window. Keep `startTime`, `publishTime`, `generation`.
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

### Step 8b. Backend fixes from review (do before deploy and before frontend data work)
1. **Planning band leaks the target day.** `planning_band()` takes P10/P90 from the same range it draws, so a single-day band uses that day's own actuals and changes when you zoom. Change it to use a fixed reference: the whole-January decision-time error series for the same cutoff (computed once per cutoff, cached). Update `/api/series` and tests: the band for a slot must be identical for any sub-range with the same cutoff. Label it "historical error band, in-sample" in docs and UI.
2. **Lazy data loading.** Vercel may not run FastAPI lifespan events. In `DataStore`, load on first property access if not loaded (keep the lifespan call too). Add a test: accessing `data_store.actuals` without `load()` works.
3. **Requirements split.** `requirements.txt` = runtime only (`fastapi`, `uvicorn`, `pandas`, `pyarrow`, `pydantic-settings` and what they truly need). Move `pytest` and `httpx` to `requirements-dev.txt`. Drop pins nothing needs (`opentelemetry-api`, `uvloop`, `watchfiles`, `httptools`, `websockets`, `PyYAML`). Re-run all tests and the Docker build.
4. **Fix the root README.** (a) Remove the garbled math (`slot $ on delivery day $`, stray `2758`); use plain text. (b) Rename every `forecaster` to `windband` (directory tree, image name, `container_name`). (c) Regenerate the `/api/series` example from real output (the current `band_high` equals the actual value, which is wrong). (d) Update the band description to match item 1. (e) Make the AI disclosure name the tool and model actually used. (f) Add a "Known limits" section: hourly forecast carried to `:30`, by-horizon uses `:00` slots only, cutoff is an assumption, band is in-sample.
5. **CORS.** Set `allow_credentials=False` (no cookies are used).
6. **Compose location.** Move `docker-compose.yml` to the repo root (build context `./backend`) so Part B can add the `web` service.

**Acceptance check:** `pytest` passes including new band and lazy-load tests; two sub-ranges with the same cutoff return identical `band_low`/`band_high` for the same slot; `docker compose up --build` from the root serves `/health`.

---

### Step 9. Docker (local use): files done, verify
`backend/Dockerfile` is complete. Remaining: after Step 8b item 6, run `docker compose up --build` from the repo root and confirm `/health` and `/api/meta` respond from the container.

---

### Step 10. Vercel deploy (backend, free Hobby plan): files done, verify after deploy
Already in place: `backend/api/index.py`, `backend/vercel.json` (rewrite all paths to the function, `includeFiles: data/**`).

**I run the deploy; the assistant prepares the checklist:**
1. Vercel project with **Root Directory = `backend`**.
2. Env vars: `ALLOWED_ORIGINS` (the frontend URL, added after the frontend is deployed, then redeploy) and `DEFAULT_CUTOFF=09:00`.
3. After deploy, check: `/health`, `/api/meta`, one `/api/series` call, cold-start time, and the bundle size (Python limit is 500 MB uncompressed).
4. If the bundle is too big or imports fail: switch to `.csv.gz` data (the data store already supports it) and drop `pyarrow`.

---

### Step 11. Final README (submission-ready)
Do this **last**, after Part B. Update the root `README.md` (not this guide) so it contains:
- What WindBand is, and the **cutoff assumption stated clearly**.
- Directory and file overview (backend and frontend).
- How to run: ingest, backend dev, frontend dev, tests, Docker.
- API endpoint list with example calls.
- Design decisions (no DB, snapshot, stateless, one-way dependencies, Vercel hosting) and the production path.
- Known limits (from Step 8b item 6).
- Links to the two Vercel deployments (replace placeholders).
- **A line disclosing that AI tools were used to assist development.**

**Acceptance check:** a stranger can clone the repo and run both parts using only the README.

---

# Part B: Frontend

> Start Part B only after Step 8b is done. Same rules as above: one step at a time, stop after each, show the acceptance check.

## B0. Frontend context

### What the user does (user journey)
A day-ahead power buyer opens WindBand and **sees the chart immediately** (no landing page, no login). They:
1. See actual vs decision-time forecast, with the planning band, over a default range.
2. Change the range (start/end, 30-min steps, inside January 2026) and the decision cutoff.
3. Read accuracy metrics for exactly that selection in a side panel.
4. Scan error by hour of day and by forecast horizon to understand when the forecast is least reliable.
5. Read a short methodology note so they know what the numbers mean.

### Stack (decided)
- **React 18 + TypeScript + Vite**, in `frontend/`
- **Recharts** for charts
- **@tanstack/react-query** for fetching and caching
- **Plain CSS** (CSS variables, no UI framework). Keep it clean and readable.
- **Vitest + React Testing Library** for a few focused tests
- Ask me before adding anything else.

### Rules
- All times are **UTC**. January is GMT, so UTC equals UK time. Say this once in the UI ("Times in UTC (= UK time in January)").
- Send `start`/`end` to the API as ISO strings from `Date.toISOString()` (ends in `Z`).
- `null` values are **gaps**, never zero. Charts must not connect across nulls (`connectNulls={false}`).
- Numbers are MW. Format with thousands separators and no more than 0 decimals for MW, 1 decimal for percentages.
- Every data panel needs **loading, error (with retry), and empty** states.
- The API base URL comes from `VITE_API_BASE_URL`. Never hardcode it.
- Key facts to surface: month-level **bias is strongly positive** (the forecast over-predicts wind on average). Show bias with a plain-language label ("Forecast over-predicted by X MW on average" / "under-predicted"), because this is the headline for a buyer.

### Target layout
```
frontend/
├── index.html
├── package.json
├── vite.config.ts            # dev proxy /api -> http://localhost:8000
├── tsconfig.json
├── .env.example              # VITE_API_BASE_URL=http://localhost:8000
├── vercel.json               # SPA fallback if needed
├── Dockerfile                # build + nginx, for local compose only
├── src/
│   ├── main.tsx
│   ├── App.tsx               # layout + state (range, cutoff)
│   ├── styles.css
│   ├── api/
│   │   ├── client.ts         # fetch wrapper, error handling
│   │   └── types.ts          # types matching the API response shapes
│   ├── hooks/
│   │   └── useWindData.ts    # react-query hooks: meta, series, metrics, byHour, byHorizon
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Controls.tsx      # range + presets + cutoff
│   │   ├── KpiStrip.tsx
│   │   ├── SeriesChart.tsx   # actual, forecast, band, brush
│   │   ├── MetricsPanel.tsx  # side panel
│   │   ├── ByHourChart.tsx
│   │   ├── ByHorizonChart.tsx
│   │   ├── MethodologyNote.tsx
│   │   └── States.tsx        # Loading / ErrorBox / Empty
│   └── lib/
│       ├── format.ts         # MW, %, date formatting
│       └── range.ts          # preset ranges, clamp to data window
└── src/__tests__/
```

### Page layout (single page)
```
Header: WindBand + one-line subtitle + "Times in UTC"
Controls: [start] [end] [presets: 1 day | 3 days | 7 days | Full month] [cutoff HH:MM]
KpiStrip: Avg forecast MW | Avg actual MW | MAE | Bias (plain language)
-------------------------------------------------------------
SeriesChart (about 2/3 width)        | MetricsPanel (about 1/3)
 actual line, forecast line,         |  MAE, RMSE, Bias, MAPE,
 planning band (shaded), brush       |  P10/P50/P90, rows used/dropped
-------------------------------------------------------------
ByHourChart (bar: MAE by hour)       | ByHorizonChart (bar: MAE by bucket)
MethodologyNote (collapsible)
```
On narrow screens, stack vertically.

### Defaults
- Data window comes from `/api/meta`: start = `actuals.min_time`, end = `actuals.max_time + 30 minutes`.
- Default range: **full month**. Default cutoff: `default_cutoff` from `/api/meta`.
- Presets are relative to the window end and clamp inside the window.

---

## B steps

### Step B1. Scaffold
**Tasks**
- Create `frontend/` with Vite React-TS, install `recharts`, `@tanstack/react-query`, and dev deps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- Add `.env.example`, `vite.config.ts` with a dev proxy for `/api` and `/health` to `http://localhost:8000`, `frontend/.gitignore` (node_modules, dist, .env).
- Empty `App.tsx` that renders "WindBand" and calls `/health` to show backend status.

**Acceptance check:** backend on :8000, `npm run dev` shows the page and "backend: ok".

### Step B2. API client and types
**Tasks**
- `api/types.ts` matching the response shapes in Section 4 exactly (nullable fields typed `number | null`).
- `api/client.ts`: one `getJson<T>(path, params)` using `VITE_API_BASE_URL` (empty string means same origin/proxy). On non-2xx, parse FastAPI's `detail` and throw a typed error with a readable message.
- `hooks/useWindData.ts`: react-query hooks for meta, series, metrics, byHour, byHorizon. Query keys include start, end, cutoff. `staleTime: Infinity` (data never changes). `byHorizon` must not include cutoff in its key.
- Tests for the client (success, 422 error message, network failure) using a mocked `fetch`.

**Acceptance check:** tests pass; a temporary console log shows real `/api/meta` data.

### Step B3. Controls and state
**Tasks**
- `lib/range.ts`: window from meta, preset builders, `clamp(range)`.
- `Controls.tsx`: start and end `datetime-local` inputs in UTC with 30-minute steps (min/max from the window), preset buttons, cutoff `time` input (HH:MM). Validate `start < end` and show an inline message instead of calling the API when invalid.
- State lives in `App.tsx` (`range`, `cutoff`). Debounce changes (about 300 ms) before they hit the hooks.
- Tests for preset and clamp logic.

**Acceptance check:** changing controls updates state; invalid ranges show a message and no request is sent.

### Step B4. Main chart
**Tasks**
- `SeriesChart.tsx` (Recharts `ComposedChart`): actual line, forecast line, planning band as a shaded `Area` between `band_low` and `band_high`, `Brush` for zoom, tooltip showing time, forecast, actual, error, `publish_time` used, horizon.
- Nulls render as gaps. X axis in UTC (`dd MMM HH:mm`); thin out ticks for long ranges. Y axis in MW.
- Legend labels: "Actual (FUELHH)", "Forecast at decision time (WINDFOR)", "Historical error band".
- With full-month data (1,488 points) the chart must stay responsive: disable dots and animation.

**Acceptance check:** full month and a single day both render smoothly; tooltip values match the raw `/api/series` JSON for a chosen slot.

### Step B5. Metrics panel and KPIs
**Tasks**
- `KpiStrip.tsx`: average forecast, average actual (computed from the series), MAE, and bias in plain language ("Over-forecast by 1,852 MW on average").
- `MetricsPanel.tsx`: MAE, RMSE, bias, MAPE, P10/P50/P90, rows used and dropped. Short one-line help text under each metric (hover or inline).
- Both read from `/api/metrics` for the current selection.
- Handle `null` metrics (show an em dash, not "null" or NaN).

**Acceptance check:** values match `/api/metrics` for the same params; empty or all-null ranges show the empty state.

### Step B6. Error pattern charts
**Tasks**
- `ByHourChart.tsx`: bars of MAE by UTC hour (24 bars), with bias as a second series or tooltip.
- `ByHorizonChart.tsx`: bars of MAE by horizon bucket (0-6 ... 48+), with count in the tooltip. Add a caption: "Uses all published forecasts, hourly slots only. Does not depend on the cutoff."
- Both respond to the selected range; by-hour also to the cutoff.

**Acceptance check:** charts match the raw endpoint JSON; by-horizon does not refetch when only the cutoff changes.

### Step B7. Polish, states, methodology
**Tasks**
- `States.tsx`: skeleton loaders, error box with a Retry button (react-query `refetch`), empty state.
- `MethodologyNote.tsx` (collapsible): what the forecast line means (latest forecast published before the D-1 cutoff), the cutoff assumption, hourly-to-half-hourly carry-forward, error = forecast - actual, what the band is (in-sample P10-P90 of January errors), data sources (Elexon FUELHH and WINDFOR), UTC note.
- Responsive layout, keyboard-accessible controls, labels on all inputs, sensible `<title>` and favicon ("WindBand").
- A short "Data window: 1 Jan to 31 Jan 2026" line in the header.

**Acceptance check:** works at about 380 px width and desktop; kill the backend and confirm the error box and Retry work.

### Step B8. Frontend Docker, compose, Vercel
**Tasks**
- `frontend/Dockerfile`: multi-stage (node build, nginx serve), for local compose only.
- Add a `web` service to the root `docker-compose.yml` (port 3000, build context `./frontend`), build arg `VITE_API_BASE_URL=http://localhost:8000`.
- `frontend/vercel.json` only if needed for SPA fallback.
- Document the deploy: separate Vercel project with **Root Directory = `frontend`**, env var `VITE_API_BASE_URL` = backend Vercel URL, then add the frontend URL to the backend's `ALLOWED_ORIGINS` and redeploy the backend.

**Acceptance check:** `docker compose up` serves the app on :3000 talking to the backend on :8000.

### Step B9. End-to-end check
**Tasks**
- Walk the full journey locally: default view, change range, change cutoff, presets, brush zoom, by-hour/horizon charts, error states.
- Record for me: any value that looks odd, the largest single-slot error and its date, and the month-level bias. (I need these for the demo script.)
- Run `npm run build` and `npm test`; fix warnings.

**Acceptance check:** summary of results and anything that needs my decision.

---

## Rules of thumb
- Small functions, type hints, clear names.
- Tests focus on the decision-time and metrics logic, because that is where mistakes hurt most.
- If something in this document looks wrong or the API behaves differently, **stop and tell me** instead of guessing.