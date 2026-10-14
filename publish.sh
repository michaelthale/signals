#!/usr/bin/env bash
# Hourly: refresh public context JSON and push to GitHub Pages (michaelthale/signals). Public market data only.
set -euo pipefail
cd "$(dirname "$0")"
python3 update_context.py >/dev/null
git add -A index.html app.js lightweight-charts.js data/context.json update_context.py publish.sh .nojekyll
git diff --cached --quiet || { git commit -qm "context $(date '+%F %H:%M %Z')" && git push -q origin HEAD; }
