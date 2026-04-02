import { supabase } from '../../lib/supabase';
import { uploadImage } from '../../shared/utils/cloudinary';
import {
    computeDeliveryFee,
    effectiveDeliveryPricingMode,
    normalizeDeliverySettings,
    isOrderPaymentAllowedForDelivery,
} from '@/lib/delivery-settings';

function extractOrderId(newOrder) {
    if (newOrder == null) return null;
    if (typeof newOrder === 'string') return newOrder;
    if (typeof newOrder === 'object') {
        const id = newOrder.id ?? newOrder.order_id;
        return id != null ? String(id) : null;
    }
    return null;
}

function isDeliveryOrderType(raw) {
    const t = String(raw ?? 'pickup').trim().toLowerCase();
    return t === 'delivery' || t === 'envio' || t === 'envío' || t === 'despacho';
}

/**
 * Servicio Senior de Órdenes
 * Encapsula la lógica de negocio de creación de pedidos tanto para 
 * clientes (Web) como para administración (Manual).
 */
export const ordersService = {
    /**
     * Crea un pedido completo vinculándolo a un cliente (o creando uno nuevo)
     */
    async createOrder(orderData, receiptFile = null) {
        try {
            // 0. VALIDACIÓN DE CAJA (REGLA DE NEGOCIO GLOBAL)
            if (!orderData.branch_id) {
                throw new Error("El ID de sucursal es obligatorio para crear un pedido.");
            }

            if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
                throw new Error("El pedido debe contener al menos un producto.");
            }

            const requestedMap = new Map(
                orderData.items
                    .filter((item) => Boolean(item?.id))
                    .map((item) => [String(item.id), {
                        quantity: Math.max(1, Number(item.quantity) || 1),
                        description: item.description ?? null,
                    }])
            );

            const requestedIds = Array.from(requestedMap.keys());
            if (requestedIds.length === 0) {
                throw new Error('El pedido debe contener al menos un producto válido.');
            }

            const [
                { data: prices, error: pricesError },
                { data: branchRows, error: branchRowsError },
                { data: productsMeta, error: productsMetaError },
            ] = await Promise.all([
                supabase
                    .from('product_prices')
                    .select('product_id, price, has_discount, discount_price')
                    .eq('branch_id', orderData.branch_id)
                    .eq('is_active', true)
                    .in('product_id', requestedIds),
                supabase
                    .from('product_branch')
                    .select('product_id')
                    .eq('branch_id', orderData.branch_id)
                    .eq('is_active', true)
                    .in('product_id', requestedIds),
                supabase
                    .from('products')
                    .select('id, name')
                    .eq('is_active', true)
                    .in('id', requestedIds),
            ]);

            if (pricesError || branchRowsError || productsMetaError) {
                throw new Error('No se pudo validar los productos de la sucursal. Intenta nuevamente.');
            }

            const pricesByProduct = new Map((prices || []).map((row) => [String(row.product_id), row]));
            const branchActiveIds = new Set((branchRows || []).map((row) => String(row.product_id)));
            const productNames = new Map((productsMeta || []).map((row) => [String(row.id), row.name]));

            const normalizedItems = [];

            for (const productId of requestedIds) {
                if (!branchActiveIds.has(productId)) continue;

                const dbPriceRow = pricesByProduct.get(productId);
                if (!dbPriceRow) continue;

                const basePrice = Number(dbPriceRow.price || 0);
                const discountPrice = Number(dbPriceRow.discount_price || 0);
                const hasDiscount = Boolean(dbPriceRow.has_discount) && discountPrice > 0;
                const effectivePrice = hasDiscount ? discountPrice : basePrice;
                if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) continue;

                const requested = requestedMap.get(productId);
                if (!requested) continue;

                normalizedItems.push({
                    id: productId,
                    name: String(productNames.get(productId) || 'Producto'),
                    quantity: requested.quantity,
                    price: effectivePrice,
                    has_discount: false,
                    discount_price: null,
                    description: requested.description,
                });
            }

            if (normalizedItems.length === 0) {
                throw new Error('Ningún producto del carrito está disponible en esta sucursal en este momento.');
            }

            const { data: openShift } = await supabase
                .from('cash_shifts')
                .select('id')
                .eq('status', 'open')
                .eq('branch_id', orderData.branch_id)
                .maybeSingle();

            if (!openShift) {
                throw new Error("El local no está recibiendo pedidos en este momento (Caja Cerrada). Por favor verifique el horario de atención.");
            }

            const calculatedItemsTotal = normalizedItems.reduce((sum, item) => {
                const price = (item.has_discount && item.discount_price && Number(item.discount_price) > 0) 
                    ? Number(item.discount_price) 
                    : Number(item.price || 0);
                
                const qty = Math.max(1, Number(item.quantity) || 1);
                
                return sum + (price * qty);
            }, 0);

            const { data: branchCfg, error: branchCfgError } = await supabase
                .from('branches')
                .select('delivery_settings, payment_methods')
                .eq('id', orderData.branch_id)
                .maybeSingle();

            if (branchCfgError) {
                throw new Error('No se pudo validar la configuración de la sucursal. Intenta nuevamente.');
            }

            const deliverySettings = normalizeDeliverySettings(branchCfg?.delivery_settings);
            const deliveryMode = isDeliveryOrderType(orderData.order_type);

            let deliveryFee = 0;
            if (deliveryMode) {
                if (!deliverySettings.enabled) {
                    throw new Error('El delivery no está habilitado para esta sucursal.');
                }
                const namedIdRaw =
                    orderData.delivery_named_area_id ?? orderData.namedAreaId;
                let namedId =
                    typeof namedIdRaw === 'string' && namedIdRaw.trim()
                        ? namedIdRaw.trim()
                        : null;
                const km = Number(orderData.delivery_km);
                const safeKm = Number.isFinite(km) && km >= 0 ? km : 0;
                const priceMode = effectiveDeliveryPricingMode(deliverySettings);

                if (priceMode === 'named' && deliverySettings.namedAreaResolution === 'address_matched') {
                    const da = orderData.delivery_address;
                    const addr =
                        da && typeof da === 'object'
                            ? String(da.address ?? da.formatted_address ?? '').trim()
                            : '';
                    if (addr.length < 8) {
                        throw new Error('Completa la dirección de entrega (calle, número y comuna o ciudad).');
                    }
                    if (typeof window === 'undefined') {
                        throw new Error('Cotización por dirección no disponible en este contexto.');
                    }
                    const geoRes = await fetch(`${window.location.origin}/api/delivery-geocode`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            branchId: orderData.branch_id,
                            address: addr,
                            subtotal: calculatedItemsTotal,
                        }),
                    });
                    const geoJson = await geoRes.json().catch(() => ({}));
                    if (!geoRes.ok || !geoJson.ok) {
                        throw new Error(geoJson.error || 'No se pudo calcular el envío según la dirección.');
                    }
                    namedId = geoJson.namedAreaId;
                    orderData.delivery_named_area_id = namedId;
                    if (da && typeof da === 'object') {
                        orderData.delivery_address = {
                            ...da,
                            named_area_id: namedId,
                            named_area_label: geoJson.label,
                        };
                    }
                }

                const r =
                    priceMode === 'named'
                        ? computeDeliveryFee(deliverySettings, 0, calculatedItemsTotal, {
                              namedAreaId: namedId,
                          })
                        : computeDeliveryFee(deliverySettings, safeKm, calculatedItemsTotal);
                if (r.fee === -1) {
                    throw new Error('La distancia indicada supera el máximo permitido para delivery en esta sucursal.');
                }
                if (r.fee === -2) {
                    throw new Error('El subtotal del pedido no alcanza el mínimo requerido para delivery.');
                }
                if (r.fee === -3) {
                    throw new Error('Debes elegir una zona de entrega.');
                }
                if (r.fee === -4) {
                    throw new Error('La zona de entrega seleccionada no es válida.');
                }
                deliveryFee = r.fee;

                const branchPm = branchCfg?.payment_methods;
                if (
                    !isOrderPaymentAllowedForDelivery(
                        orderData,
                        Array.isArray(branchPm) ? branchPm : [],
                        deliverySettings,
                    )
                ) {
                    throw new Error(
                        'El método de pago no está permitido para delivery en esta sucursal.',
                    );
                }
            }

            const itemsSubtotal = Math.round(calculatedItemsTotal * 100) / 100;
            // La RPC valida precios de ítems contra la BD y exige coherencia con el subtotal de productos
            // (sin incluir el cargo de envío; el envío se confirma después en /api/public-order-delivery).
            const totalForRpc = itemsSubtotal;

            // 1. Subida de comprobante (si aplica). Si falla, guardamos el pedido igual.
            let receiptUrl = null;
            let receiptUploadFailed = false;
            if (orderData.payment_type === 'online' && receiptFile) {
                try {
                    receiptUrl = await uploadImage(receiptFile, 'receipts');
                } catch {
                    receiptUploadFailed = true;
                }
            }

            // 2. Preparar datos para la transacción
            const paymentRef = receiptUrl
                || orderData.payment_ref
                || (orderData.payment_type === 'online' ? 'Comprobante pendiente por WhatsApp' : 'Pago Presencial');

            // Agregar info de sucursal a la nota para que el admin sepa
            let finalNote = orderData.note || '';
            if (orderData.branch_name) {
                finalNote = `[Sucursal: ${orderData.branch_name}] \n${finalNote}`.trim();
            }
            if (deliveryMode && deliveryFee > 0) {
                finalNote = `${finalNote}\n[Envío: $${Math.round(deliveryFee).toLocaleString('es-CL')}]`.trim();
            }

            const clientRut = String(orderData.client_rut ?? orderData.client_document ?? '').trim();

            // 3. EJECUTAR TRANSACCIÓN ATÓMICA (RPC)
            const { data: newOrder, error: orderError } = await supabase.rpc('create_order_transaction', {
                p_client_name: orderData.client_name,
                p_client_phone: orderData.client_phone,
                p_client_rut: clientRut,
                p_items: normalizedItems,
                p_total: totalForRpc,
                p_payment_type: orderData.payment_type,
                p_payment_ref: paymentRef,
                p_payment_method_specific: orderData.payment_method_specific ?? null,
                p_note: finalNote,
                p_branch_id: orderData.branch_id,
                p_company_id: orderData.company_id || null,
                p_status: orderData.status || 'pending'
            });

            if (orderError) {
                const rpcMessage = String(orderError.message || '').toLowerCase();
                if (rpcMessage.includes('invalid_item_price')) {
                    throw new Error('Hay productos del carrito que no están disponibles para esta sucursal. Actualiza el menú e intenta nuevamente.');
                }
                if (rpcMessage.includes('no_items_available')) {
                    throw new Error('Ningún producto del carrito está disponible en esta sucursal en este momento.');
                }
                if (rpcMessage.includes('insufficient_inventory_stock')) {
                    throw new Error('Stock insuficiente en inventario para completar el pedido. Revisa recetas y existencias en la sucursal.');
                }
                if (rpcMessage.includes('inventory_branch_missing')) {
                    throw new Error('Falta configuración de stock en sucursal para un insumo del pedido. Completa el inventario por local.');
                }
                throw orderError;
            }

            const orderId = extractOrderId(newOrder);
            if (orderId && deliveryMode && typeof window !== 'undefined') {
                const patchRes = await fetch(`${window.location.origin}/api/public-order-delivery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId,
                        orderType: 'delivery',
                        deliveryKm: Number(orderData.delivery_km),
                        deliveryFee,
                        deliveryAddress: orderData.delivery_address ?? null,
                        deliveryLat: orderData.delivery_lat,
                        deliveryLng: orderData.delivery_lng,
                        namedAreaId:
                            typeof orderData.delivery_named_area_id === 'string'
                                ? orderData.delivery_named_area_id.trim()
                                : typeof orderData.namedAreaId === 'string'
                                  ? orderData.namedAreaId.trim()
                                  : undefined,
                    }),
                });
                if (!patchRes.ok) {
                    const j = await patchRes.json().catch(() => ({}));
                    throw new Error(j.error || 'No se pudo registrar los datos de envío del pedido.');
                }
            }

            return { order: newOrder, receiptUploadFailed };
        } catch (error) {
            throw error;
        }
    }
};

export const createManualOrder = (orderData, receiptFile) => ordersService.createOrder(orderData, receiptFile);
