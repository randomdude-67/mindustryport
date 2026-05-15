#!/bin/bash
set -e

# The JARs are committed to the repo (Mindustry.jar ~85 MB, dependencies.jar
# ~12 MB) because GitHub's release-assets CDN throttles Vercel's build IPs and
# silently returns ~100-byte HTML stubs — which would clobber a real download.
# Only fetch when the file is missing or implausibly small.
fetch_jar() {
  local file="$1" url="$2"
  if [ -f "$file" ] && [ "$(stat -c%s "$file")" -gt 1000000 ]; then
    echo "$file already present ($(du -sh "$file" | cut -f1)); skipping download"
    return
  fi
  echo "--- Downloading $file ---"
  curl -fSL -o "$file" "$url"
  if [ "$(stat -c%s "$file")" -lt 1000000 ]; then
    echo "downloaded $file is only $(stat -c%s "$file") bytes — likely an error page" >&2
    exit 1
  fi
  echo "size: $(du -sh "$file" | cut -f1)"
}

fetch_jar Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar
fetch_jar dependencies.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/dependencies.jar

# Mindustry's DesktopLauncher.checkJavaVersion() requires
# OS.javaVersionNumber >= 17, and OS.<clinit> parses System.getProperty(
# "java.version") into that field. CheerpJ ignores java.version overrides
# and pins it to the legacy "1.8.0_xxx" format, so OS.<clinit> takes the
# startsWith("1.") branch and hardcodes javaVersionNumber to 8.
# We flip the single `bipush 8` in that branch to `bipush 25` so the
# version gate passes on CheerpJ's Java 8 runtime. The patched class is
# committed so this step only re-runs when it's missing.
if [ -f override/arc/util/OS.class ] && [ "$(stat -c%s override/arc/util/OS.class)" -gt 1000 ]; then
  echo "override/arc/util/OS.class already present; skipping patch"
else
  echo "--- Patching arc/util/OS.class (version gate) ---"
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
fi

echo "--- Build complete ---"
