#!/bin/zsh
# The shaman, built in Blender by Boulder's town pipeline from shaman.py, then finished (scaled to her height) into
# 09/assets/shaman_{hi,lo}.bin.gz. Run from the codevember root: zsh 09/character/build.sh [--stage body]
set -e
cd "${0:A:h}"
BOULDER=${BOULDER:-~/codeprojects/boulder}
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
mkdir -p export renders
$BLENDER -b --factory-startup --python build.py -- --who shaman --export "$PWD/export" --renders "$PWD/renders" "$@"
python3 finish.py
