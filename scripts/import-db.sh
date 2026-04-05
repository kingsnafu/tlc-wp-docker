#!/bin/bash
set -e
source .env

DUMP_FILE=$(ls dumps/*.sql 2>/dev/null | head -1)

if [ -z "$DUMP_FILE" ]; then
  echo "❌ No SQL file found in dumps/"
  exit 1
fi

echo "📦 Importing $DUMP_FILE into ${DB_NAME}..."
docker compose exec -T db mariadb \
  -u "$DB_USER" \
  -p"$DB_PASSWORD" \
  "$DB_NAME" < "$DUMP_FILE"

echo "✅ Database imported."
