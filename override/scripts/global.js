"use strict";

// Mindustry eagerly initializes Rhino during desktop startup.
// The stock global.js imports a very large Java package surface that is not
// needed just to reach the main menu, and that path currently fails in the
// browser runtime. Keep this override intentionally tiny for now so the
// desktop client can continue booting without JavaScript mod helpers.

let scriptName = "base.js";
let modName = "none";

const log = (context, obj) => Vars.mods.scripts.log(context, String(obj));
const print = text => log(modName + "/" + scriptName, text);

const newFloats = cap => Vars.mods.getScripts().newFloats(cap);
