FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies using layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and Parquet data snapshot
COPY app/ ./app/
COPY data/ ./data/

# Create a non-root user and switch to it
RUN useradd -u 1000 -m appuser && chown -R appuser:appuser /app
USER appuser

# Expose default port
EXPOSE 8000

# Start Uvicorn for local container runs
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

