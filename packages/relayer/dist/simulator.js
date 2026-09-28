"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simCore = void 0;
function loadSimulator() {
    try {
        return require("voltgrid-sim-core");
    }
    catch {
        // P6 will reconcile the workspace dependency. This fallback keeps the
        // no-install local test path usable in the shared checkout.
        return require("../../sim-core/src/index");
    }
}
exports.simCore = loadSimulator();
