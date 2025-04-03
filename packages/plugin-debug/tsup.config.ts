console.log("✅ Using plugin-debug tsup.config.ts")

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"], // 👈 Forces CommonJS output (fixes "Unexpected token 'export'")
  dts: true,
  clean: true,
  target: "node18",
});
