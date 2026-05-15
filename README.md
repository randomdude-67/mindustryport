# Mindustry Web Port

Mindustry `v157.4` running in the browser through CheerpJ plus a custom JS SDL/WebGL bridge.

Notes:
- `webpage_content_reporter.js` "Cannot use import statement outside a module" is browser-extension noise, not repo code.
- Mindustry's release JARs are Java 8 bytecode (class file version 52), so we let CheerpJ run them on its default Java 8 runtime. Pinning Java 17 made CheerpJ fetch `/lib/modules` (the JDK 9+ jimage), which fails with `ERR_CACHE_OPERATION_NOT_SUPPORTED` and surfaces as a misleading `NoClassDefFoundError: netscape/javascript/JSObject`.
- Mindustry's `DesktopLauncher.checkJavaVersion()` requires `arc.util.OS.javaVersionNumber >= 17`, and `OS.<clinit>` parses `System.getProperty("java.version")` into that field. CheerpJ ignores `java.version` overrides (both `javaProperties` and runtime `System.setProperty`) and pins it to `1.8.0_xxx`, so `OS.<clinit>` takes the `startsWith("1.")` branch and hardcodes `javaVersionNumber = 8`. Shipping a patched `OS.class` via the override classpath didn't work either — Vercel can't serve directory listings, so CheerpJ's probe of `/override` 404s and the entry is dropped. Instead `build.sh` flips the single `bipush 8` to `bipush 25` *inside* `dependencies.jar` (the patched JAR is committed; the script is idempotent and re-runs only when a fresh JAR was just downloaded).
- Mindustry `v157.4` ships both `Mindustry.jar` and `dependencies.jar`; the web launcher now uses an explicit classpath plus `cheerpjRunMain(...)`.
- Arc's `System.loadLibrary("arc")` and `System.loadLibrary("sdl-arc")` calls are now routed through `/app/natives` JS modules via `java.library.path=/app/natives`.
- `override/scripts/global.js` now shadows Mindustry's bundled Rhino bootstrap with a much smaller compatibility script so startup can proceed without full JavaScript mod support.
- The current web port only shims the SDL / OpenGL native layer. Arc native libraries such as FreeType and Soloud are still a larger compatibility gap.
- If you still see `ERR_CACHE_OPERATION_NOT_SUPPORTED`, test with browser cache disabling turned off and clear any old service workers registered for this site.
