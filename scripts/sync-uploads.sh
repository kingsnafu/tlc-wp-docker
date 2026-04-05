#!/bin/bash
set -e
source .env

# Usage:
#   ./scripts/sync-uploads.sh push   — local -> object storage
#   ./scripts/sync-uploads.sh pull   — object storage -> local

DIRECTION=${1:-push}
REMOTE="linode:${SITE_SLUG}-uploads"
LOCAL="./wordpress/wp-content/uploads/"

if [ "$DIRECTION" = "push" ]; then
  echo "⬆️  Syncing uploads to ${REMOTE}..."
  rclone sync "$LOCAL" "$REMOTE" --progress
  echo "✅ Uploads pushed."
elif [ "$DIRECTION" = "pull" ]; then
  echo "⬇️  Syncing uploads from ${REMOTE}..."
  rclone sync "$REMOTE" "$LOCAL" --progress
  echo "✅ Uploads pulled."
else
  echo "❌ Unknown direction: $DIRECTION"
  echo "   Usage: ./scripts/sync-uploads.sh [push|pull]"
  exit 1
fi
