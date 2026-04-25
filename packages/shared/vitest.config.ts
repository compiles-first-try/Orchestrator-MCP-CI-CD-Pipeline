import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/index.ts",
        "src/**/*.d.ts",
        // Type-only modules emit no runtime code; coverage is meaningless there.
        "src/permissions/types.ts",
      ],
      thresholds: {
        "src/permissions/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
      reporter: ["text", "html", "json-summary"],
    },
  },
});
