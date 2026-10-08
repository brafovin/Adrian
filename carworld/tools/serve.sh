#!/bin/sh
# Startet einen einfachen Webserver für das Spiel (ES-Module brauchen http://).  Aufruf: tools/serve.sh [Port]
cd "$(dirname "$0")/.." && exec python3 -m http.server "${1:-8732}"
