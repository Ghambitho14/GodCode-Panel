import { expect, test } from '@playwright/test';

test('checkout real no solapa secciones y mantiene moneda/CTA visibles', async ({ page }, testInfo) => {
	await page.goto('/__e2e/manual-order-ui');
	const isMobile = testInfo.project.name === 'mobile-chrome';

	if (isMobile) {
		await expect(page.getByRole('button', { name: /Cobrar y crear/i })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Efectivo USD' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Transferencia USD' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'USD 1,00' })).toBeVisible();
		await expect(page.getByRole('button', { name: /USD 1\.000,00/ })).toHaveCount(0);
		return;
	}

	await expect(page.getByRole('heading', { name: 'Cobra y crea la venta' })).toBeVisible();
	await expect(page.getByText(/USD\s*20\.980,00/).first()).toBeVisible();

	const client = await page.locator('.manual-order-checkout-col--client').boundingBox();
	const payment = await page.locator('.manual-order-checkout-col--payment').boundingBox();
	const actions = await page.locator('.manual-order-checkout-rail-actions__buttons').boundingBox();
	const viewport = page.viewportSize();

	expect(client).not.toBeNull();
	expect(payment).not.toBeNull();
	expect(actions).not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(payment!.y - (client!.y + client!.height)).toBeGreaterThanOrEqual(16);
	expect(actions!.y).toBeGreaterThanOrEqual(0);
	expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport!.height);

	await expect(page.locator('input[placeholder*="Cédula"] + svg')).toHaveCount(0);
	await expect(page.locator('input[type="tel"] + svg')).toHaveCount(0);
});

test('confirmación de cierre queda aislada, visible y con foco contenido', async ({ page }) => {
	await page.setViewportSize({ width: 564, height: 284 });
	await page.goto('/__e2e/manual-order-ui?confirm=1');

	const alertDialog = page.getByRole('alertdialog', { name: '¿Cerrar este pedido?' });
	const card = page.locator('.manual-order-close-confirm__card');
	const baseOverlay = page.locator('.manual-order-overlay');
	const closeButton = page.getByRole('button', { name: 'Cerrar pedido manual', includeHidden: true });
	const continueButton = page.getByRole('button', { name: 'Continuar' });

	await expect(alertDialog).toBeVisible();
	await expect(baseOverlay).toHaveAttribute('aria-hidden', 'true');
	await expect(baseOverlay).toHaveAttribute('inert', '');
	await expect(closeButton).toBeHidden();
	await expect(continueButton).toBeFocused();

	const cardBox = await card.boundingBox();
	expect(cardBox).not.toBeNull();
	expect(cardBox!.x).toBeGreaterThanOrEqual(16);
	expect(cardBox!.y).toBeGreaterThanOrEqual(16);
	expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(548);
	expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(268);

	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Cerrar con borrador' })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(continueButton).toBeFocused();

	await continueButton.click();
	await expect(alertDialog).toHaveCount(0);
	await expect(closeButton).toBeVisible();
	await expect(closeButton).toBeFocused();

	await closeButton.click();
	await expect(alertDialog).toBeVisible();
	await page.getByRole('button', { name: 'Cerrar con borrador' }).click();
	await expect(alertDialog).toHaveCount(0);

	await closeButton.click();
	await expect(alertDialog).toBeVisible();
	await page.getByRole('button', { name: 'Descartar' }).click();
	await expect(alertDialog).toHaveCount(0);

	await closeButton.click();
	await expect(alertDialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(alertDialog).toHaveCount(0);
});

test('catálogo carga imágenes visibles de forma gradual y permite ocultarlas', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('/__e2e/manual-order-ui?catalog=1');
	await expect(page.getByTestId('manual-order-catalog-visual-harness')).toBeVisible();

	const images = page.locator('.manual-order-product-media img');
	const catalogScroller = page.locator('.manual-order-categories-scroll');
	const hideImages = page.getByRole('button', { name: 'Ocultar imágenes de productos' });

	await expect(hideImages).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => images.count()).toBeGreaterThan(0);
	const initiallyLoaded = await images.count();
	expect(initiallyLoaded).toBeLessThan(60);

	await hideImages.click();
	await expect(page.getByRole('button', { name: 'Mostrar imágenes de productos' })).toHaveAttribute('aria-pressed', 'false');
	await expect(images).toHaveCount(0);

	await page.getByRole('button', { name: 'Mostrar imágenes de productos' }).click();
	await expect.poll(() => images.count()).toBeGreaterThan(0);
	const restoredVisibleImages = await images.count();
	expect(restoredVisibleImages).toBeLessThan(60);

	await catalogScroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
	await expect.poll(() => images.count()).toBeGreaterThan(restoredVisibleImages);
});
