# file responsible for defining the FastAPI application instance and its configuration.

"""
Vercel Serverless Function entrypoint.
Exposes the FastAPI application instance `app`.
"""

import sys
from pathlib import Path

# Ensure backend directory is in sys.path for module resolution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

__all__ = ["app"]
