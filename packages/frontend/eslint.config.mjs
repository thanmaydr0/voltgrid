import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // These rules are React Compiler advisories, not correctness checks. The
    // app deliberately hydrates browser-only wallet/storage state in effects,
    // and keeps stable callbacks around async relayer operations.
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
