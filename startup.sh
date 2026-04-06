#!/bin/bash
set -e

agentsh server start &
AGENTSH_PID=$!

echo "Waiting for agentsh server..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:18080/health > /dev/null 2>&1; then
    echo "agentsh server is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: agentsh server failed to start"
    exit 1
  fi
  sleep 1
done

agentsh shim install
echo "Shell shim installed"

agentsh exec --root=/workspace warmup -- /bin/bash -c '/usr/bin/echo "shim ready"' || echo "Warmup returned non-zero (expected with enforcement)"
echo "Shim warmed up"

echo "Starting Express app on port ${PORT:-10000}..."
exec node /app/src/index.js
