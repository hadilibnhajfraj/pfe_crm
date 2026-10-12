#!/usr/bin/env bash
# Démarre une instance du backend ISOLÉE pour l'audit non fonctionnel :
# port 4100, base <DB_NAME>_test, limiteurs de débit désactivés
# (NODE_ENV=test), aucun e-mail sortant possible.
cd "$(dirname "$0")/.."
DB_BASE=$(grep -E '^DB_NAME=' .env | cut -d= -f2 | tr -d '\r')
export NODE_ENV=test
export PORT=${NFR_PORT:-4100}
export DB_NAME="${DB_BASE}_test"
export AUTO_EMAIL_JOBS_ENABLED=false
export EMAIL_HOST=127.0.0.1
export EMAIL_PORT=2525
export METRICS_TOKEN=${METRICS_TOKEN:-nfr-metrics-token}
exec node src/app.js
