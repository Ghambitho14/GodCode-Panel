import { supabase } from '@/integrations/supabase';
import { createClientUuid } from '@/shared/utils/supabaseStorage';

const FRIENDLY_ERRORS = {
	client_request_id_required: 'No se pudo identificar el intento. Vuelve a confirmar el pedido.',
	cash_shift_required: 'Debes abrir la caja de esta sucursal antes de cobrar.',
	payment_total_mismatch: 'El desglose de pago no coincide exactamente con el total.',
	payment_method_required: 'Selecciona y confirma el método de pago.',
	deferred_payment_has_amount: 'Un pedido pendiente no puede contener un cobro.',
	order_not_found_or_not_allowed: 'El pedido no existe o no tienes acceso.',
	invalid_delivery_area: 'La zona de delivery seleccionada ya no está disponible.',
	delivery_minimum_subtotal: 'El subtotal no alcanza el mínimo configurado para delivery.',
	invalid_item_price: 'El total del pedido no coincide con el catálogo y la tarifa de delivery configurada. Vuelve a cotizar.',
};

function normalizeRpcError(error) {
	const raw = String(error?.message || error || 'Error en la transacción');
	const key = Object.keys(FRIENDLY_ERRORS).find((candidate) =>
		raw.toLowerCase().includes(candidate),
	);
	const wrapped = new Error(key ? FRIENDLY_ERRORS[key] : raw);
	wrapped.code = key || error?.code || 'atomic_order_transaction_failed';
	wrapped.cause = error;
	return wrapped;
}

function isTransientRpcError(error) {
	const code = String(error?.code || '').toUpperCase();
	const message = String(error?.message || '').toLowerCase();
	return ['PGRST000', 'PGRST001', '502', '503', '504'].includes(code)
		|| message.includes('fetch failed')
		|| message.includes('network')
		|| message.includes('timeout')
		|| message.includes('temporarily unavailable');
}

async function rpc(name, args, maxAttempts = 2) {
	let lastError = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const { data, error } = await supabase.rpc(name, args);
		if (!error) return data;
		lastError = error;
		if (!isTransientRpcError(error) || attempt === maxAttempts) break;
		// The exact same idempotency key is reused. If the first request committed
		// but its response was lost, PostgreSQL returns the original order.
		await new Promise((resolve) => globalThis.setTimeout(resolve, 100 * attempt));
	}
	throw normalizeRpcError(lastError);
}

export const atomicOrderTransactionService = {
	create(input) {
		return rpc('create_manual_order_atomic_v1', input);
	},

	async settleAndTransition(order, paymentPatch = null, targetStatus = null, requestId = createClientUuid()) {
		const breakdown = paymentPatch?.payment_breakdown || order?.payment_breakdown || null;
		const paymentType = paymentPatch?.payment_type || order?.payment_type || null;
		const result = await rpc('settle_and_transition_order_atomic_v1', {
			p_order_id: order.id,
			p_client_request_id: requestId,
			p_payment_type: paymentType,
			p_payment_method_specific:
				paymentPatch?.payment_method_specific || order?.payment_method_specific || paymentType,
			p_payment_breakdown: breakdown,
			p_target_status: targetStatus,
		});
		return result?.order || result;
	},
};
