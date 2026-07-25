#!/bin/zsh
# Pi Web Desktop - macOS launcher (via node launcher.js)
# Double-click to start the desktop app.
# Logs are written to pi-web/logs/pi-web-desktop.log

scriptDir="$(cd "$(dirname "$0")" && pwd)"

# Resolve node from PATH; fall back to common macOS install locations
nodeBin="$(command -v node)"
if [ -z "$nodeBin" ]; then
    for candidate in \
        /usr/local/bin/node \
        /opt/homebrew/bin/node \
        "$HOME/.volta/bin/node" \
        "$HOME/.nvm/versions/node"/*/bin/node; do
        if [ -x "$candidate" ]; then
            nodeBin="$candidate"
            break
        fi
    done
fi

if [ -z "$nodeBin" ]; then
    echo "node was not found on PATH or in common install locations."
    echo "Please install Node.js (https://nodejs.org) first."
    read -r "?Press Enter to close..."
    exit 1
fi

# launcher.js spawns Electron detached and exits; run in background so the
# terminal window can be closed immediately
nohup "$nodeBin" "$scriptDir/launcher.js" >/dev/null 2>&1 &
disown
