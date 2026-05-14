# Mindustry Web Port

Mindustry `v157.4` running in the browser through CheerpJ plus a custom JS SDL/WebGL bridge.

Notes:
- `webpage_content_reporter.js` "Cannot use import statement outside a module" is browser-extension noise, not repo code.
- CheerpJ defaults to Java 8 unless `version` is set in `cheerpjInit()`. This repo now pins Java 17 explicitly.
- If you still see `ERR_CACHE_OPERATION_NOT_SUPPORTED`, test with browser cache disabling turned off and clear any old service workers registered for this site.
