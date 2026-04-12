#!/bin/bash
# Deploy FastAPI backend to AWS Lambda
# Usage: ./deploy-backend.sh [--profile skf]
#
# This packages the FastAPI app with Mangum for Lambda deployment.
# The Lambda function handler is: backend.app.main.handler

set -e

PROFILE_ARG=""
if [ "$1" = "--profile" ]; then
  PROFILE_ARG="--profile $2"
fi

FUNCTION_NAME="sc-monitor-scan"
REGION="eu-west-1"
PACKAGE_DIR="/tmp/sc-monitor-lambda"
ZIP_FILE="/tmp/sc-monitor-lambda.zip"

echo "=== SC Hub Disruption Monitor — Lambda Deployment ==="

# Clean previous build
rm -rf "$PACKAGE_DIR" "$ZIP_FILE"
mkdir -p "$PACKAGE_DIR"

# Install dependencies into package directory
echo "Installing Python dependencies..."
pip install \
  fastapi pydantic pydantic-settings python-dotenv \
  anthropic httpx mangum boto3 "python-jose[cryptography]" \
  --target "$PACKAGE_DIR" \
  --quiet --no-cache-dir \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  2>&1 | tail -5

# For packages without binary wheels, install without platform constraint
pip install \
  mangum pydantic-settings python-dotenv \
  --target "$PACKAGE_DIR" \
  --quiet --no-cache-dir \
  2>&1 | tail -3

# Copy backend code
echo "Copying backend code..."
cp -r backend "$PACKAGE_DIR/"

# Remove test files and __pycache__ to save space
find "$PACKAGE_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$PACKAGE_DIR" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
rm -rf "$PACKAGE_DIR/backend/tests" 2>/dev/null || true

# Create zip
echo "Creating deployment package..."
cd "$PACKAGE_DIR"
zip -r "$ZIP_FILE" . -q
cd -

ZIP_SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
echo "Package size: $ZIP_SIZE"

# Check if it exceeds Lambda's 50MB zip limit (250MB unzipped)
ZIP_BYTES=$(stat -c%s "$ZIP_FILE" 2>/dev/null || stat -f%z "$ZIP_FILE" 2>/dev/null)
if [ "$ZIP_BYTES" -gt 52428800 ]; then
  echo "WARNING: Package exceeds 50MB Lambda zip limit. Use S3 upload or container image."
  echo "Uploading to S3 first..."
  aws s3 cp "$ZIP_FILE" s3://sc-monitor-frontend-317683112105/lambda/sc-monitor-scan.zip \
    --region "$REGION" $PROFILE_ARG
  echo "Updating Lambda from S3..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --s3-bucket sc-monitor-frontend-317683112105 \
    --s3-key lambda/sc-monitor-scan.zip \
    --region "$REGION" $PROFILE_ARG
else
  echo "Updating Lambda function..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$REGION" $PROFILE_ARG
fi

echo ""
echo "Setting Lambda configuration..."
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --handler "backend.app.main.handler" \
  --runtime "python3.12" \
  --timeout 300 \
  --memory-size 512 \
  --environment "Variables={USE_BEDROCK=true,TARS_CLAUDE_MODEL=eu.anthropic.claude-sonnet-4-6,AUTH_ENABLED=false,AZURE_CLIENT_ID=6b72bb18-c3ae-4fc1-a2ed-ae335e43c2a0,AZURE_TENANT_ID=41875f2b-33e8-4670-92a8-f643afbb243a,DB_S3_BUCKET=sc-monitor-frontend-317683112105,DB_S3_KEY=data/disruption_monitor.db,ALLOWED_ORIGIN=*}" \
  --region "$REGION" $PROFILE_ARG \
  2>&1 | grep -E "FunctionName|Handler|Runtime|Timeout|MemorySize"

echo ""
echo "=== Deployment complete ==="
echo "Function: $FUNCTION_NAME"
echo "Handler: backend.app.main.handler"
echo "Function URL: https://z4o3tejpdx3ouhqli24b4cv22m0visyh.lambda-url.$REGION.on.aws"
echo ""
echo "Test with:"
echo "  curl https://z4o3tejpdx3ouhqli24b4cv22m0visyh.lambda-url.$REGION.on.aws/api/v1/health"

# Backup git repo to S3
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/backup-git.sh" $PROFILE_ARG

# Cleanup
rm -rf "$PACKAGE_DIR"
echo "Done."
