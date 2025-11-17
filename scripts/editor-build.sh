#!/usr/bin/env bash
set -e

echo "=== Building D3D Editor for macOS, Windows, and Linux ==="

yarn build:editor
npx electron-builder -mwl --config scripts/electron-builder.editor.yml

echo "=== Editor build complete ==="
