#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=bin/find-node.sh
source "${SCRIPT_DIR}/find-node.sh"
NODE_BIN="$(find_node_bin || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "quick-replies: could not find node (checked PATH, volta, mise, asdf, nodenv, fnm, nvm, homebrew, and standard paths)" >&2
  exit 127
fi
exec "$NODE_BIN" "${SCRIPT_DIR}/../dist/server.mjs" "$@"
