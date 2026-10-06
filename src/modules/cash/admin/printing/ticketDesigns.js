import { getOrderItemLineTotal } from '@/shared/utils/orderUtils';

/**
 * Diseños del ticket de caja (cliente). Se elige por sucursal en
 * Opciones de sucursal › Ticket y se guarda en `branches.manual_order_settings.ticketDesign`
 * (esa columna ya viaja en el objeto `branch` que reciben todas las impresiones).
 * La comanda de cocina sale en el mismo diseño, sin precios.
 */
export const CASHIER_TICKET_DESIGN = /** @type {const} */ ({
	salon: 'salon',
	classic: 'classic',
});

export const DEFAULT_CASHIER_TICKET_DESIGN = CASHIER_TICKET_DESIGN.salon;

export const CASHIER_TICKET_DESIGNS = [
	{
		id: CASHIER_TICKET_DESIGN.salon,
		label: 'Salón',
		description: 'Caja con el número del pedido, datos en dos columnas y tabla de productos con importe.',
	},
	{
		id: CASHIER_TICKET_DESIGN.classic,
		label: 'Clásico',
		description: 'Todo centrado, bandas punteadas y letra tipo máquina de escribir.',
	},
];

const DESIGN_IDS = new Set(CASHIER_TICKET_DESIGNS.map((d) => d.id));

/** @param {unknown} raw */
export function normalizeCashierTicketDesign(raw) {
	return typeof raw === 'string' && DESIGN_IDS.has(raw) ? raw : DEFAULT_CASHIER_TICKET_DESIGN;
}

/**
 * Diseño a imprimir: el que se pase explícito (vista previa) o el de la sucursal.
 * @param {{ ticketDesign?: unknown; branch?: { manual_order_settings?: { ticketDesign?: unknown } | null } | null }} [printOptions]
 */
export function resolveCashierTicketDesign(printOptions = {}) {
	return normalizeCashierTicketDesign(
		printOptions?.ticketDesign ?? printOptions?.branch?.manual_order_settings?.ticketDesign,
	);
}

/**
 * ¿Se imprime el código de verificación en los tickets de delivery? Apagado por defecto.
 * Se guarda en `branches.manual_order_settings.ticketShowDeliveryCode`.
 * @param {{ showDeliveryCode?: unknown; branch?: { manual_order_settings?: { ticketShowDeliveryCode?: unknown } | null } | null }} [printOptions]
 */
export function resolveTicketShowDeliveryCode(printOptions = {}) {
	const raw = printOptions?.showDeliveryCode ?? printOptions?.branch?.manual_order_settings?.ticketShowDeliveryCode;
	return raw === true;
}

/** Tipos de pedido que se pueden ver en la vista previa. */
export const TICKET_PREVIEW_FULFILLMENTS = [
	{ id: 'pickup', label: 'Retiro' },
	{ id: 'delivery', label: 'Delivery' },
];

/** Lo que cambia del pedido de ejemplo según el tipo. */
const PREVIEW_FULFILLMENT_FIELDS = {
	pickup: { order_type: 'pickup' },
	delivery: {
		order_type: 'delivery',
		channel: 'delivery',
		delivery_fee: 2000,
		handoff_code: '4821',
		delivery_address: { street: 'Av. Siempre Viva 742', reference: 'Depto 12, timbre 3' },
	},
};

/**
 * Pedido de ejemplo para las vistas previas. Los precios están en la unidad mayor de la moneda.
 * @param {{ currency?: string | null; fulfillment?: 'pickup' | 'delivery' }} [opts]
 */
export function buildTicketPreviewOrder({ currency = 'CLP', fulfillment = 'pickup' } = {}) {
	const fields = PREVIEW_FULFILLMENT_FIELDS[fulfillment] ?? PREVIEW_FULFILLMENT_FIELDS.pickup;
	const items = [
		{
			name: '30 Piezas',
			quantity: 1,
			price: 18900,
			extras: [
				{ kind: 'change', name: 'Cambiar camarón por pollo', quantity: 1, price: 0 },
				{ kind: 'change', name: 'Cambiar kanikama por salmón', quantity: 1, price: 1000 },
			],
		},
		{ name: 'Gohan pollo teriyaki', quantity: 1, price: 6500, note: 'Sin sésamo', extras: [] },
		{ name: 'Bebida 1.5L', quantity: 2, price: 1500, extras: [] },
	];
	return {
		id: 0,
		order_number: 1881,
		shift_sequence: 200,
		created_at: new Date().toISOString(),
		client_name: 'Cliente de ejemplo',
		client_phone: '+56 9 1234 5678',
		currency: currency || 'CLP',
		payment_type: 'cash',
		payment_method_specific: 'efectivo',
		payment_status: 'paid',
		status: 'picked_up',
		...fields,
		items,
		total: items.reduce((sum, item) => sum + getOrderItemLineTotal(item), 0) + (fields.delivery_fee ?? 0),
	};
}
