// Las guías de cada pestaña del panel. Cada paso apunta a un elemento (selector
// CSS; si no está en pantalla, el paso se salta) o va centrado si no tiene
// target. Los selectores usan las clases de cada componente o un `data-tour`
// donde la clase no lo identifica (Reportes, Gastos). Poco texto, una idea por
// paso, en tono cercano.

export type TourStep = { target?: string; title: string; body: string };

/** El botón "Nuevo …" de la barra superior (Productos y Categorías). */
const HEADER_NEW = ".admin-top-bar .header-action-generic";

/** La primera guía que ve alguien suma una bienvenida al panel… */
export const WELCOME_STEPS: TourStep[] = [
	{ title: "¡Hola! Te muestro tu panel", body: "En menos de un minuto ves para qué sirve cada parte. Puedes cerrar la guía cuando quieras." },
	{ target: ".admin-sidebar .sidebar-menu", title: "Todas las secciones", body: "Pedidos, caja, menú, clientes y más. Cada sección tiene su propia guía." },
	{ target: ".admin-top-bar .header-action-branch", title: "Tu sucursal", body: "Lo que ves y lo que cambias en el panel es de la sucursal elegida aquí." },
	{ target: ".admin-notification-center__trigger", title: "Avisos", body: "Los comunicados del equipo GodCode y las alertas de tu inventario." },
];

/** …y termina mostrando dónde volver a abrirla. */
export const GUIDE_BUTTON_STEP: TourStep = {
	target: '[data-tour="guia"]',
	title: "Cuando quieras repasar",
	body: "Este botón abre la guía de la pantalla en la que estés.",
};

export const TOURS: { id: string; steps: TourStep[] }[] = [
	{
		id: "orders",
		steps: [
			{ target: ".kanban-board", title: "Tus pedidos, por etapa", body: "Cada pedido pasa de Entrantes a Cocinando y luego a Listos. Toca uno para ver el detalle." },
			{ target: ".kanban-view-toolbar", title: "Tres columnas o una", body: "Ve todas las etapas juntas o una sola en grande." },
			{ target: ".admin-content .mobile-tabs", title: "Cambia de etapa", body: "Entrantes, Cocina y Listos, con cuántos pedidos hay en cada una." },
			{ target: ".tables-view", title: "Tus mesas abiertas", body: "Cada mesa o envío en curso es una tarjeta. Tócala para sumar productos o cobrar." },
			{ target: ".order-intake-pause", title: "Pausa los pedidos online", body: "Si la cocina se satura, pausa los pedidos de la tienda online de esta sucursal." },
			{ target: ".header-action-orders-manual", title: "Pedido manual", body: "Ventas en el mostrador o por teléfono: armas el pedido, lo cobras y queda en la caja." },
			{ target: ".header-action-orders-session", title: "Abrir mesa", body: "Abre la cuenta de una mesa y ve sumando lo que piden hasta cobrar." },
			{ target: ".header-action-orders-history", title: "Historial", body: "Los pedidos ya cerrados, con su detalle. Con el mismo botón vuelves al tablero." },
		],
	},
	{
		id: "caja",
		steps: [
			{ target: ".cash-hero", title: "Tu turno de caja", body: "Abre el turno con el efectivo inicial y ciérralo al final para cuadrar la caja." },
			{ target: ".cash-hero--open .cash-hero__actions", title: "Ingresos y retiros", body: "Anota el efectivo que entra o sale sin ser una venta. Al terminar, cierra el turno." },
			{ target: ".cash-kpi-grid", title: "Cuánto debería haber", body: "El efectivo esperado en caja, las ventas, los retiros y lo que falta pagar a delivery." },
			{ target: ".cash-methods-panel", title: "Cobros por método", body: "Cuánto entró en efectivo, tarjeta y transferencia durante este turno." },
			{ target: ".cash-section:not(.cash-section--active)", title: "Turnos anteriores", body: "Cada cierre con su detalle. Filtra por período para revisar o comparar." },
		],
	},
	{
		id: "analytics",
		steps: [
			{ target: '[data-tour="reportes-periodo"]', title: "Elige el período", body: "Cambia las fechas y compáralas con otro período para saber si vas mejor." },
			{ target: ".admin-top-bar .header-action-branch", title: "Una o todas las sucursales", body: "En Reportes puedes ver todas tus sucursales juntas o una sola." },
			{ target: '[data-tour="reportes-utilidad"]', title: "Lo que te queda", body: "Tus ventas menos gastos, devoluciones y retiros de caja del período." },
			{ target: '[data-tour="reportes-kpis"]', title: "Los números clave", body: "Ventas, pedidos, ticket promedio, delivery, clientes nuevos y gastos, con su tendencia." },
			{ target: '[data-tour="reportes-ventas"]', title: "Ventas por día u hora", body: "Filtra por tienda u online para ver de dónde vienen tus ventas." },
			{ target: '[data-tour="reportes-top"]', title: "Lo que más se vende", body: "Tus productos estrella del período." },
		],
	},
	{
		id: "local_expenses",
		steps: [
			{ target: '[data-tour="gastos-filtros"]', title: "Filtra tus gastos", body: "Por período, por tipo (operativos, retiros o devoluciones) y cómo agruparlos." },
			{ target: '[data-tour="gastos-registrar"]', title: "Registra un gasto", body: "Compras, pagos o retiros del local. También puedes exportar lo que ves a Excel." },
			{ target: '[data-tour="gastos-resumen"]', title: "El total del período", body: "Cuánto salió en total y cuánto fue de cada tipo." },
			{ target: '[data-tour="gastos-movimientos"]', title: "Movimiento por movimiento", body: "Los últimos gastos con su fecha, sucursal, método de pago y monto." },
			{ target: '[data-tour="gastos-mensual"]', title: "Reporte del mes", body: "Descarga el mes en Excel para tu contador, o míralo antes en pantalla." },
		],
	},
	{
		id: "categories",
		steps: [
			{ target: HEADER_NEW, title: "Nueva categoría", body: "Agrupa tu menú: entradas, platos, postres… El orden de aquí es el orden de tu carta." },
			{ target: ".cat-grid", title: "Tus categorías", body: "Cada tarjeta muestra sus productos y sus ventas. En computador, arrástralas para reordenar." },
			{ target: ".cat-card .cat-status-button", title: "Activa o inactiva", body: "Oculta una categoría completa del menú sin borrarla." },
			{ target: ".cat-card-footer", title: "Editar y ver productos", body: "Cambia el nombre o salta a Productos con esa categoría ya filtrada." },
		],
	},
	{
		id: "products",
		steps: [
			{ target: HEADER_NEW, title: "Nuevo producto", body: "Nombre, precio, foto y categoría. Queda listo para vender en la sucursal elegida." },
			{ target: ".products-toolbar", title: "Busca y cambia la vista", body: "Encuentra un producto por su nombre y míralos en cuadrícula o lista, con o sin fotos." },
			{ target: ".products-toolbar__filters", title: "Filtra y ordena", body: "Por categoría, por estado (activo o pausado) y por nombre o precio." },
			{ target: ".products-summary", title: "Activos y pausados", body: "Pausa un producto desde su tarjeta cuando se agote: deja de verse sin perder nada." },
		],
	},
	{
		id: "inventory",
		steps: [
			{ target: ".inventory-subtabs", title: "Tres vistas", body: "Artículos es tu stock, Recetas lo que gasta cada producto y Movimientos el historial." },
			{ target: ".inventory-enforce-row", title: "Control de stock en ventas", body: "Si lo activas, no se puede vender un producto cuando faltan sus insumos." },
			{ target: ".inventory-stats", title: "Tu stock de un vistazo", body: "Artículos, stock bajo y agotados. Toca uno para filtrar la lista." },
			{ target: ".inventory-toolbar", title: "Agrega y exporta", body: "Busca un artículo, crea uno nuevo o descarga tu inventario en Excel." },
		],
	},
	{
		id: "menu_beverages",
		steps: [
			{ target: ".admin-cart-upsell-catalog-toggle", title: "Ofrécelas en el carrito", body: "Si está activo, tus clientes ven bebidas sugeridas antes de pagar." },
			{ target: ".admin-cart-upsell-toolbar__actions", title: "Agrega una bebida", body: "Con su precio, su stock y un máximo por pedido." },
			{ target: ".admin-menu-options-cart-block", title: "Tus bebidas", body: "Agrupadas por categoría. Toca una para editarla." },
		],
	},
	{
		id: "menu_extras",
		steps: [
			{ target: ".admin-cart-upsell-catalog-toggle", title: "Ofrécelos en el carrito", body: "Si está activo, tus clientes ven extras sugeridos antes de pagar." },
			{ target: ".admin-cart-upsell-toolbar__actions", title: "Agrega un extra", body: "Créalo desde cero o a partir de un artículo de tu inventario." },
			{ target: ".admin-menu-options-cart-block", title: "Tus extras", body: "Agrupados por categoría. Toca uno para editarlo." },
		],
	},
	{
		id: "menu_modifiers",
		steps: [
			{ target: ".admin-modifiers__toolbar", title: "Cambios a un producto", body: "Lo que el cliente puede quitar, agregar o cambiar. “Cargar ejemplo” te muestra uno armado." },
			{ target: ".admin-modifiers__columns", title: "De izquierda a derecha", body: "Elige un grupo, luego la acción (quitar, agregar o cambiar), la opción y su precio." },
			{ title: "Por ahora, un borrador", body: "Lo que armes se guarda, pero todavía no aparece en la caja ni en el menú." },
		],
	},
	{
		id: "menu_carousel",
		steps: [
			{ target: ".menu-carousel-toolbar", title: "Las fotos de portada", body: "Imágenes que van rotando en tu menú online. Elige cada cuántos segundos cambian." },
			{ target: ".menu-carousel-upload-btn", title: "Sube una imagen", body: "JPG, PNG o WebP. Justo debajo ves el tamaño recomendado." },
			{ target: ".menu-carousel-slide-list", title: "Ordena y oculta", body: "Sube o baja cada imagen, u ocúltala sin borrarla." },
		],
	},
	{
		id: "clients",
		steps: [
			{ target: ".clients-view-tabs", title: "Dos tipos de clientes", body: "Cuentas: quienes se registran en tu menú online. Compradores rápidos: los de una compra." },
			{ target: ".clients-toolbar", title: "Busca, filtra y exporta", body: "Encuentra un cliente, filtra por Élite, Top o Frecuente, o envíales un cupón." },
			{ target: ".clients-table-scroll", title: "Tus clientes", body: "Puntos, pedidos, total gastado y última visita. Toca uno para ver su historial." },
		],
	},
	{
		id: "coupons",
		steps: [
			{ target: ".admin-coupons__views", title: "Cupones y recompensas", body: "Códigos de descuento, o premios que tus clientes canjean con sus puntos." },
			{ target: ".admin-coupons__toolbar", title: "Crea un cupón", body: "Un código con su descuento, sus fechas de validez y un límite de usos." },
			{ target: ".admin-staff-panel", title: "Tus cupones", body: "Cuántas veces se usó cada uno y hasta cuándo vale. Desactívalo cuando quieras." },
		],
	},
	{
		id: "menu_options",
		steps: [
			{ target: ".admin-menu-options-subtabs", title: "Ajustes de esta sucursal", body: "Envío, vista de pedidos, mesas y ticket. Cada sucursal tiene los suyos." },
			{ target: "#menu-options-subtab-delivery", title: "Envío", body: "Activa el delivery y define sus tarifas, formas de pago y límites." },
			{ target: "#menu-options-subtab-orders_view", title: "Vista de pedidos", body: "Elige si Pedidos muestra mesas o columnas, y qué canales tiene un pedido nuevo." },
			{ target: "#menu-options-subtab-tables", title: "Mesas", body: "Las mesas de tu salón, para abrir sus cuentas desde Pedidos." },
			{ target: "#menu-options-subtab-ticket", title: "Ticket", body: "El diseño de la boleta, del ticket de delivery y de la comanda de cocina." },
		],
	},
	{
		id: "module:addons",
		steps: [
			{ target: ".admin-addons__head", title: "Tus extras", body: "Lo que tu negocio tiene además de su plan." },
			{ target: ".admin-addons__grid", title: "Ábrelos desde aquí", body: "Cada tarjeta dice qué desbloquea y hasta cuándo está activo." },
		],
	},
	{
		id: "module:tickets",
		steps: [
			{ target: ".tenant-tickets-shell__header", title: "Habla con el equipo GodCode", body: "Si algo falla o tienes una duda, abre un ticket. Responden en 1 a 2 días hábiles." },
			{ target: ".tenant-tickets-mobile-tabs", title: "Nuevo, Tickets y Chat", body: "Crea un ticket, revisa los tuyos y conversa con soporte." },
			{ target: ".tenant-tickets-col--create", title: "Crea un ticket", body: "Cuenta qué pasó y elige la categoría y la prioridad." },
			{ target: ".tenant-tickets-col--list", title: "Tus tickets", body: "Todos tus tickets y en qué estado está cada uno." },
			{ target: ".tenant-tickets-col--thread", title: "La conversación", body: "Las respuestas de soporte aparecen aquí y puedes contestarlas." },
		],
	},
];

/**
 * La guía de una pestaña. Con `firstTime` (la primera guía que ve alguien)
 * suma la bienvenida al panel al inicio y el botón "Guía" al final.
 */
export function tourFor(
	tabId: string | null | undefined,
	{ firstTime = false }: { firstTime?: boolean } = {},
): { id: string; steps: TourStep[] } | null {
	const tour = TOURS.find((t) => t.id === tabId);
	if (!tour) return null;
	if (!firstTime) return tour;
	// Lo que ya mostró la bienvenida (p. ej. la sucursal en Reportes) no se repite
	const own = tour.steps.filter((s) => !s.target || !WELCOME_STEPS.some((w) => w.target === s.target));
	return { id: tour.id, steps: [...WELCOME_STEPS, ...own, GUIDE_BUTTON_STEP] };
}
