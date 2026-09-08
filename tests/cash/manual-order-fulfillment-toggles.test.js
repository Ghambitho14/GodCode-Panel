import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../src/modules/cash',
);

const clientForm = readFileSync(
	path.join(srcDir, 'components/manual-order/ClientForm.jsx'),
	'utf8',
);
const modalCss = readFileSync(
	path.join(srcDir, 'styles/ManualOrderModal.css'),
	'utf8',
);

/**
 * Los toggles de "Tipo de entrega" viven en una tarjeta estrecha de la columna
 * izquierda del wizard, no a ancho completo. Con `min-[400px]` (media query de
 * viewport) el navegador miraba el viewport y no la tarjeta: a 1024px la
 * tarjeta mide 232px y aun asi se pintaban 3 columnas de 67px, con lo que
 * "Local / Retiro" (86px) quedaba cortado y su icono se solapaba con el boton
 * de al lado. Medido: cortado en 1024, 1100 y 1280.
 */
describe('toggles de tipo de entrega del pedido manual', () => {
	it('la tarjeta de seccion es un contenedor de consulta', () => {
		expect(clientForm).toMatch(/const sectionCardClass = '@container /);
	});

	it('las rejillas de toggles responden al contenedor, no al viewport', () => {
		const viewportVariants = clientForm.match(/(?<!@)min-\[\d+px\]:grid-cols-/g);
		expect(viewportVariants).toBeNull();
		expect(clientForm).toContain('@min-[340px]:grid-cols-3');
		expect(clientForm).toContain('@min-[220px]:grid-cols-2');
	});
});

/**
 * A 375px el header del wizard reserva 52px para la X de cerrar y deja 313px al
 * stepper, pero las tres etiquetas piden 333px. Flex las encogia y se leia
 * "Produ...", "Entr...", "Pago opci...". Por debajo de 400px solo se rotula el
 * paso actual.
 */
describe('stepper del pedido manual en pantallas estrechas', () => {
	it('oculta las etiquetas de los pasos no activos bajo 400px', () => {
		const rule = modalCss.slice(modalCss.indexOf('@media (max-width: 400px)'));
		expect(rule).toContain('__item:not(.is-active)');
		expect(rule).toContain('__label');
		expect(rule).toMatch(/display:\s*none/);
	});
});
