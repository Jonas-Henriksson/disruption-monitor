FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ backend/

# Create data directory for SQLite
RUN mkdir -p /data

# Environment defaults (override at runtime)
ENV USE_BEDROCK=true
ENV AWS_REGION=eu-west-1
ENV TARS_CLAUDE_MODEL=eu.anthropic.claude-sonnet-4-6
ENV TARS_DB_PATH=/data/disruption_monitor.db
ENV TARS_FRONTEND_URL=https://d2rbfnbkfx00z5.cloudfront.net

# Port
EXPOSE 3101

# Run FastAPI with uvicorn
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "3101"]
