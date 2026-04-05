#!/bin/bash
set -e
source .env

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="dumps/${SITE_SLUG}-${TIMESTAMP}.sql"

echo "💾 Exporting database to ${OUTPUT}..."
docker compose exec -T db mariadb-dump \
  -u "$DB_USER" \
  -p"$DB_PASSWORD" \
  "$DB_NAME" > "$OUTPUT"

echo "✅ Exported to ${OUTPUT}"
