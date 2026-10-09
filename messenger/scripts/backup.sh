#!/bin/sh
# Sichert Datenbank (pg_dump, komprimiert) und Uploads. Aufbewahrung: 14 Tage.
# Nutzung: backup.sh <DATABASE_URL> <Zielordner> [Upload-Ordner]
set -eu
DB_URL="${1:?DATABASE_URL fehlt}"
OUT="${2:?Zielordner fehlt}"
UPLOADS="${3:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
pg_dump --format=custom --no-owner --dbname="$DB_URL" --file="$OUT/db-$STAMP.dump"
if [ -n "$UPLOADS" ] && [ -d "$UPLOADS" ]; then
  tar -C "$UPLOADS" -czf "$OUT/uploads-$STAMP.tar.gz" .
fi
find "$OUT" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete
echo "Backup erstellt: $OUT/db-$STAMP.dump"
