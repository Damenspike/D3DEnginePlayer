#!/usr/bin/env bash
set -e

echo "=== Building D3D Editor for macOS, Windows, and Linux ==="

# clear build folder
rm -rf dist-editor-build/*

yarn build:editor
npx electron-builder -mw --x64 --arm64 --publish=never --config   scripts/electron-builder.editor.yml

echo "=== Editor build complete ==="
