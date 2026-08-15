#!/bin/bash
set -euo pipefail

# Only needed on Claude Code on the web, where the container starts bare.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install
