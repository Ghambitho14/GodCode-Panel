import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const kanbanCssPath = resolve("src/modules/cash/styles/AdminKanban.css");
const layoutCssPath = resolve("src/modules/cash/styles/AdminLayout.css");
const orderCardCssPath = resolve("src/modules/cash/styles/OrderCard.css");
const manualOrderCssPath = resolve("src/modules/cash/styles/ManualOrderModal.css");

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

async function mountOrderCard(page: import("@playwright/test").Page) {
	await page.setContent(`
		<div class="admin-layout" style="width:100%;max-width:100%;overflow:hidden;padding:10px;box-sizing:border-box;">
			<div class="kanban-column" style="width:100%;max-width:100%;">
				<div class="kanban-card kanban-card--expanded" style="width:100%;max-width:100%;box-sizing:border-box;">
					<div class="kanban-card-top" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
						<div class="order-card-header-tools">
							<button type="button" class="admin-icon-btn admin-icon-btn--sm">A</button>
							<button type="button" class="admin-icon-btn admin-icon-btn--sm">B</button>
						</div>
						<div class="order-card-payment-stack">
							<span class="payment-badge payment-badge--settled">PAGADO TARJETA</span>
						</div>
					</div>
					<div class="card-actions">
						<button type="button" class="btn-action primary">A COCINA</button>
						<button type="button" class="btn-icon-action">X</button>
					</div>
				</div>
			</div>
		</div>
	`);
	await page.addStyleTag({ path: orderCardCssPath });
	await page.addStyleTag({ path: kanbanCssPath });
}

async function mountManualOrderMobile(page: import("@playwright/test").Page) {
	await page.setContent(`
		<div class="manual-order-overlay">
			<div class="manual-order-container manual-order-wizard manual-order--mobile manual-order-step-2">
				<div class="manual-order-checkout-stage">
					<div class="manual-order-checkout-col manual-order-checkout-col--client">Client</div>
					<div class="manual-order-checkout-col manual-order-checkout-col--summary">Summary</div>
					<div class="manual-order-checkout-col manual-order-checkout-col--payment">Payment</div>
				</div>
			</div>
		</div>
	`);
	await page.addStyleTag({ path: manualOrderCssPath });
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

	test("order card layout fits viewport at 390px without horizontal overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await mountOrderCard(page);

		const overflow = await page.evaluate(() => {
			const el = document.querySelector(".kanban-card");
			if (!el) return false;
			return el.scrollWidth > el.clientWidth + 1;
		});
		expect(overflow).toBe(false);

		const layoutOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
		});
		expect(layoutOverflow).toBe(false);
	});

	test("manual order checkout stacks in compact mode at 900px", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 800 });
		await mountManualOrderMobile(page);

		const columns = await page
			.locator(".manual-order-checkout-stage")
			.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
		expect(columns).toMatch(/^[\d.]+px$/);
	});

	test("kanban board uses grid layout above 1024px desktop width", async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 800 });
		await page.setContent(`
			<div class="admin-layout">
				<div class="kanban-board">
					<div class="kanban-column">Col</div>
				</div>
			</div>
		`);
		await page.addStyleTag({ path: kanbanCssPath });

		const display = await page
			.locator(".kanban-board")
			.evaluate((el) => getComputedStyle(el).display);
		expect(display).toBe("grid");

		const tabsDisplay = await page.evaluate(() => {
			const tabs = document.querySelector(".mobile-tabs");
			return tabs ? getComputedStyle(tabs).display : "none";
		});
		expect(tabsDisplay).toBe("none");
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
