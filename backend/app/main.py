from fastapi import FastAPI

app = FastAPI(title="UK Wind Forecast Accuracy Portal")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
