"""Health check endpoint."""

from fastapi import APIRouter

from ..config import settings
from ..db.database import get_db_stats
from ..services.scanner import check_claude_api_status
from ..services.scheduler import get_scheduler_status
from ..services.telegram import get_telegram_status, send_telegram_message

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Health check with Claude API status."""
    claude_status = await check_claude_api_status()
    return {
        "status": "ok",
        "version": settings.version,
        "app": settings.app_name,
        "claude_api": claude_status,
        "database": get_db_stats(),
        "scheduler": get_scheduler_status(),
        "telegram": get_telegram_status(),
    }


@router.post("/telegram/test")
async def test_telegram():
    """Send a test message via Telegram to verify the bot is working."""
    ok = await send_telegram_message(
        "\ud83d\udfe2 <b>SC Hub Disruption Monitor</b>\n\n"
        "Test notification — Telegram integration is working.\n"
        "You will receive alerts when Critical or High severity "
        "disruptions are detected near SKF sites."
    )
    return {"sent": ok, "telegram": get_telegram_status()}
