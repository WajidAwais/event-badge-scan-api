import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      API_TOKEN: "test-token",
      API_URL: "http://127.0.0.1:9/api/scan",
      LOG_LEVEL: "silent",
    },
  },
});
