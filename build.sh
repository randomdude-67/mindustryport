#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

echo "--- Downloading JRE ---"
curl -L -o jre.tar.gz \
  https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse

echo "--- Extracting JRE ---"
mkdir -p jre
tar -xzf jre.tar.gz -C jre/ --strip-components=1
rm jre.tar.gz

echo "--- Generating index.list files for CheerpX WebDevice ---"
# CheerpX WebDevice needs an index.list in every directory it traverses.
# Each index.list is a newline-separated list of the names in that directory.
find jre -type d | while read dir; do
  ls "$dir" > "$dir/index.list"
done

# Root-level index.list so CheerpX can see Mindustry.jar and jre/
printf "Mindustry.jar\njre\n" > index.list

echo "--- Build complete ---"
