import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const kanbanCssPath = resolve("src/modules/cash/styles/AdminKanban.css");
const layoutCssPath = resolve("src/modules/cash/styles/AdminLayout.css");

const hasCredentials = Boolean(
	process.env.E2E_EMAIL && process.env.E2E_PASSWORD,
);

async function mountKanbanTabs(page: import("@playwright/test").Page) {
	await page.setContent(`
		<div class="admin-layout">
			<div class="mobile-tabs">
				<button type="button" class="active">Entrantes (0)</button>
				<button type="button">Cocina (0)</button>
				<button type="button">Listos (0)</button>
			</div>
		</div>
	`);
	await page.addStyleTag({ path: kanbanCssPath });
}

async function mountOrdersHeader(page: import("@playwright/test").Page) {
	await page.setContent(`
		<div class="admin-layout">
			<div class="header-actions header-actions--mobile-toolbar">
				<div class="header-actions-orders-row">
					<div class="order-intake-pause">
						<span class="order-intake-pause__badge">Pedidos online: Activos</span>
						<button type="button" class="btn btn-secondary order-intake-pause__btn">Pausar</button>
						<div class="order-intake-pause__confirm glass">Confirm</div>
					</div>
					<button type="button" class="btn btn-secondary header-action-orders-history">Ver Historial</button>
					<button type="button" class="btn btn-primary header-action-orders-manual">Pedido Manual</button>
				</div>
			</div>
		</div>
	`);
	await page.addStyleTag({ path: layoutCssPath });
}

test.describe("admin responsive CSS (fixture)", () => {
	test("kanban tabs are visible at 900px tablet width", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 800 });
		await mountKanbanTabs(page);

		const display = await page.locator(".mobile-tabs").evaluate((el) => {
			return getComputedStyle(el).display;
		});
		expect(display).toBe("grid");
	});

	test("kanban tabs stay hidden above 1024px desktop width", async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 800 });
		await mountKanbanTabs(page);

		const display = await page.locator(".mobile-tabs").evaluate((el) => {
			return getComputedStyle(el).display;
		});
		expect(display).toBe("none");
	});

	test("orders header uses grid layout at 390px", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await mountOrdersHeader(page);

		const rowDisplay = await page
			.locator(".header-actions-orders-row")
			.evaluate((el) => getComputedStyle(el).display);
		expect(rowDisplay).toBe("grid");

		const manualSpan = await page
			.locator(".header-action-orders-manual")
			.evaluate((el) => getComputedStyle(el).gridColumn);
		expect(manualSpan).toMatch(/1\s*\/\s*-1/);

		const historySpan = await page
			.locator(".header-action-orders-history")
			.evaluate((el) => getComputedStyle(el).gridRow);
		expect(historySpan).toMatch(/1\s*\/\s*3/);
	});

	test("orders header grid holds at 320px minimum width", async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await mountOrdersHeader(page);

		const rowDisplay = await page
			.locator(".header-actions-orders-row")
			.evaluate((el) => getComputedStyle(el).display);
		expect(rowDisplay).toBe("grid");

		const confirmLeft = await page
			.locator(".order-intake-pause__confirm")
			.evaluate((el) => getComputedStyle(el).left);
		expect(confirmLeft).toBe("0px");
	});
});

test.describe("admin responsive smoke (authenticated)", () => {
	test.skip(
		!hasCredentials,
		"Set E2E_EMAIL and E2E_PASSWORD to run authenticated responsive smoke",
	);

	test("orders tab shows mobile tabs and header actions at 390px", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.getByPlaceholder("admin@godcode.me").fill(process.env.E2E_EMAIL!);
		await page.getByPlaceholder("••••••••").fill(process.env.E2E_PASSWORD!);
		await page.getByRole("button", { name: /Ingresar/i }).click();
		await page.waitForURL("**/admin**", { timeout: 15_000 });

		await expect(page.locator(".mobile-tabs")).toBeVisible();
		await expect(page.locator(".header-actions-orders-row")).toBeVisible();
		await expect(page.locator(".admin-sidebar")).toBeVisible();
	});

	test("kanban tabs visible at 900px tablet after login", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 800 });
		await page.goto("/");
		await page.getByPlaceholder("admin@godcode.me").fill(process.env.E2E_EMAIL!);
		await page.getByPlaceholder("••••••••").fill(process.env.E2E_PASSWORD!);
		await page.getByRole("button", { name: /Ingresar/i }).click();
		await page.waitForURL("**/admin**", { timeout: 15_000 });

		const display = await page.locator(".mobile-tabs").evaluate((el) => {
			return getComputedStyle(el).display;
		});
		expect(display).toBe("grid");
	});
});
