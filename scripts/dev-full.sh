#!/usr/bin/env bash
# Adaptado das funções de desenvolvimento do Bizy para o NaDM.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dev.mjs" --ngrok "$@"
