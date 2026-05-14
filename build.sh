#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

echo "--- Downloading pre-built JRE ext2 image ---"
curl -L -o jre.ext2 \
  https://github.com/randomdude-67/mindustryport/releases/download/jre-v17/jre.ext2
echo "jre.ext2 size: $(du -sh jre.ext2)"

echo "--- Root index.list for WebDevice ---"
printf "Mindustry.jar\n" > index.list

echo "--- Build complete ---"
