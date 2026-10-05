/*
 * Precio de los cambios del armador "Agregar cambios".
 *
 * Cada grupo elige en «cambiar» cómo se cobra (`actions.cambiar.pricing`):
 *  - 'target' (por defecto): se cobra siempre el precio de la opción nueva.
 *  - 'difference' (jerarquía): el precio de cada opción es su valor en el grupo
 *    (kanikama $0, champiñón $600, salmón $1.000). Cambiar a una de mayor valor cobra
 *    la diferencia; a una de igual o menor valor es gratis. Así «camarón por pollo»
 *    no cobra y «pollo por camarón» sí.
 */

export const CHANGE_PRICING = { target: 'target', difference: 'difference' };

/** Modo de cobro del grupo; sin configurar es 'target' (como funcionaba antes). */
export const changePricingMode = (cambiarAction) => (
	cambiarAction?.pricing === CHANGE_PRICING.difference ? CHANGE_PRICING.difference : CHANGE_PRICING.target
);

/** Precio (o valor, en jerarquía) de una opción en la acción «cambiar»; 0 si no tiene. */
export function changeValue(cambiarAction, optionId) {
	return Math.max(0, Number(cambiarAction?.items?.[optionId]?.price) || 0);
}

/** Recargo por cambiar `fromId` por `toId` según el modo de cobro del grupo. */
export function changeSurcharge(cambiarAction, fromId, toId) {
	const target = changeValue(cambiarAction, toId);
	if (changePricingMode(cambiarAction) !== CHANGE_PRICING.difference) return target;
	return Math.max(0, target - changeValue(cambiarAction, fromId));
}
