# Mindustry Web Port

Mindustry `v157.4` running in the browser through CheerpJ plus a custom JS SDL/WebGL bridge.

Notes:
- `webpage_content_reporter.js` "Cannot use import statement outside a module" is browser-extension noise, not repo code.
- CheerpJ defaults to Java 8 unless `version` is set in `cheerpjInit()`. This repo now pins Java 17 explicitly.
- Mindustry `v157.4` ships both `Mindustry.jar` and `dependencies.jar`; the web launcher now uses an explicit classpath plus `cheerpjRunMain(...)`.
- Arc's `System.loadLibrary("arc")` and `System.loadLibrary("sdl-arc")` calls are now routed through `/app/natives` JS modules via `java.library.path=/app/natives`.
- The current web port only shims the SDL / OpenGL native layer. Arc native libraries such as FreeType and Soloud are still a larger compatibility gap.
- If you still see `ERR_CACHE_OPERATION_NOT_SUPPORTED`, test with browser cache disabling turned off and clear any old service workers registered for this site.
