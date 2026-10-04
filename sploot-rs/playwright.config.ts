import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  reporter: "line",
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
});
