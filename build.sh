#!/bin/bash
set -e

# The JARs are committed to the repo (Mindustry.jar ~85 MB, dependencies.jar
# ~12 MB) because GitHub's release-assets CDN throttles Vercel's build IPs and
# silently returns ~100-byte HTML stubs — which would clobber a real download.
# Only fetch when the file is missing or implausibly small.
MINDUSTRY_FRESHLY_DOWNLOADED=0
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
  https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar \
  && MINDUSTRY_FRESHLY_DOWNLOADED=1 || true
fetch_jar dependencies.jar \
  https://github.com/Anuken/Mindustry/releases/download/v157.4/dependencies.jar \
  && DEPS_FRESHLY_DOWNLOADED=1 || true

# Mindustry's DesktopLauncher.checkJavaVersion() fatally errors when
# arc.util.OS.javaVersionNumber < 17, and OS.<clinit> parses
# System.getProperty("java.version") into that field. CheerpJ reports
# java.version as "8" / "8.0.0" (not "1.8.0_xxx"), and ignores all of our
# javaProperties + System.setProperty overrides. The override classpath
# doesn't work either (Vercel can't serve directory listings, so CheerpJ's
# probe of `/override` 404s). So we patch both JARs in place:
#
#   - Mindustry.jar: the first byte of DesktopLauncher.checkJavaVersion's
#     bytecode is flipped from `getstatic` (0xb2) to `return` (0xb1), making
#     the whole gate a no-op regardless of OS.javaVersionNumber.
#
#   - dependencies.jar: the `bipush 8` inside OS.<clinit>'s legacy-format
#     branch (`java.version.startsWith("1.")`) is flipped to `bipush 25`.
#     Belt-and-suspenders — currently dead under CheerpJ but keeps things
#     correct if CheerpJ ever switches to reporting "1.8.0_xxx".
#
# Both patches are committed; the python step only runs when a JAR was just
# downloaded fresh (so local rebuilds without python work fine).
if [ "$MINDUSTRY_FRESHLY_DOWNLOADED" = "1" ] || [ "$DEPS_FRESHLY_DOWNLOADED" = "1" ]; then
echo "--- Patching JARs ---"
MINDUSTRY_FRESHLY_DOWNLOADED="$MINDUSTRY_FRESHLY_DOWNLOADED" \
DEPS_FRESHLY_DOWNLOADED="$DEPS_FRESHLY_DOWNLOADED" \
python3 - <<'PY'
import os, sys, zipfile

PATCHES = [
    # (jar, class entry, unpatched bytes, patched bytes, description, env-flag)
    (
        "Mindustry.jar",
        "mindustry/desktop/DesktopLauncher.class",
        b"\xb2\x00\x43\x10\x11\xa2\x00\x20",  # getstatic OS.javaVersionNumber; bipush 17; if_icmpge 37
        b"\xb1\x00\x43\x10\x11\xa2\x00\x20",  # return; dead bytes
        "DesktopLauncher.checkJavaVersion -> immediate return",
        "MINDUSTRY_FRESHLY_DOWNLOADED",
    ),
    # arc/util/OS.class and arc/util/SharedLibraryLoader.class are present in
    # BOTH Mindustry.jar AND dependencies.jar. The classpath order is
    # `/app/override:/app/Mindustry.jar:/app/dependencies.jar`, so the copy in
    # Mindustry.jar wins and a patch only to dependencies.jar has no effect.
    # We patch both for safety: whichever JAR gets fresh-downloaded gets
    # repatched, and both copies stay in sync.
    (
        "Mindustry.jar",
        "arc/util/OS.class",
        b"\x99\x00\x08\x10\x08\xa7\x00\x2d",
        b"\x99\x00\x08\x10\x19\xa7\x00\x2d",
        "OS.<clinit> legacy branch -> bipush 25",
        "MINDUSTRY_FRESHLY_DOWNLOADED",
    ),
    (
        "dependencies.jar",
        "arc/util/OS.class",
        b"\x99\x00\x08\x10\x08\xa7\x00\x2d",
        b"\x99\x00\x08\x10\x19\xa7\x00\x2d",
        "OS.<clinit> legacy branch -> bipush 25",
        "DEPS_FRESHLY_DOWNLOADED",
    ),
    (
        "Mindustry.jar",
        "arc/util/SharedLibraryLoader.class",
        b"\xb2\x00\x6e\x99\x00\x04\xb1\x12\x08",
        b"\xb1\x00\x6e\x99\x00\x04\xb1\x12\x08",
        "SharedLibraryLoader.load -> immediate return (skips System.loadLibrary)",
        "MINDUSTRY_FRESHLY_DOWNLOADED",
    ),
    (
        "dependencies.jar",
        "arc/util/SharedLibraryLoader.class",
        b"\xb2\x00\x6e\x99\x00\x04\xb1\x12\x08",
        b"\xb1\x00\x6e\x99\x00\x04\xb1\x12\x08",
        "SharedLibraryLoader.load -> immediate return (skips System.loadLibrary)",
        "DEPS_FRESHLY_DOWNLOADED",
    ),
]

for jar, entry, unp, p, desc, env in PATCHES:
    if os.environ.get(env) != "1":
        continue
    with zipfile.ZipFile(jar) as z:
        cls = z.read(entry)
    if p in cls and cls.count(p) == 1 and unp not in cls:
        print(f"{jar}: {desc}: already patched")
        continue
    if cls.count(unp) != 1:
        sys.exit(f"{jar}: {entry} patch site not unique (unpatched={cls.count(unp)} patched={cls.count(p)})")
    new_cls = cls.replace(unp, p)
    tmp = jar + ".tmp"
    with zipfile.ZipFile(jar) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = new_cls if item.filename == entry else zin.read(item.filename)
            zout.writestr(item, data)
    os.replace(tmp, jar)
    print(f"{jar}: {desc}: patched")
PY
else
  echo "Both JARs reused from the repo (already patched); skipping JAR patches"
fi

echo "--- Build complete ---"
