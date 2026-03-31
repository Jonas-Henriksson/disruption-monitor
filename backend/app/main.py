"""SC Hub Disruption Monitor -- FastAPI application entry point.

Start with:
    uvicorn backend.app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .seed.seed_db import seed_if_empty
from .services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s v%s", settings.app_name, settings.version)
    if settings.has_claude_api:
        logger.info("Claude API key configured -- live scanning available")
    else:
        logger.info("No Claude API key -- serving sample data only")

    # Seed database with sample data if empty
    seeded = seed_if_empty()
    if seeded:
        logger.info("Seeded %d events into database", seeded)

    # Start background scanning (only when API key is configured)
    start_scheduler()

    yield

    # Shutdown
    await stop_scheduler()
    logger.info("Scheduler stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,       # http://localhost:3100
        "http://127.0.0.1:3100",
        "https://d2rbfnbkfx00z5.cloudfront.net",  # AWS CloudFront
        "*",                         # Allow any origin in AWS (Lambda Function URL)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────
from .routers import events, health, scans, sites, suppliers, tickets  # noqa: E402

API_PREFIX = "/api/v1"

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(scans.router, prefix=API_PREFIX)
app.include_router(sites.router, prefix=API_PREFIX)
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(tickets.router, prefix=API_PREFIX)

# ── Lambda handler (Mangum) ─────────────────────────────────────
# When running on AWS Lambda, Mangum translates API Gateway / Function URL
# events into ASGI requests that FastAPI handles natively.
# Locally, this is ignored — uvicorn is the entry point.
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="auto")
except ImportError:
    # Mangum not installed — running locally with uvicorn
    handler = None
