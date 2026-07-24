import { supabase } from '@/integrations/supabase';
import { createClientUuid } from '@/shared/utils/supabaseStorage';

const FRIENDLY_ERRORS = {
	order_changed: 'El pedido cambió en otro dispositivo. Recarga antes de guardar.',
	order_changed_or_not_allowed: 'El pedido cambió o ya no tienes acceso.',
	order_line_changed: 'El producto cambió en cocina. Actualiza el pedido.',
	order_line_quantity_locked: 'No puedes eliminar una cantidad que ya está preparando o lista.',
	order_line_content_locked: 'No puedes cambiar el producto o su nota después de iniciar la preparación.',
	order_line_quantity_unavailable: 'No quedan unidades pendientes para iniciar.',
	order_line_not_preparing: 'Esa cantidad todavía no está marcada en preparación.',
	order_line_not_ready: 'Esa cantidad todavía no está lista.',
	refund_required: 'El nuevo total es menor que lo pagado. Debes registrar una devolución autorizada.',
	quote_changed: 'El total cambió al revalidarlo. Revisa precios, cupón y delivery.',
	cash_shift_required: 'Debes abrir caja antes de confirmar este pago.',
	payment_total_mismatch: 'El pago no coincide exactamente con el saldo pendiente.',
	payment_evidence_required: 'Este método requiere un comprobante persistido antes de registrar el pago.',
	mixed_payment_not_allowed: 'Uno de los métodos seleccionados no admite pago mixto.',
	duplicate_payment_method: 'Cada método de pago solo puede aparecer una vez.',
	payment_conversion_mismatch: 'La conversión del pago no coincide con la tasa registrada.',
	payment_confirmation_required: 'Este método solo puede confirmarse mediante su proveedor de pago.',
	cash_confirmation_required: 'Confirma el monto de efectivo recibido antes de registrar el pago.',
	cash_change_mismatch: 'El vuelto calculado no coincide con el efectivo recibido.',
	order_edit_not_allowed: 'Este pedido ya fue entregado o anulado y no admite edición.',
	invalid_fulfillment: 'El tipo de entrega no es válido.',
	delivery_address_required: 'Selecciona la zona o dirección de delivery.',
	operator_reference_required: 'Indica la mesa o referencia operativa.',
	evidence_not_found_or_not_allowed: 'El comprobante no existe o no tienes acceso.',
	invalid_company_storage_path: 'El archivo no pertenece al almacenamiento privado de esta empresa.',
};

function friendlyError(error) {
	const raw = String(error?.message ?? error ?? 'Error en la operación');
	const code = Object.keys(FRIENDLY_ERRORS).find((candidate) =>
		raw.toLowerCase().includes(candidate),
	);
	const wrapped = new Error(code ? FRIENDLY_ERRORS[code] : raw);
	wrapped.code = code ?? error?.code ?? 'order_lifecycle_v3_error';
	wrapped.cause = error;
	return wrapped;
}

async function rpc(name, args) {
	const { data, error } = await supabase.rpc(name, args);
	if (error) throw friendlyError(error);
	return data;
}

export const orderLifecycleV3Service = {
	async listLines(orderId) {
		if (!orderId) return [];
		const { data, error } = await supabase
			.from('order_lines')
			.select(
				'id, order_id, source_item_id, product_snapshot, unit_price_minor, currency, quantity_ordered, quantity_preparing, quantity_prepared, quantity_served, quantity_voided, note, status, version, created_at, updated_at',
			)
			.eq('order_id', String(orderId))
			.order('created_at', { ascending: true });
		if (error) throw friendlyError(error);
		return data ?? [];
	},

	async listEvents(orderId) {
		if (!orderId) return [];
		const { data, error } = await supabase
			.from('order_line_events')
			.select('id, order_id, order_line_id, event_type, quantity, reason, metadata, created_at')
			.eq('order_id', String(orderId))
			.order('created_at', { ascending: true });
		if (error) throw friendlyError(error);
		return data ?? [];
	},

	transitionLine({
		orderId,
		lineId,
		targetStatus,
		quantity = 1,
		expectedVersion,
		clientRequestId = createClientUuid(),
	}) {
		return rpc('transition_order_line_v3', {
			p_order_id: String(orderId),
			p_order_line_id: lineId,
			p_target_status: targetStatus,
			p_quantity: quantity,
			p_expected_version: expectedVersion ?? null,
			p_client_request_id: clientRequestId,
		});
	},

	updateOrder({
		orderId,
		expectedUpdatedAt,
		patch,
		clientRequestId = createClientUuid(),
	}) {
		return rpc('update_order_v3', {
			p_order_id: String(orderId),
			p_expected_updated_at: expectedUpdatedAt ?? null,
			p_client_request_id: clientRequestId,
			p_patch: patch,
		});
	},

	settle({
		orderId,
		paymentLines,
		source = 'operator',
		clientRequestId = createClientUuid(),
	}) {
		return rpc('settle_order_payment_v3', {
			p_order_id: String(orderId),
			p_client_request_id: clientRequestId,
			p_payment_lines: paymentLines,
			p_source: source,
		});
	},

	attachReceipt({ orderId, methodId, storagePath }) {
		return rpc('attach_order_receipt_v3', {
			p_order_id: String(orderId),
			p_method_id: methodId || null,
			p_storage_path: storagePath,
		});
	},
};
