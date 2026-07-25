#!/bin/zsh
# Pi Web Desktop - macOS launcher
# Double-click this file in Finder to start Pi Web Desktop.
# (First time: right-click -> Open, then confirm, to bypass Gatekeeper.)

# Resolve the directory this script lives in, even when double-clicked
appDir="$(cd "$(dirname "$0")" && pwd)"
cd "$appDir" || exit 1

electronBin="$appDir/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
mainJs="$appDir/electron/main.js"

# Verify electron binary exists
if [ ! -x "$electronBin" ]; then
    echo "Electron binary not found."
    echo "Path: $electronBin"
    echo "Please run 'npm install' in the pi-web directory first."
    read -r "?Press Enter to close..."
    exit 1
fi

# Clear ELECTRON_RUN_AS_NODE so Electron runs as a GUI app, not plain Node.js
unset ELECTRON_RUN_AS_NODE

# Launch Electron detached so this terminal window can be closed
nohup "$electronBin" "$mainJs" >/dev/null 2>&1 &
disown
