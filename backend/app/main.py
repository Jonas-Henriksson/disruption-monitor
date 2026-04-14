"""SC Hub Disruption Monitor -- FastAPI application entry point.

Start with:
    uvicorn backend.app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .middleware.logging_middleware import RequestIdMiddleware, configure_logging
from .seed.seed_db import seed_if_empty
from .services.scheduler import start_scheduler, stop_scheduler

# Configure structured logging (JSON on Lambda, human-readable locally)
configure_logging(debug=settings.debug)
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

# ── Request ID middleware ────────────────────────────────────────
app.add_middleware(RequestIdMiddleware)

# ── CORS ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,       # http://localhost:3100
        "http://localhost:3101",      # Backend Swagger UI
        "http://127.0.0.1:3100",
        "https://d2rbfnbkfx00z5.cloudfront.net",  # AWS CloudFront
        "https://z4o3tejpdx3ouhqli24b4cv22m0visyh.lambda-url.eu-west-1.on.aws",  # Lambda Function URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────
from .routers import actions, events, exposure, graph, health, scans, sites, supplier_sites, suppliers, tickets, webhooks  # noqa: E402

API_PREFIX = "/api/v1"

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(scans.router, prefix=API_PREFIX)
app.include_router(sites.router, prefix=API_PREFIX)
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(supplier_sites.router, prefix=API_PREFIX)
app.include_router(tickets.router, prefix=API_PREFIX)
app.include_router(actions.router, prefix=API_PREFIX)
app.include_router(graph.router, prefix=API_PREFIX)
app.include_router(webhooks.router, prefix=API_PREFIX)
app.include_router(exposure.router, prefix=API_PREFIX)

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
