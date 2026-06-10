import { defineConfig } from "vitest/config";

// DB-backed integration tests run their setup and queries through pg-mem; under
// parallel CPU load an individual test can briefly run several times slower, so
// the 5s default timeout is too tight and causes flaky timeouts. These give a
// comfortable margin without masking a genuinely hung test.
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
