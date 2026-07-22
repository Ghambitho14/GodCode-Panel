import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:5174",
		trace: "on-first-retry",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
		{ name: "mobile-chrome", use: { ...devices["Pixel 5"], channel: "chrome" } },
	],
	webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ? undefined : {
		// Un único proceso evita que `npm run` deje procesos nietos abiertos en Windows.
		command: "node scripts/e2e-server.mjs",
		url: "http://127.0.0.1:5174",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "ignore",
	},
});
