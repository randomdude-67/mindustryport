#!/bin/bash
set -e

# The JARs are committed to the repo (Mindustry.jar ~85 MB, dependencies.jar
# ~12 MB) because GitHub's release-assets CDN throttles Vercel's build IPs and
# silently returns ~100-byte HTML stubs — which would clobber a real download.
# Only fetch when the file is missing or implausibly small.
DEPS_FRESHLY_DOWNLOADED=0

fetch_jar() {
  local file="$1" url="$2"
  if [ -f "$file" ] && [ "$(stat -c%s "$file")" -gt 1000000 ]; then
    echo "$file already present ($(du -sh "$file" | cut -f1)); skipping download"
    return 1  # signals "did not download"
  fi
  echo "--- Downloading $file ---"
  curl -fSL -o "$file" "$url"
  if [ "$(stat -c%s "$file")" -lt 1000000 ]; then
    echo "downloaded $file is only $(stat -c%s "$file") bytes — likely an error page" >&2
    exit 1
  fi
  echo "size: $(du -sh "$file" | cut -f1)"
  return 0  # signals "downloaded"
}

fetch_jar Mindustry.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar || true
fetch_jar dependencies.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/dependencies.jar \
  && DEPS_FRESHLY_DOWNLOADED=1 || true

# Mindustry's DesktopLauncher.checkJavaVersion() requires
# OS.javaVersionNumber >= 17, and OS.<clinit> parses System.getProperty(
# "java.version") into that field. CheerpJ ignores java.version overrides
# and pins it to the legacy "1.8.0_xxx" format, so OS.<clinit> takes the
# startsWith("1.") branch and hardcodes javaVersionNumber to 8.
#
# Patching the class via the override classpath doesn't work — Vercel can't
# serve a directory listing, so CheerpJ's HEAD on `/override` 404s and the
# entry is silently dropped. Instead we patch the class *inside*
# dependencies.jar (replacing the single `bipush 8` with `bipush 25`). The
# patched JAR is committed, so we only re-patch when the JAR was just
# downloaded fresh — that way the build doesn't need python3 in the common
# case where the committed (already-patched) JAR is used as-is.
if [ "$DEPS_FRESHLY_DOWNLOADED" = "1" ]; then
echo "--- Patching arc/util/OS.class inside dependencies.jar ---"
python3 - <<'PY'
import zipfile, sys, shutil, os
unpatched = b"\x99\x00\x08\x10\x08\xa7\x00\x2d"  # ifeq +8; bipush 8;  goto +45
patched   = b"\x99\x00\x08\x10\x19\xa7\x00\x2d"  # ifeq +8; bipush 25; goto +45
with zipfile.ZipFile("dependencies.jar") as z:
    cls = z.read("arc/util/OS.class")
if patched in cls and cls.count(patched) == 1 and unpatched not in cls:
    print("dependencies.jar already patched; skipping")
    sys.exit(0)
if cls.count(unpatched) != 1:
    sys.exit(f"OS.class patch site not unique: unpatched={cls.count(unpatched)} patched={cls.count(patched)}")
new_cls = cls.replace(unpatched, patched)
# Rewrite the JAR with the one entry replaced (zipfile can't update in place).
tmp = "dependencies.jar.tmp"
with zipfile.ZipFile("dependencies.jar") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = new_cls if item.filename == "arc/util/OS.class" else zin.read(item.filename)
        zout.writestr(item, data)
os.replace(tmp, "dependencies.jar")
print("patched dependencies.jar: arc/util/OS.class bipush 8 -> 25")
PY
else
  echo "dependencies.jar was reused from the repo (already patched); skipping JAR patch"
fi

echo "--- Build complete ---"
