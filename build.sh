#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar
echo "size: $(du -sh Mindustry.jar)"

echo "--- Downloading dependencies.jar ---"
curl -L -o dependencies.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/dependencies.jar
echo "size: $(du -sh dependencies.jar)"

echo "--- Build complete ---"
