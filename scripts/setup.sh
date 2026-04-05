#!/bin/bash
set -e

echo "🚀 TLC WordPress Docker Setup"
echo "------------------------------"

# Check .env exists
if [ ! -f .env ]; then
  echo "❌ No .env file found. Copy .env.example to .env and fill in values."
  exit 1
fi

source .env

# Check wordpress directory has files
if [ ! -f wordpress/wp-settings.php ]; then
  echo "❌ No WordPress files found in ./wordpress/"
  echo "   Extract your site backup there before running setup."
  exit 1
fi

# Check dumps directory has a SQL file
if [ -z "$(ls -A dumps/*.sql 2>/dev/null)" ]; then
  echo "⚠️  No SQL dump found in ./dumps/ — database will be empty."
  echo "   Add your .sql file to ./dumps/ before starting if you need to import data."
fi

echo "✅ Checks passed. Building and starting containers..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for MariaDB to be ready..."
sleep 10

echo ""
echo "✅ Setup complete."
echo "   Site: http://localhost:${HTTP_PORT:-80}"
echo "   DB:   localhost:${DB_PORT:-3306}"
echo ""
echo "Next steps:"
echo "  1. Update wordpress/wp-config.php:"
echo "       DB_NAME:     ${DB_NAME}"
echo "       DB_USER:     ${DB_USER}"
echo "       DB_PASSWORD: ${DB_PASSWORD}"
echo "       DB_HOST:     db"
echo "  2. Update siteurl and home in the database:"
echo "       UPDATE wp_options SET option_value='${SITE_URL}'"
echo "       WHERE option_name IN ('siteurl','home');"
