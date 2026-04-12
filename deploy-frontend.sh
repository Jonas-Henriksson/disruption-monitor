#!/bin/bash
# Deploy frontend to S3 + CloudFront
# Usage: ./deploy-frontend.sh [--profile skf]

PROFILE_ARG=""
if [ "$1" = "--profile" ]; then
  PROFILE_ARG="--profile $2"
fi

BUCKET="sc-monitor-frontend-317683112105"
DISTRIBUTION="E2XQOK89HTZGBN"
REGION="eu-west-1"

# Set the backend URL for the build
# Change this to your ECS/Lambda backend URL once deployed
export VITE_API_URL="https://z4o3tejpdx3ouhqli24b4cv22m0visyh.lambda-url.eu-west-1.on.aws"

echo "Building frontend..."
cd frontend && npm run build && cd ..

echo "Syncing to S3..."
aws s3 sync frontend/dist/ s3://$BUCKET/ \
  --region $REGION \
  --delete \
  --exclude "data/*" \
  --exclude "knowledge-base/*" \
  --exclude "lambda/*" \
  $PROFILE_ARG

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION \
  --paths "/*" \
  --region $REGION \
  $PROFILE_ARG

echo "Done! Live at: https://d2rbfnbkfx00z5.cloudfront.net"
