"""
Vercel Serverless Function entrypoint.
Exposes the FastAPI application instance `app`.
"""

from pathlib import Path
import sys

# Ensure backend directory is in sys.path for module resolution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app  # noqa: E402

__all__ = ["app"]
