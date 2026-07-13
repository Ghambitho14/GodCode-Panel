/**
 * Tokens visuales compartidos para el flujo de Pedido Manual.
 * Centraliza clases Tailwind que se repiten entre componentes para mantener
 * consistencia de estados, radios, espaciado, tipografía y botones de acción principal.
 */

/** Botón de acción principal (CTA) usado en Confirmar, Siguiente y Abrir Mesa. */
export const primaryActionButtonClass =
	'flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-transparent bg-gc-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(79,91,255,0.35)] transition-all hover:-translate-y-0.5 hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-gc-border disabled:bg-gc-muted disabled:text-gc-text-muted disabled:shadow-none disabled:hover:translate-y-0';

/** Estado activo/seleccionado compartido por toggles de método de pago, tipo de pedido y categorías. */
export const selectedToggleActiveClass = 'border-gc-accent bg-gc-accent/10 text-gc-accent';

/** Gap único para el grid de productos del catálogo. */
export const catalogGridGapClass = 'gap-5 lg:gap-5';

/** Niveles de espaciado permitidos en el módulo.
 *  - compact: controles densos (filas de ítems, botones +/-, chips, labels con input).
 *  - normal:  grupos de controles y secciones internas.
 *  - wide:    columnas/secciones principales (grid de productos, layout de pasos).
 */
export const spacing = {
	compact: 'gap-1.5',
	normal: 'gap-3',
	wide: 'gap-5',
};

/** Escala tipográfica del módulo — usar SOLO estos 4 tamaños.
 *  - micro:    metadatos, labels uppercase, contadores, hints.
 *  - body:     texto de cuerpo, nombres de producto, inputs, descripciones.
 *  - emphasis: subtítulos, títulos de sección de catálogo, nombres destacados.
 *  - price:    precios y totales (único nivel grande permitido).
 */
export const textScale = {
	micro: 'text-[11px]',
	body: 'text-sm',
	emphasis: 'text-base',
	price: 'text-xl',
};

/**
 * Tokens para el estilo "airy rounded" (futura iteración visual del Pedido Manual).
 * No se aplican a componentes todavía; se definen acá para centralizarlos.
 */

/** Radio para tarjetas grandes (ProductCard, paneles de checkout). */
export const cardRadiusClass = 'rounded-[22px]';

/** Radio para tiles chicos (método de pago, chip de categoría). */
export const tileRadiusClass = 'rounded-[16px]';

/** Radio para elementos alargados/capsula (search bar, tags de categoría). */
export const pillRadiusClass = 'rounded-full';

/** Estado activo/seleccionado sólido negro/blanco (reemplaza el acento violeta en toggles). */
export const activeStateClass = 'bg-gc-text text-white';
