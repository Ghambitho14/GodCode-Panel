import { expect, test } from '@playwright/test';

test('checkout real no solapa secciones y mantiene moneda/CTA visibles', async ({ page }, testInfo) => {
	await page.goto('/__e2e/manual-order-ui');
	const isMobile = testInfo.project.name === 'mobile-chrome';

	if (isMobile) {
		// En móvil el CTA se llama "Crear pedido"; "Cobrar y crear" es del harness
		// de pedidos manuales, no de este checkout.
		await expect(page.getByRole('button', { name: /Crear pedido/i })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Efectivo USD' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Transferencia USD' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'USD 1,00' })).toBeVisible();
		await expect(page.getByRole('button', { name: /USD 1\.000,00/ })).toHaveCount(0);
		return;
	}

	// El checkout se rediseñó y ya no usa columnas `--client` / `--payment` ni un
	// encabezado "Cobra y crea la venta". Lo que el test protege sigue siendo lo
	// mismo: el total y el CTA de confirmar deben quedar visibles dentro del
	// viewport y sin taparse entre sí.
	// El total aparece en varios sitios (resumen plegado incluido); el que
	// importa es el que el cajero ve.
	const totalVisible = page.getByText(/USD\s*20\.980,00/).locator('visible=true').first();
	await expect(totalVisible).toBeVisible();

	const confirm = page.locator('.manual-order-checkout-actions__confirm');
	await expect(confirm).toBeVisible();

	const total = await totalVisible.boundingBox();
	const actions = await confirm.boundingBox();
	const viewport = page.viewportSize();

	expect(total).not.toBeNull();
	expect(actions).not.toBeNull();
	expect(viewport).not.toBeNull();
	// El CTA entra entero en pantalla, sin quedar cortado por abajo.
	expect(actions!.y).toBeGreaterThanOrEqual(0);
	expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport!.height + 1);
	// Y no se solapa con el total.
	const seSolapan = actions!.y < total!.y + total!.height && total!.y < actions!.y + actions!.height;
	expect(seSolapan).toBe(false);

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
