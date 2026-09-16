import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    extends: [...nextCoreWebVitals],
}, {
    // Ambient type declarations for plain .mjs scripts — not runtime code,
    // and the default TS parser config here doesn't cover the .d.mts extension.
    ignores: ["scripts/lib/strongPassword.d.mts", "scripts/provisionTeam.d.mts"],
}]);