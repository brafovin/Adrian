#!/bin/sh
# Prüft, dass ein Backup wiederherstellbar ist: Dump in eine Wegwerf-Datenbank einspielen und
# Kennzahlen mit der Quelle vergleichen. Beendet mit Fehlercode ≠ 0, wenn etwas nicht stimmt.
# Nutzung: restore-test.sh <DATABASE_URL der Quelle> <Dump-Datei> [Admin-URL zum Anlegen der Test-DB]
set -eu
SRC="${1:?Quell-DATABASE_URL fehlt}"
DUMP="${2:?Dump-Datei fehlt}"
ADMIN="${3:-${SRC%/*}/postgres}"
TMPDB="restore_test_$$"
cleanup() { psql "$ADMIN" -qc "drop database if exists $TMPDB with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql "$ADMIN" -qc "create database $TMPDB"
TARGET="${ADMIN%/*}/$TMPDB"
pg_restore --no-owner --dbname="$TARGET" "$DUMP"
for t in users conversations messages media statuses calls schema_migrations; do
  a="$(psql "$SRC" -Atc "select count(*) from $t")"
  b="$(psql "$TARGET" -Atc "select count(*) from $t")"
  if [ "$a" != "$b" ]; then echo "FEHLER: $t Quelle=$a Wiederherstellung=$b" >&2; exit 1; fi
  echo "ok  $t: $b Zeilen"
done
echo "Wiederherstellung erfolgreich verifiziert."
