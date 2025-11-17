#!/usr/bin/env bash
set -e

echo "=== Building D3D Player for macOS, Windows, and Linux ==="

yarn build:player
npx electron-builder -mwl --config scripts/electron-builder.player.yml

echo "=== Player build complete ==="
