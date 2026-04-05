#!/bin/bash
source .env
docker compose up -d
echo "✅ Started. Site at http://localhost:${HTTP_PORT:-80}"
