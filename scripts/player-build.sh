#!/usr/bin/env bash
set -e

echo "=== Building D3D Player for macOS, Windows, and Linux ==="

# clear build folder
rm -rf dist-player-build/*

yarn build:player
npx electron-builder -mw --x64 --arm64 --publish=never --config  scripts/electron-builder.player.yml

# make projectors
#rm -rf public/engine/projectors/linux
#rm -rf public/engine/projectors/mac
#rm -rf public/engine/projectors/win

#mkdir public/engine/projectors/linux
#mkdir public/engine/projectors/mac
#mkdir public/engine/projectors/win

#mkdir public/engine/projectors/linux/arm64
#mkdir public/engine/projectors/linux/x64

#mkdir public/engine/projectors/mac/arm64
#mkdir public/engine/projectors/mac/x64

#mkdir public/engine/projectors/win/arm64
#mkdir public/engine/projectors/win/x64

#cp -r "dist-player-build/mac-arm64/Damen3D Player.app" "public/engine/projectors/mac/arm64/CustomPlayer.app"
#cp -r "dist-player-build/mac/Damen3D Player.app"       "public/engine/projectors/mac/x64/CustomPlayer.app"

#cp -r dist-player-build/linux-arm64-unpacked/* "public/engine/projectors/linux/arm64"
#cp -r dist-player-build/linux-unpacked/*       "public/engine/projectors/linux/x64"

#cp -r dist-player-build/win-arm64-unpacked/*   "public/engine/projectors/win/arm64"
#cp -r dist-player-build/win-unpacked/*         "public/engine/projectors/win/x64"

echo "=== Player build complete ==="
