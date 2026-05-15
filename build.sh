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

echo "--- Compiling legacy LiveConnect stubs ---"
# netscape.javascript.JSObject is referenced from CheerpJ's JDK image but
# javafx.web isn't shipped. Provide a minimal stub on the override classpath.
# Skip recompilation if a checked-in class is already present and javac is
# unavailable (e.g. minimal CI image).
if command -v javac >/dev/null 2>&1; then
  javac --release 8 -d override \
    stubs/netscape/javascript/JSObject.java \
    stubs/netscape/javascript/JSException.java
  echo "stubs compiled"
elif [ -f override/netscape/javascript/JSObject.class ]; then
  echo "no javac; using checked-in stub class files"
else
  echo "no javac and no prebuilt stub — Mindustry will fail to boot" >&2
  exit 1
fi

echo "--- Build complete ---"
