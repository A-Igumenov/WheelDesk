#!/usr/bin/env bash
# Double-click in Finder: builds WheelDesk for Apple Silicon (M1/M2/M3/M4).
# Installs missing tools on the first run (Xcode Command Line Tools, Node.js, Rust).
cd "$(dirname "$0")"
chmod +x scripts/build-macos.sh
./scripts/build-macos.sh --install --arm --skip-tests
echo
read -r -p "Press Enter to close this window…" _
