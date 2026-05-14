#!/bin/bash
set -e

curl -L -o Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar

curl -L -o jre.tar.gz \
  https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse

mkdir -p jre
tar -xzf jre.tar.gz -C jre/ --strip-components=1
rm jre.tar.gz
