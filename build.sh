#!/bin/bash
set -e

echo "--- Downloading Mindustry.jar ---"
curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

echo "--- Installing genext2fs ---"
apt-get install -y genext2fs -q

echo "--- Downloading JDK 17 (needed for jlink) ---"
curl -L -o jdk.tar.gz \
  https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse

echo "--- Extracting JDK ---"
mkdir -p jdk
tar -xzf jdk.tar.gz -C jdk/ --strip-components=1
rm jdk.tar.gz

echo "--- Creating minimal JRE with jlink ---"
jdk/bin/jlink \
  --module-path jdk/jmods \
  --add-modules java.base,java.desktop,java.logging,java.net.http,java.sql,java.xml,java.naming,java.management,java.security.jgss,java.security.sasl,jdk.unsupported,jdk.zipfs,jdk.net,jdk.crypto.ec,jdk.localedata \
  --no-header-files \
  --no-man-pages \
  --strip-debug \
  --compress=2 \
  --output jre
rm -rf jdk
echo "JRE dir size: $(du -sh jre)"

echo "--- Packing JRE into ext2 image ---"
JRE_KB=$(du -sk jre | cut -f1)
EXT2_KB=$(( JRE_KB * 130 / 100 + 10240 ))
echo "Creating ${EXT2_KB} KB ext2 image..."
genext2fs -d jre -b "$EXT2_KB" -N 32768 jre.ext2
rm -rf jre
echo "jre.ext2 size: $(du -sh jre.ext2)"

echo "--- Root index.list for WebDevice (Mindustry.jar only) ---"
printf "Mindustry.jar\n" > index.list

echo "--- Build complete ---"
