import { supabase } from '@/integrations/supabase';

const RPC_ERRORS = {
	auth_required: 'Tu sesión expiró. Vuelve a iniciar sesión.',
	branch_not_allowed: 'No tienes acceso a esta sucursal.',
	branch_currency_required: 'La sucursal o empresa debe configurar una moneda ISO para este país.',
	fulfillment_disabled: 'Este tipo de entrega no está habilitado en la sucursal.',
	invalid_item_price: 'El catálogo cambió. Actualiza los productos y vuelve a cotizar.',
	invalid_item_quantity: 'La cantidad de un producto no es válida (mínimo 1, máximo 20).',
	duplicate_item: 'El carrito contiene un producto duplicado; actualízalo antes de continuar.',
	inventory_update_not_configured: 'La actualización transaccional de inventario no está configurada; no se guardó ningún cambio.',
	invalid_coupon: 'El cupón no es válido.',
	coupon_expired: 'El cupón ya no está vigente.',
	coupon_min_subtotal: 'El pedido no alcanza el mínimo del cupón.',
	delivery_disabled: 'Delivery no está habilitado en esta sucursal.',
	delivery_address_required: 'Completa la dirección de entrega.',
	delivery_distance_required: 'Falta calcular la distancia de entrega; valida nuevamente la dirección.',
	delivery_configuration_error: 'La configuración de delivery está incompleta. Corrígela antes de continuar.',
	delivery_external_quote_required: 'Este delivery necesita una cotización externa que no está disponible en el flujo manual.',
	invalid_delivery_area: 'La zona de entrega ya no está disponible.',
	operator_reference_required: 'Indica la mesa o referencia del mesero.',
	customer_name_required: 'Indica el nombre del cliente.',
	customer_phone_required: 'Ingresa un teléfono internacional válido.',
	customer_document_required: 'El documento es obligatorio para este tipo de pedido.',
	customer_document_invalid: 'El documento no tiene un formato válido para el país de la sucursal.',
	quote_changed: 'El precio cambió. Revisa la nueva cotización antes de confirmar.',
	payment_total_mismatch: 'Los métodos de pago deben sumar exactamente el total.',
	payment_method_not_allowed: 'El método de pago ya no está habilitado en esta sucursal.',
	invalid_payment_rail: 'El tipo del método de pago no coincide con su configuración.',
	invalid_evidence_policy: 'La política de comprobante del método cambió; revisa el pago.',
	insufficient_tender: 'El efectivo recibido no alcanza para cubrir el importe.',
	exchange_rate_required: 'La tasa de cambio no está configurada o cambió; vuelve a cotizar.',
	payment_conversion_mismatch: 'La conversión del pago no coincide con la tasa vigente.',
	immediate_session_payment_disabled: 'El cobro inmediato está deshabilitado para este tipo de sesión.',
	cash_shift_required: 'Debes abrir la caja de esta sucursal antes de confirmar.',
	order_changed: 'El pedido cambió en otro dispositivo. Recarga la versión actual.',
	order_changed_or_not_allowed: 'El pedido cambió o ya no tienes acceso a él.',
	refund_required: 'La reducción requiere una devolución autorizada.',
	refund_reason_required: 'Indica el motivo de la devolución.',
	order_already_settled: 'El pedido ya está pagado.',
	invalid_company_storage_path: 'El comprobante no pertenece al almacenamiento privado de esta empresa.',
};

function throwFriendly(error) {
	const raw = String(error?.message ?? error ?? 'Error desconocido');
	const key = Object.keys(RPC_ERRORS).find((candidate) => raw.toLowerCase().includes(candidate));
	const wrapped = new Error(key ? RPC_ERRORS[key] : raw);
	wrapped.code = key ?? error?.code ?? 'manual_order_v2_error';
	wrapped.cause = error;
	throw wrapped;
}

async function rpc(name, args) {
	const { data, error } = await supabase.rpc(name, args);
	if (error) throwFriendly(error);
	return data;
}

export const manualOrderV2Service = {
	quote(input) {
		return rpc('quote_manual_order_v2', {
			p_branch_id: input.branchId,
			p_items: input.items,
			p_fulfillment: input.fulfillment,
			p_delivery: input.delivery ?? {},
			p_coupon_code: input.couponCode || null,
			p_client_phone: input.clientPhone || null,
		});
	},

	create(input) {
		return rpc('create_manual_order_v2', {
			p_branch_id: input.branchId,
			p_client_request_id: input.clientRequestId,
			p_mode: input.mode,
			p_fulfillment: input.fulfillment,
			p_payment_timing: input.paymentTiming,
			p_customer: input.customer ?? {},
			p_operator_reference: input.operatorReference || null,
			p_delivery: input.delivery ?? {},
			p_items: input.items,
			p_coupon_code: input.couponCode || null,
			p_note: input.note || '',
			p_payment_lines: input.paymentLines ?? [],
			p_quote_hash: input.quoteHash,
		});
	},

	update(orderId, expectedUpdatedAt, patch) {
		return rpc('update_manual_order_v2', {
			p_order_id: String(orderId),
			p_expected_updated_at: expectedUpdatedAt,
			p_patch: patch,
		});
	},

	settle(orderId, paymentLines, clientRequestId = crypto.randomUUID()) {
		return rpc('settle_order_v2', {
			p_order_id: String(orderId),
			p_client_request_id: clientRequestId,
			p_payment_lines: paymentLines,
		});
	},

	transition(orderId, status, expectedUpdatedAt = null) {
		return rpc('transition_order_v2', {
			p_order_id: String(orderId),
			p_status: status,
			p_expected_updated_at: expectedUpdatedAt,
		});
	},

	refund(orderId, { amountMinor, paymentLineId, reason, clientRequestId = crypto.randomUUID() }) {
		return rpc('refund_order_payment_v2', {
			p_order_id: String(orderId),
			p_client_request_id: clientRequestId,
			p_amount_minor: amountMinor,
			p_payment_line_id: paymentLineId,
			p_reason: reason,
		});
	},

	attachEvidence(evidenceId, storagePath, errorMessage = null) {
		return rpc('attach_order_payment_evidence_v2', {
			p_evidence_id: evidenceId,
			p_storage_path: storagePath,
			p_error: errorMessage,
		});
	},

	markEvidenceUploading(evidenceId) {
		return rpc('mark_order_payment_evidence_uploading_v2', { p_evidence_id: evidenceId });
	},

	async recordMetric({ branchId, eventName, mode = null, fulfillment = null, step = null }) {
		if (!branchId || !eventName) return false;
		const { error } = await supabase.rpc('record_manual_order_metric_v1', {
			p_branch_id: branchId,
			p_event_name: eventName,
			p_mode: mode,
			p_fulfillment: fulfillment,
			p_step: step,
		});
		return !error;
	},

	async listEvidence(orderId) {
		const { data, error } = await supabase
			.from('order_payment_evidence')
			.select('id, company_id, order_id, payment_line_id, method_id, status, storage_path, error, created_at, updated_at')
			.eq('order_id', String(orderId))
			.order('created_at', { ascending: true });
		if (error) throwFriendly(error);
		return data ?? [];
	},

	async listPaymentLedger(orderId) {
		const [linesResult, refundsResult] = await Promise.all([
			supabase.from('order_payment_lines')
				.select('id, order_id, method_id, rail, amount_minor, currency, settlement_amount_minor, settlement_currency, exchange_rate, tendered_amount_minor, tendered_currency, change_amount_minor, evidence_policy, created_at')
				.eq('order_id', String(orderId)).order('created_at', { ascending: true }),
			supabase.from('order_payment_refunds')
				.select('id, order_id, payment_line_id, amount_minor, currency, reason, created_at')
				.eq('order_id', String(orderId)).order('created_at', { ascending: true }),
		]);
		if (linesResult.error) throwFriendly(linesResult.error);
		if (refundsResult.error) throwFriendly(refundsResult.error);
		const refunds = refundsResult.data ?? [];
		return (linesResult.data ?? []).map((line) => {
			const refundedMinor = refunds
				.filter((refund) => refund.payment_line_id === line.id)
				.reduce((total, refund) => total + Number(refund.amount_minor || 0), 0);
			return { ...line, refundedMinor, refundableMinor: Math.max(0, Number(line.amount_minor) - refundedMinor) };
		});
	},
};

export function isManualOrderV2Enabled(branch) {
	const envEnabled = String(import.meta.env.VITE_MANUAL_ORDER_V2 ?? '').toLowerCase() === 'true';
	return envEnabled || branch?.manual_order_settings?.enabled === true;
}
