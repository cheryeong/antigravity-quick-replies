#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=bin/find-node.sh
source "${SCRIPT_DIR}/../bin/find-node.sh"
NODE_BIN="$(find_node_bin || true)"
if [[ -z "$NODE_BIN" ]]; then
  printf '{}\n'
  exit 0
fi
exec "$NODE_BIN" "${SCRIPT_DIR}/stop-check.mjs"
