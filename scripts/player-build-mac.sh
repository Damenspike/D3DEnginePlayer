#!/usr/bin/env bash
set -e

echo "=== Building D3D Player for macOS ==="

# Build the Vite player bundle
yarn build:player

# Build macOS app only (mac x64 + arm64 universal supported by electron-builder)
npx electron-builder --mac --config scripts/electron-builder.player.yml

echo "=== macOS Player build complete ==="