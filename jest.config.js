/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["./tests/setup.js"],
  transform: {},
  maxWorkers: 1,
  collectCoverageFrom: ["src/**/*.js", "!src/generated/**", "!src/**/*.d.ts"],
};

export default config;
