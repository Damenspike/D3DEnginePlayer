#!/usr/bin/env bash
set -e

echo "=== Building D3D Editor for macOS ==="

# Build the Vite player bundle
yarn build:editor

# Build macOS app only (mac x64 + arm64 universal supported by electron-builder)
npx electron-builder --mac --config scripts/electron-builder.editor.yml

echo "=== macOS Editor build complete ==="