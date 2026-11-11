import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Architecture boundaries (see "Architecture" in the README):
 *
 *   src/app       routes; may use everything
 *   src/features  one folder per feature; never imports routes
 *   src/features/notes   the core model; depends on no other feature
 *   src/shared    feature-agnostic; imports neither features nor routes
 *
 * and browser code never imports the sync server.
 *
 * For a given file the last matching block wins, so each block lists every
 * restriction that applies to its files.
 */
const ROUTES = { group: ["@/app/*"], message: "Only src/app may import routes." };
const SYNC_SERVER = {
  group: ["@/features/sync/server/*"],
  message: "Browser code must not import the sync server (it would ship server code to the client).",
};
const OTHER_FEATURES = {
  group: ["@/features/*", "!@/features/notes", "!@/features/notes/**"],
  message: "notes is the core model: it must not depend on other features.",
};
const FEATURES = { group: ["@/features/*"], message: "src/shared must not depend on features." };

const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated reports
    "coverage/**",
    ".lighthouseci/**",
  ]),
  { files: ["src/features/**"], rules: restrict(ROUTES) },
  {
    files: ["src/features/**/*.tsx", "src/features/**/client/**", "src/features/sync/shared/**"],
    ignores: ["**/*.test.ts"],
    rules: restrict(ROUTES, SYNC_SERVER),
  },
  { files: ["src/features/notes/**"], rules: restrict(ROUTES, OTHER_FEATURES) },
  { files: ["src/shared/**"], rules: restrict(ROUTES, FEATURES) },
]);

export default eslintConfig;
