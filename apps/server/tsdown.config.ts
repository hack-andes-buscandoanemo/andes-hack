import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  // Always emit .mjs so start commands do not depend on tsdown's platform default.
  fixedExtension: true,
  outDir: "./dist",
  clean: true,
  dts: false,
  deps: {
    alwaysBundle: [/@andes-hack\/.*/],
  },
});
