/**
 * Tokens visuales compartidos para el flujo de Pedido Manual.
 * Centraliza clases Tailwind que se repiten entre componentes para mantener
 * consistencia de estados, radios, espaciado, tipografía y botones de acción principal.
 */

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

/** Botón de acción principal (CTA) usado en Confirmar, Siguiente y Abrir Mesa. */
export const primaryActionButtonClass =
	`flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-transparent bg-gc-accent px-4 py-3 ${textScale.body} font-extrabold uppercase tracking-wide text-white shadow-[0_2px_8px_rgba(79,91,255,0.22)] transition-all hover:-translate-y-0.5 hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-gc-border disabled:bg-gc-muted disabled:text-gc-text-muted disabled:shadow-none disabled:hover:translate-y-0`;

/**
 * Toggle base (retiro/delivery, mesero/cliente, etc.).
 * Los `!` evitan que `Button variant="default|outline"` pinte hover azul sólido con texto oscuro.
 */
export const toggleBaseClass =
	`flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-gc-border bg-gc-page px-2.5 py-3 ${textScale.body} font-semibold text-gc-text shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 sm:px-3 hover:!border-gc-accent/40 hover:!bg-gc-accent/8 hover:!text-gc-accent hover:!shadow-none active:!scale-[0.99] focus-visible:!ring-2 focus-visible:!ring-gc-accent/25`;

/** Estado activo/seleccionado compartido por toggles de método de pago, tipo de pedido y categorías. */
export const selectedToggleActiveClass =
	'!border-gc-accent !bg-gc-accent/12 !text-gc-accent hover:!border-gc-accent hover:!bg-gc-accent/16 hover:!text-gc-accent hover:!shadow-none';

/** Gap único para el grid de productos del catálogo. */
export const catalogGridGapClass = 'gap-3 sm:gap-4 lg:gap-5';

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
