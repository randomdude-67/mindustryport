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

echo "--- Patching arc/util/OS.class (version gate) ---"
# Mindustry's DesktopLauncher.checkJavaVersion() requires
# OS.javaVersionNumber >= 17, and OS.<clinit> parses System.getProperty(
# "java.version") into that field. CheerpJ ignores java.version overrides
# and pins it to the legacy "1.8.0_xxx" format, so OS.<clinit> takes the
# startsWith("1.") branch and hardcodes javaVersionNumber to 8.
# We flip the single `bipush 8` in that branch to `bipush 25` so the
# version gate passes on CheerpJ's Java 8 runtime.
mkdir -p override/arc/util
python3 - <<'PY'
import zipfile, sys, pathlib
pat = b"\x99\x00\x08\x10\x08\xa7\x00\x2d"  # ifeq +8; bipush 8; goto +45
rep = b"\x99\x00\x08\x10\x19\xa7\x00\x2d"  # ...bipush 25...
with zipfile.ZipFile("dependencies.jar") as z:
    data = z.read("arc/util/OS.class")
hits = []
i = data.find(pat)
while i != -1:
    hits.append(i)
    i = data.find(pat, i + 1)
if len(hits) != 1:
    sys.exit(f"OS.class patch: expected 1 hit, got {len(hits)} at {hits}")
patched = data[:hits[0]] + rep + data[hits[0] + len(rep):]
pathlib.Path("override/arc/util/OS.class").write_bytes(patched)
print(f"patched OS.class at offset {hits[0]} ({len(patched)} bytes)")
PY

echo "--- Build complete ---"
