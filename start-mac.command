#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js is not installed yet. Install the LTS version from https://nodejs.org, then open this again."
  open https://nodejs.org
  read -p "Press Enter to close..."
  exit 1
fi
node server.js --open
read -p "Lumen stopped. If you saw an error above, screenshot it. Press Enter to close..."
