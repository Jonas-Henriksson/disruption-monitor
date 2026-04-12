"""Application configuration via environment variables."""

import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env early so both prefixed and unprefixed vars are available
load_dotenv()


class Settings(BaseSettings):
    app_name: str = "SC Hub Disruption Monitor API"
    debug: bool = False
    version: str = "0.1.0"

    # CORS -- frontend origin
    frontend_url: str = "http://localhost:3100"

    # Anthropic Claude API -- for live scanning
    # Accepts TARS_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY
    anthropic_api_key: str = os.environ.get("TARS_ANTHROPIC_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")

    # AWS Bedrock -- alternative to direct Anthropic API
    use_bedrock: bool = os.environ.get("USE_BEDROCK", "").lower() in ("1", "true", "yes")
    aws_region: str = os.environ.get("AWS_REGION", "eu-west-1")

    # Claude model for scanning
    # Direct API: claude-sonnet-4-20250514
    # Bedrock:    eu.anthropic.claude-sonnet-4-6
    claude_model: str = os.environ.get("TARS_CLAUDE_MODEL", "") or os.environ.get("CLAUDE_MODEL", "") or "claude-sonnet-4-20250514"

    # Database — on Lambda, use /tmp/ (writable, persists across warm invocations)
    db_path: str = os.environ.get("TARS_DB_PATH", "") or (
        "/tmp/disruption_monitor.db" if os.environ.get("AWS_LAMBDA_FUNCTION_NAME") else "disruption_monitor.db"
    )

    # S3 persistence — sync SQLite DB to/from S3 on Lambda for cross-invocation persistence
    # Set DB_S3_BUCKET and optionally DB_S3_KEY to enable
    db_s3_bucket: str = os.environ.get("DB_S3_BUCKET", "")
    db_s3_key: str = os.environ.get("DB_S3_KEY", "data/disruption_monitor.db")

    @property
    def has_s3_persistence(self) -> bool:
        """True when S3 DB sync is configured."""
        return bool(self.db_s3_bucket)

    # Scanning defaults
    # Tactical cadence (frequent) — fast-moving events like natural disasters
    scan_interval_minutes_disruptions: int = 15
    # Strategic cadence (less frequent) — slower-moving geopolitical shifts
    scan_interval_minutes_geopolitical: int = 60
    # Strategic cadence (least frequent) — trade policy evolves slowly
    scan_interval_minutes_trade: int = 120

    # Azure Entra ID authentication (MSAL SSO)
    # Reads TARS_AZURE_*, AZURE_*, or MS_GRAPH_* prefixed env vars
    azure_client_id: str = os.environ.get("TARS_AZURE_CLIENT_ID", "") or os.environ.get("AZURE_CLIENT_ID", "") or os.environ.get("MS_GRAPH_CLIENT_ID", "") or ""
    azure_tenant_id: str = os.environ.get("TARS_AZURE_TENANT_ID", "") or os.environ.get("AZURE_TENANT_ID", "") or os.environ.get("MS_GRAPH_TENANT_ID", "") or ""
    auth_enabled: bool = (
        os.environ.get("TARS_AUTH_ENABLED", "").lower() in ("1", "true", "yes")
        or os.environ.get("AUTH_ENABLED", "").lower() in ("1", "true", "yes")
        or bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))  # auto-enable on Lambda
    )

    # Telegram push notifications
    telegram_bot_token: str = os.environ.get("TARS_TELEGRAM_BOT_TOKEN", "") or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_ids: str = os.environ.get("TARS_TELEGRAM_ALLOWED_USER_IDS", "") or os.environ.get("TELEGRAM_ALLOWED_USER_IDS", "")
    telegram_min_severity: str = "High"  # Minimum severity to send alerts: Critical, High, Medium, Low

    # Outbound webhooks / event bus
    webhook_urls: str = os.environ.get("WEBHOOK_URLS", "")  # comma-separated HTTP(S) endpoints
    sns_topic_arn: str = os.environ.get("SNS_TOPIC_ARN", "")  # AWS SNS topic ARN

    # MS Graph API (sandbox mode -- all messages go to sandbox recipient only)
    graph_sandbox_enabled: bool = os.environ.get("GRAPH_SANDBOX", "true").lower() in ("1", "true", "yes")
    graph_sandbox_recipient: str = os.environ.get("GRAPH_SANDBOX_RECIPIENT", "jonas.henriksson@skf.com")

    # Daily email digest
    digest_enabled: bool = os.environ.get("DIGEST_ENABLED", "false").lower() in ("1", "true", "yes")
    digest_recipients: str = os.environ.get("DIGEST_RECIPIENTS", "")  # comma-separated emails

    model_config = {"env_file": ".env", "env_prefix": "TARS_", "extra": "ignore"}

    @property
    def has_claude_api(self) -> bool:
        """True when Claude is available (direct API key OR Bedrock via IAM)."""
        return bool(self.anthropic_api_key) or self.use_bedrock

    @property
    def has_telegram(self) -> bool:
        """True when Telegram bot token and at least one chat ID are configured."""
        return bool(self.telegram_bot_token and self.telegram_chat_ids)


settings = Settings()
