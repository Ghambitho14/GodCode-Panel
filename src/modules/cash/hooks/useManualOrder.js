import { useState, useCallback, useMemo, useEffect } from 'react';
import { useManualOrderCart } from './manual-order/useManualOrderCart';
import { useManualOrderForm } from './manual-order/useManualOrderForm';
import { useCouponValidation } from './manual-order/useCouponValidation';
import { useReceiptUpload } from './manual-order/useReceiptUpload';
import { createManualOrder } from '../admin/orders/services/orders';
import { resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { buildPaymentBreakdownForOrder } from '@/shared/utils/orderUtils';
import { effectiveDeliveryPricingMode } from '@/lib/delivery-settings';
import { canOverrideDeliveryFee } from '../utils/deliveryFeePermissions';
import { normalizeManualPhone } from '../services/clientService';
import {
    sanitizeManualOrderInput,
    computeDeliveryFeeForForm,
    resolveOpenMesaClientName,
    resolveOpenMesaCheckoutPayment,
    getLocalFulfillmentMode,
    isOpenMesaMeseroMode,
    OPEN_MESA_CAJA_DEFAULTS,
} from './manual-order/manualOrderShared';

/**
 * Hook orquestador principal del pedido manual.
 * Delega lógicas específicas a sub-hooks especializados y expone una API unificada compatible.
 */
export const useManualOrder = (showNotify, onOrderSaved, onClose, branch, branchDeliveryCfg = null, userRole = null, openMesaMode = false, localOrderChannels = null, companyProfile = null) => {
    const formCountry = useMemo(
        () => resolveEffectiveCountry(branch, companyProfile),
        [branch, companyProfile],
    );
    const formStrategy = useMemo(() => getFormStrategy(formCountry), [formCountry]);
    
    // 1. Sub-hook para el Carrito
    const {
        items,
        total,
        addItem,
        updateQuantity,
        removeItem,
        updateItemNote,
        resetCart
    } = useManualOrderCart();

    // 2. Sub-hook para el Formulario
    const {
        form,
        rutValid,
        phoneValid,
        updateClientName,
        updateCouponCode,
        updateNote,
        updateOrderType,
        updateLocalFulfillmentMode,
        updateMesaPartyMode,
        updateDeliveryAddress,
        updateDeliveryReference,
        updateDeliveryKm,
        updateDeliveryFee,
        updateDeliveryNamedAreaId,
        updatePaymentType,
        updatePaymentMode,
        updateCashAmount,
        updateCardAmount,
        updateCashTendered,
        updateChargeNow,
        handleRutChange,
        handlePhoneChange,
        applyClientRecord,
        applySavedAddress,
        resetForm,
        resetOpenMesaForm,
        getInputStyle
    } = useManualOrderForm(localOrderChannels, formCountry);

    // 3. Sub-hook para Cupones
    const {
        couponPreview,
        resetCoupon
    } = useCouponValidation(
        branch?.company_id,
        form.coupon_code,
        total,
        form.client_phone
    );

    // 4. Sub-hook para Comprobante de Transferencia
    const {
        receiptFile,
        receiptPreview,
        handleFileChange,
        removeReceipt,
        resetReceipt
    } = useReceiptUpload(showNotify);

    const [loading, setLoading] = useState(false);

    // Cambiar tipo de pago y limpiar comprobante si no es transferencia
    const handlePaymentTypeChange = useCallback((type) => {
        updatePaymentType(type);
        if (type !== 'online') {
            resetReceipt();
        }
    }, [updatePaymentType, resetReceipt]);

    // Reseteo global de todo el flujo
    const resetOrder = useCallback(() => {
        resetCart();
        if (openMesaMode) {
            resetOpenMesaForm();
        } else {
            resetForm();
        }
        resetCoupon();
        resetReceipt();
    }, [resetCart, resetForm, resetOpenMesaForm, resetCoupon, resetReceipt, openMesaMode]);

    const syncDeliveryFeeFromForm = useCallback((formState, itemsSubtotal) => {
        if (!branchDeliveryCfg || formState.order_type !== 'delivery') return null;
        return computeDeliveryFeeForForm(branchDeliveryCfg, itemsSubtotal, {
            orderType: formState.order_type,
            namedAreaId: formState.delivery_named_area_id,
            deliveryKm: formState.delivery_km,
        });
    }, [branchDeliveryCfg]);

    useEffect(() => {
        if (form.order_type !== 'delivery' || !branchDeliveryCfg) return;
        const nextFee = syncDeliveryFeeFromForm(form, total);
        if (nextFee == null) return;
        if (Number(form.delivery_fee) !== nextFee) {
            updateDeliveryFee(nextFee);
        }
    }, [
        form.order_type,
        form.delivery_named_area_id,
        form.delivery_km,
        form.delivery_fee,
        total,
        branchDeliveryCfg,
        syncDeliveryFeeFromForm,
        updateDeliveryFee,
    ]);

    const handleUpdateLocalFulfillmentMode = useCallback((mode) => {
        updateLocalFulfillmentMode(mode, branchDeliveryCfg, total);
        if (mode === 'delivery' && branchDeliveryCfg) {
            const fee = computeDeliveryFeeForForm(branchDeliveryCfg, total, {
                orderType: 'delivery',
                namedAreaId: form.delivery_named_area_id,
                deliveryKm: form.delivery_km,
            });
            if (fee != null) updateDeliveryFee(fee);
        }
    }, [
        updateLocalFulfillmentMode,
        updateDeliveryFee,
        branchDeliveryCfg,
        total,
        form.delivery_named_area_id,
        form.delivery_km,
    ]);

    const handleUpdateOrderType = useCallback((val, cfg = branchDeliveryCfg, subtotal = total) => {
        updateOrderType(val, cfg, subtotal);
        if (openMesaMode && !String(form.selected_client_id ?? '').trim()) {
            updateClientName(resolveOpenMesaClientName(val));
        }
        if (val === 'delivery' && cfg) {
            const fee = computeDeliveryFeeForForm(cfg, subtotal, {
                orderType: 'delivery',
                namedAreaId: form.delivery_named_area_id,
                deliveryKm: form.delivery_km,
            });
            if (fee != null) updateDeliveryFee(fee);
        }
    }, [updateOrderType, updateClientName, updateDeliveryFee, branchDeliveryCfg, total, form.delivery_named_area_id, form.delivery_km, form.selected_client_id, openMesaMode]);

    const handleUpdateDeliveryNamedAreaId = useCallback((val) => {
        updateDeliveryNamedAreaId(val);
        if (!branchDeliveryCfg || form.order_type !== 'delivery') return;
        const fee = computeDeliveryFeeForForm(branchDeliveryCfg, total, {
            orderType: 'delivery',
            namedAreaId: val,
            deliveryKm: form.delivery_km,
        });
        updateDeliveryFee(fee != null ? fee : 0);
    }, [updateDeliveryNamedAreaId, updateDeliveryFee, branchDeliveryCfg, form.order_type, form.delivery_km, total]);

    const handleUpdateDeliveryKm = useCallback((val) => {
        updateDeliveryKm(val);
        if (!branchDeliveryCfg || form.order_type !== 'delivery') return;
        if (effectiveDeliveryPricingMode(branchDeliveryCfg) !== 'distance') return;
        const fee = computeDeliveryFeeForForm(branchDeliveryCfg, total, {
            orderType: 'delivery',
            namedAreaId: form.delivery_named_area_id,
            deliveryKm: val,
        });
        if (fee != null) updateDeliveryFee(fee);
    }, [updateDeliveryKm, updateDeliveryFee, branchDeliveryCfg, form.order_type, form.delivery_named_area_id, total]);

    // Modelo de datos unificado compatible con el modal
    const manualOrder = useMemo(() => {
        const itemsSubtotal = total;
        const deliveryFeeAmt = form.order_type === 'delivery' ? (Number(form.delivery_fee) || 0) : 0;
        const checkoutTotal = Math.round((itemsSubtotal + deliveryFeeAmt) * 100) / 100;
        return {
            ...form,
            items,
            total: itemsSubtotal,
            items_subtotal: itemsSubtotal,
            delivery_fee: deliveryFeeAmt,
            checkout_total: checkoutTotal,
        };
    }, [form, items, total]);

    // Envío del pedido manual
    const submitOrder = async () => {
        if (!branch) {
            showNotify('Error: No hay sucursal seleccionada', 'error');
            return;
        }

        if (openMesaMode) {
            if (items.length === 0) {
                showNotify('Agrega al menos un producto', 'error');
                return;
            }
            const isMesero = isOpenMesaMeseroMode(form);
            if (isMesero) {
                const meseroName = String(form.client_name ?? '').trim();
                if (meseroName.length < 2) {
                    showNotify('Indica el nombre del mesero', 'error');
                    return;
                }
            } else {
                const hasClient =
                    Boolean(String(form.selected_client_id ?? '').trim()) ||
                    Boolean(String(form.client_name ?? '').trim()) ||
                    form.order_type === 'delivery';
                if (!hasClient) {
                    showNotify('Busca y selecciona un cliente registrado o escribe un nombre', 'error');
                    return;
                }
                if (!form.client_rut || !formStrategy.validateId(form.client_rut) || !formStrategy.validatePhone(form.client_phone || '')) {
                    showNotify(`Faltan datos de cliente o son incorrectos (${formStrategy.idName} y teléfono)`, 'error');
                    return;
                }
            }
        } else {
            if (!form.client_name || form.client_name.trim().length < 3 || !formStrategy.validatePhone(form.client_phone || '') || items.length === 0) {
                showNotify('Faltan datos obligatorios o son incorrectos', 'error');
                return;
            }
        }

        if (form.order_type === 'delivery' && branchDeliveryCfg) {
            const pricing = effectiveDeliveryPricingMode(branchDeliveryCfg);
            const areaCount = Array.isArray(branchDeliveryCfg.namedAreas) ? branchDeliveryCfg.namedAreas.length : 0;

            if (pricing === 'named' && areaCount > 0) {
                const zid = String(form.delivery_named_area_id ?? '').trim();
                if (!zid) {
                    showNotify('Selecciona la zona de entrega', 'error');
                    return;
                }
            } else if (pricing === 'distance') {
                const addr = String(form.delivery_address ?? '').trim();
                if (addr.length < 5) {
                    showNotify('La dirección de despacho es obligatoria para delivery por distancia.', 'error');
                    return;
                }
            } else {
                const addr = String(form.delivery_address ?? '').trim();
                const zid = String(form.delivery_named_area_id ?? '').trim();
                if (addr.length < 5 && !zid) {
                    showNotify('Indica dirección de entrega u otra información de ubicación.', 'error');
                    return;
                }
            }
        } else if (
            form.order_type === 'delivery' &&
            !branchDeliveryCfg
        ) {
            const addr = String(form.delivery_address ?? '').trim();
            if (addr.length < 5) {
                showNotify('La dirección de despacho es obligatoria para Delivery', 'error');
                return;
            }
        }

        if (!openMesaMode) {
            if (!form.client_rut || !formStrategy.validateId(form.client_rut)) {
                showNotify(`El ${formStrategy.idName} ingresado no es válido`, 'error');
                return;
            }
        }

        setLoading(true);
        try {
            const openMesaMesero = openMesaMode && isOpenMesaMeseroMode(form);
            const clientName = openMesaMode
                ? sanitizeManualOrderInput(
                    resolveOpenMesaClientName(
                        form.order_type,
                        form.client_name,
                        getLocalFulfillmentMode(form),
                    ),
                )
                : sanitizeManualOrderInput(form.client_name);
            const sanitizedOrder = {
                ...form,
                items,
                total,
                client_name: clientName,
                client_phone: openMesaMode
                    ? (openMesaMesero
                        ? OPEN_MESA_CAJA_DEFAULTS.client_phone
                        : normalizeManualPhone(sanitizeManualOrderInput(form.client_phone)))
                    : normalizeManualPhone(sanitizeManualOrderInput(form.client_phone)),
                client_rut: openMesaMode
                    ? (openMesaMesero
                        ? OPEN_MESA_CAJA_DEFAULTS.client_rut
                        : sanitizeManualOrderInput(form.client_rut))
                    : sanitizeManualOrderInput(form.client_rut),
                local_fulfillment_mode: getLocalFulfillmentMode(form),
                note: sanitizeManualOrderInput(form.note),
                branch_id: branch.id,
                company_id: branch.company_id,
                branch_name: branch.name,
                order_type: form.order_type,
                delivery_address:
                    form.order_type === 'delivery'
                        ? sanitizeManualOrderInput(form.delivery_address) || ''
                        : null,
                delivery_reference:
                    form.order_type === 'delivery'
                        ? sanitizeManualOrderInput(form.delivery_reference) || ''
                        : '',
                delivery_km:
                    form.order_type === 'delivery'
                        ? form.delivery_km === '' ||
                          form.delivery_km == null
                            ? null
                            : Number(String(form.delivery_km).replace(',', '.'))
                        : null,
                delivery_named_area_id:
                    form.order_type === 'delivery'
                        ? String(form.delivery_named_area_id ?? '').trim() || null
                        : null,
                caller_role: userRole,
                ...(canOverrideDeliveryFee(userRole) && form.order_type === 'delivery'
                    ? { manual_delivery_fee: Number(form.delivery_fee) || 0 }
                    : {}),
                coupon_code: sanitizeManualOrderInput(form.coupon_code) || '',
            };

            const itemsForOrder = (items || []).map((item) => ({
                id: item.id,
                name: String(item.name ?? ''),
                quantity: Number(item.quantity) || 1,
                price: Number(item.price) || 0,
                has_discount: Boolean(item.has_discount),
                discount_price: item.has_discount && item.discount_price != null ? Number(item.discount_price) : null,
                description: item.description ? String(item.description) : null,
                note: item.note ? sanitizeManualOrderInput(String(item.note)).slice(0, 140) : null,
                manual_order_source: item.manual_order_source || null,
                is_extra: Boolean(item.is_extra)
            }));

            const totalForOrder = itemsForOrder.reduce((acc, i) => {
                const unit = i.has_discount && i.discount_price && Number(i.discount_price) > 0 ? Number(i.discount_price) : Number(i.price);
                return acc + (unit * i.quantity);
            }, 0);

            sanitizedOrder.items = itemsForOrder;

            const couponDisc =
                couponPreview?.variant === 'success' && Number(couponPreview.discount) > 0
                    ? Math.min(totalForOrder, Number(couponPreview.discount))
                    : 0;
            const deliveryFeeAmt =
                form.order_type === 'delivery'
                    ? (syncDeliveryFeeFromForm(form, totalForOrder) ?? (Number(form.delivery_fee) || 0))
                    : 0;
            const checkoutTotal = Math.round(
                (Math.max(0, totalForOrder - couponDisc) + deliveryFeeAmt) * 100,
            ) / 100;

            sanitizedOrder.delivery_fee = deliveryFeeAmt;
            sanitizedOrder.total = checkoutTotal;

            if (openMesaMode) {
                const paymentFields = resolveOpenMesaCheckoutPayment(form, checkoutTotal);
                sanitizedOrder.payment_type = paymentFields.payment_type;
                sanitizedOrder.payment_breakdown = paymentFields.payment_breakdown;
            } else {
                sanitizedOrder.payment_breakdown = buildPaymentBreakdownForOrder({
                    payment_mode: form.payment_mode,
                    payment_type: form.payment_type,
                    cash_amount: form.cash_amount,
                    card_amount: form.card_amount,
                    total: checkoutTotal,
                });
            }

            const result = await createManualOrder(
                sanitizedOrder,
                openMesaMode && !form.charge_now ? null : receiptFile,
            );
            const createdOrder = result?.order ?? result;

            showNotify(
                openMesaMode
                    ? ({
                        mesa: 'Mesa abierta',
                        retiro: 'Retiro abierto',
                        delivery: 'Delivery abierto',
                    }[getLocalFulfillmentMode(form)] ?? 'Sesión abierta')
                    : 'Pedido creado con éxito',
                'success',
            );
            resetOrder();
            if (onOrderSaved) onOrderSaved(createdOrder);
            if (onClose) onClose();

        } catch (error) {
            showNotify(error.message || 'Error al crear pedido', 'error');
        } finally {
            setLoading(false);
        }
    };

    const isValid = useMemo(() => {
        return form.client_name && items.length > 0;
    }, [form.client_name, items]);

    return {
        manualOrder,
        loading,
        rutValid,
        phoneValid,
        receiptFile,
        receiptPreview,
        updateClientName,
        updateCouponCode,
        couponPreview,
        updateNote,
        updatePaymentType: handlePaymentTypeChange,
        updatePaymentMode,
        updateCashAmount,
        updateCardAmount,
        updateCashTendered,
        updateChargeNow,
        handleRutChange,
        handlePhoneChange,
        applyClientRecord,
        applySavedAddress,
        handleFileChange,
        removeReceipt,
        addItem,
        updateQuantity,
        removeItem,
        updateItemNote,
        updateOrderType: handleUpdateOrderType,
        updateLocalFulfillmentMode: handleUpdateLocalFulfillmentMode,
        updateMesaPartyMode,
        updateDeliveryAddress,
        updateDeliveryReference,
        updateDeliveryKm: handleUpdateDeliveryKm,
        updateDeliveryFee,
        updateDeliveryNamedAreaId: handleUpdateDeliveryNamedAreaId,
        submitOrder,
        resetOrder,
        isValid,
        getInputStyle
    };
};