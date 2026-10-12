#!/usr/bin/env bash
# Exécute les paliers de charge k6 (10 / 25 / 50 / 100 VUs) contre l'instance de
# TEST et relève en parallèle CPU / RAM / PostgreSQL. Résultats bruts : reports/k6/.
# Usage : ./nfr/k6/run-load-tests.sh [paliers...]   (défaut : 10 25 50 100)
cd "$(dirname "$0")/../.."
K6="${K6_BIN:-/c/Program Files/k6/k6.exe}"
BASE_URL="${BASE_URL:-http://127.0.0.1:4100}"
LEVELS=("$@"); [ ${#LEVELS[@]} -eq 0 ] && LEVELS=(10 25 50 100)
mkdir -p reports/k6

for VUS in "${LEVELS[@]}"; do
  echo "=== Palier ${VUS} VUs — $(date -Iseconds) ==="
  RES="reports/k6/resources-${VUS}vus.json"
  rm -f "$RES.stop"
  node nfr/k6/resource-sampler.js "$RES" &
  SAMPLER=$!
  sleep 3
  "$K6" run --quiet -e VUS="$VUS" -e DURATION="${DURATION:-60s}" -e BASE_URL="$BASE_URL" \
    -e OUT="reports/k6/summary-${VUS}vus.json" nfr/k6/api-load.js > "reports/k6/k6-${VUS}vus.log" 2>&1
  echo "k6 exit=$?" >> "reports/k6/k6-${VUS}vus.log"
  touch "$RES.stop"; wait $SAMPLER
  sleep "${COOLDOWN:-15}"
done
echo "=== Terminé — $(date -Iseconds) ==="
