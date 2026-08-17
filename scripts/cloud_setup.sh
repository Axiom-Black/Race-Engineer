#!/bin/bash
# SessionStart hook — prepare a Claude Code cloud session to run the gates.
#
# Cloud sessions clone the repo into a fresh container with no node_modules,
# so Vitest (Ring 4) and oxlint cannot run until deps are installed. Local
# checkouts already have theirs, so this is a no-op off-cloud.
#
# The npm project lives in frontend/, not the repo root — there is no root
# package.json. Backend (Ring 0/1, Python) deps are NOT installed here:
# `pip install -e ".[dev]"` pulls numpy/pandas/scipy/anthropic and would add
# minutes to every session start. Run it by hand from backend/ when you need
# the Python suite.
#
# Never fail the session: every path exits 0.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}/frontend" || exit 0

npm ci --no-fund --no-audit || npm install --no-fund --no-audit

# npm optional-deps bug (npm/cli#4828): rolldown's platform binding can be
# skipped, which breaks Vitest. Same guard as .github/workflows/ci.yml.
node -e "require('rolldown')" 2>/dev/null \
  || npm install --no-save --force @rolldown/binding-linux-x64-gnu

exit 0
