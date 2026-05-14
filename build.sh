#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

echo "--- Downloading JDK 17 ---"
curl -L -o jdk.tar.gz \
  https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse
mkdir -p jdk
tar -xzf jdk.tar.gz -C jdk/ --strip-components=1
rm jdk.tar.gz

echo "--- Creating minimal JRE with jlink ---"
jdk/bin/jlink \
  --module-path jdk/jmods \
  --add-modules java.base,java.desktop,java.logging,java.net.http,java.sql,java.xml,java.naming,java.management,java.security.jgss,java.security.sasl,jdk.unsupported,jdk.zipfs,jdk.net,jdk.crypto.ec,jdk.localedata \
  --no-header-files --no-man-pages --strip-debug --compress=2 \
  --output jre
rm -rf jdk
echo "JRE dir size: $(du -sh jre)"

echo "--- Packing as uncompressed tar (faster extraction, no CPU decompression) ---"
tar -cf jre.tar jre/
rm -rf jre
echo "jre.tar size: $(du -sh jre.tar)"

echo "--- Root index.list for WebDevice ---"
printf "Mindustry.jar\njre.tar\n" > index.list

echo "--- Build complete ---"
