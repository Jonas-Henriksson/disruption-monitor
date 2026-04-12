#!/bin/bash
# Backup git repository to S3
# Usage: ./backup-git.sh [--profile skf]
# Runs automatically as part of deploy-frontend.sh and deploy-backend.sh

set -e

PROFILE_ARG=""
if [ "$1" = "--profile" ]; then
  PROFILE_ARG="--profile $2"
fi

BUCKET="sc-monitor-frontend-317683112105"
REGION="eu-west-1"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/disruption-monitor-backup"

echo "Backing up git repo to S3..."

# Create bare clone
rm -rf "$BACKUP_DIR"
git clone --bare /home/ubuntu/disruption-monitor "$BACKUP_DIR" --quiet 2>/dev/null

# Archive and upload
cd /tmp
tar czf disruption-monitor-repo.tar.gz -C /tmp disruption-monitor-backup

# Upload as latest + timestamped copy
aws s3 cp disruption-monitor-repo.tar.gz \
  "s3://$BUCKET/git-backup/disruption-monitor-repo.tar.gz" \
  --region "$REGION" $PROFILE_ARG --quiet

aws s3 cp disruption-monitor-repo.tar.gz \
  "s3://$BUCKET/git-backup/disruption-monitor-repo-$TIMESTAMP.tar.gz" \
  --region "$REGION" $PROFILE_ARG --quiet

# Keep only last 10 timestamped backups
aws s3 ls "s3://$BUCKET/git-backup/" --region "$REGION" $PROFILE_ARG \
  | grep "disruption-monitor-repo-" \
  | sort -r \
  | tail -n +11 \
  | awk '{print $4}' \
  | while read -r old; do
      aws s3 rm "s3://$BUCKET/git-backup/$old" --region "$REGION" $PROFILE_ARG --quiet
    done

# Cleanup
rm -rf "$BACKUP_DIR" /tmp/disruption-monitor-repo.tar.gz

echo "Git backup complete (s3://$BUCKET/git-backup/)"
