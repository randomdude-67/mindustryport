#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

echo "--- Downloading Java 8 JRE (32-bit x86 — CheerpX only runs 32-bit ELFs) ---"
curl -L -o jre.tar.gz \
  https://api.adoptium.net/v3/binary/latest/8/ga/linux/x32/jre/hotspot/normal/eclipse
echo "JRE size: $(du -sh jre.tar.gz)"

echo "--- Root index.list ---"
printf "Mindustry.jar\njre.tar.gz\n" > index.list

echo "--- Build complete ---"
