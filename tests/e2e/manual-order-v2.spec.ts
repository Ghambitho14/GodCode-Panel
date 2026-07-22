import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/__e2e/manual-order');
	await expect(page.getByTestId('manual-order-e2e-harness')).toBeVisible({ timeout: 15_000 });
});

test('venta rápida CLP evita duplicados ante doble clic', async ({ page }) => {
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Camila');
	await page.getByRole('button', { name: 'Pago' }).click();
	await page.getByRole('button', { name: 'Cobrar y crear' }).dblclick();
	await expect(page.getByTestId('result')).toContainText('"createdCount":1');
	await expect(page.getByTestId('result')).toContainText('"payment":"paid"');
});

test('mesa se abre siempre con pago diferido', async ({ page }) => {
	await page.getByRole('button', { name: 'Abrir sesión' }).click();
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByRole('combobox', { name: 'Entrega', exact: true }).selectOption('table');
	await page.getByLabel('Nombre').fill('Mesa 12');
	await page.getByRole('button', { name: 'Pago' }).click();
	await expect(page.getByText('Mesa · pago diferido obligatorio')).toBeVisible();
	await page.getByRole('button', { name: 'Abrir mesa' }).click();
	await expect(page.getByTestId('result')).toContainText('"payment":"pending"');
});

test('Venezuela bloquea conversión sin tasa y conserva comprobante fallido', async ({ page }) => {
	await page.getByLabel('País').selectOption('VE');
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Valentina');
	await page.getByRole('button', { name: 'Pago' }).click();
	await expect(page.getByRole('alert')).toContainText('Configura la tasa');
	await page.getByLabel('Tasa VES por USD').fill('50');
	await page.getByLabel('Monto VES').fill('525');
	await page.getByLabel('Simular fallo del comprobante').check();
	await page.getByRole('button', { name: 'Cobrar y crear' }).click();
	await expect(page.getByTestId('result')).toContainText('"evidence":"failed"');
	await page.getByRole('button', { name: 'Reintentar comprobante' }).click();
	await expect(page.getByTestId('result')).toContainText('"evidence":"uploaded"');
});

test('fallback global conserva decimales USD', async ({ page }) => {
	await page.getByLabel('País').selectOption('US');
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Global Customer');
	await page.getByRole('button', { name: 'Pago' }).click();
	await expect(page.getByRole('complementary', { name: 'Carrito' })).toContainText('$10.50');
	await page.getByRole('button', { name: 'Cobrar y crear' }).click();
	await expect(page.getByTestId('result')).toContainText('"totalMinor":1050');
});

test('pago combinado genera dos líneas exactas', async ({ page }) => {
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Pago Mixto');
	await page.getByRole('button', { name: 'Pago' }).click();
	await page.getByLabel('Método').selectOption('mixed');
	await page.getByRole('button', { name: 'Cobrar y crear' }).click();
	await expect(page.getByTestId('result')).toContainText('"paymentLines":2');
});

test('sesión de retiro permite pago pendiente o inmediato', async ({ page }) => {
	await page.getByRole('button', { name: 'Abrir sesión' }).click();
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Retiro Sesión');
	await page.getByRole('button', { name: 'Pago' }).click();
	await expect(page.getByText('La sesión quedará pendiente de pago.')).toBeVisible();
	await page.getByRole('button', { name: 'Abrir retiro pendiente' }).click();
	await expect(page.getByTestId('result')).toContainText('"payment":"pending"');
	await page.getByLabel('Cobrar ahora').check();
	await page.getByRole('button', { name: 'Cobrar y abrir retiro' }).click();
	await expect(page.getByTestId('result')).toContainText('"payment":"paid"');
});

test('delivery exige contacto y ubicación antes de confirmar', async ({ page }) => {
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByRole('combobox', { name: 'Entrega', exact: true }).selectOption('delivery');
	await page.getByLabel('Nombre').fill('Delivery Uno');
	await expect(page.getByRole('alert')).toContainText('Delivery requiere');
	await page.getByLabel('Teléfono').fill('+56911112222');
	await page.getByLabel('Dirección').fill('Avenida Central 123');
	await page.getByRole('button', { name: 'Pago' }).click();
	await page.getByRole('button', { name: 'Cobrar y crear' }).click();
	await expect(page.getByTestId('result')).toContainText('"payment":"paid"');
});

test('cupón cambiado obliga a reconfirmar y cupón válido modifica el total', async ({ page }) => {
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Cupón Uno');
	await page.getByLabel('Cupón').selectOption('EXPIRED');
	await expect(page.getByRole('alert')).toContainText('cupón está expirado');
	await page.getByLabel('Cupón').selectOption('CHANGED');
	await expect(page.getByRole('alert')).toContainText('cotización cambió');
	await page.getByRole('button', { name: 'Confirmar nueva cotización' }).click();
	await expect(page.getByRole('status')).toContainText('Todo listo');
	await page.getByLabel('Cupón').selectOption('SAVE10');
	await page.getByRole('button', { name: 'Pago' }).click();
	await page.getByRole('button', { name: 'Cobrar y crear' }).click();
	await expect(page.getByTestId('result')).toContainText('"totalMinor":9450');
});

test('conflicto de edición nunca sobrescribe silenciosamente', async ({ page }) => {
	await page.getByRole('button', { name: 'Simular edición concurrente' }).click();
	await expect(page.getByTestId('result')).toContainText('"conflict":true');
	await expect(page.getByTestId('result')).toContainText('order-changed');
});

test('borrador IndexedDB restaura el formulario', async ({ page }) => {
	await page.getByRole('button', { name: 'Agregar producto' }).click();
	await page.getByRole('button', { name: 'Contexto' }).click();
	await page.getByLabel('Nombre').fill('Borrador Uno');
	await page.getByRole('button', { name: 'Guardar borrador' }).click();
	await page.getByLabel('Nombre').fill('');
	await page.getByRole('button', { name: 'Restaurar borrador' }).click();
	await expect(page.getByLabel('Nombre')).toHaveValue('Borrador Uno');
	await expect(page.getByTestId('result')).toContainText('draft-restored');
});

test('se puede recorrer la navegación principal con teclado', async ({ page }) => {
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Venta rápida' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Abrir sesión' })).toBeFocused();
});
