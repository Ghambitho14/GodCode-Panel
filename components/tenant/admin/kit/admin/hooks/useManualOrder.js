import { useState, useCallback, useMemo, useEffect } from 'react';
import { formatRut, validateRut } from '../../shared/utils/formatters';
import { validateImageFile } from '../../shared/utils/cloudinary';
import { createManualOrder } from '../../orders/services/orders';
import { supabase } from '../../lib/supabase';
import { TABLES } from '../../lib/supabaseTables';
import { buildCouponPreview } from '@/lib/discount-coupon';

const initialOrderState = {
    client_name: 'CAJA',
    client_rut: '1-9',
    client_phone: '+56 9 0000 0000',
    items: [],
    total: 0,
    payment_type: 'tienda',
    order_type: 'pickup',
    delivery_address: '',
    delivery_fee: 0,
    note: '',
    coupon_code: '',
};

const PREVIEW_ERR_MSG = {
    empty: '',
    invalid_coupon: 'Código no válido o cupón desactivado.',
    coupon_expired: 'Este cupón no está vigente.',
    coupon_min_subtotal: 'El subtotal no alcanza el mínimo del cupón.',
    coupon_wrong_client: 'Este cupón solo aplica con el teléfono del cliente autorizado.',
    coupon_usage_exhausted: 'Este cupón ya no tiene usos disponibles.',
    coupon_usage_exhausted_client: 'Este cupón ya fue usado con este teléfono.',
};

export const useManualOrder = (showNotify, onOrderSaved, onClose, registerSale, branch) => {

    // --- ESTADOS DE DATOS ---
    // Usar lazy initialization para evitar reset
    const [manualOrder, setManualOrder] = useState(() => initialOrderState);
    const [loading, setLoading] = useState(false);
    const [couponPreview, setCouponPreview] = useState(() => ({
        loading: false,
        discount: 0,
        message: '',
        variant: 'neutral',
    }));

    // --- ESTADOS DE VALIDACIÓN Y ARCHIVOS ---
    const [rutValid, setRutValid] = useState(true);
    const [phoneValid, setPhoneValid] = useState(true);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);

    useEffect(() => {
        return () => {
            if (receiptPreview) URL.revokeObjectURL(receiptPreview);
        };
    }, [receiptPreview]);

    const getPrice = useCallback((product) => {
        if (product?.has_discount && product?.discount_price && parseInt(product.discount_price) > 0) {
            return parseInt(product.discount_price);
        }
        return parseInt(product?.price);
    }, []);

    // --- MANEJADORES DE FORMULARIO ---
    const updateClientName = (val) => setManualOrder(prev => ({ ...prev, client_name: val }));
    const updateCouponCode = (val) => setManualOrder(prev => ({ ...prev, coupon_code: typeof val === 'string' ? val : '' }));
    const updateNote = (val) => setManualOrder(prev => ({ ...prev, note: val }));
    const updateOrderType = (val) => setManualOrder(prev => ({ ...prev, order_type: val }));
    const updateDeliveryAddress = (val) => setManualOrder(prev => ({ ...prev, delivery_address: val }));
    const updateDeliveryFee = (val) => setManualOrder(prev => ({ ...prev, delivery_fee: Number(val) || 0 }));

    const updatePaymentType = (type) => {
        setManualOrder(prev => ({ ...prev, payment_type: type }));
        // Si cambia a efectivo, limpiamos la foto
        if (type !== 'online') {
            setReceiptFile(null);
            setReceiptPreview(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        }
    };

    const handleRutChange = (e) => {
        const rawValue = e.target.value;
        const formatted = formatRut(rawValue);
        setManualOrder(prev => ({ ...prev, client_rut: formatted }));

        setRutValid(validateRut(formatted));
    };

    const handlePhoneChange = (e) => {
        let input = e.target.value;
        if (!input.startsWith("+56 9")) {
            if (input.length < 6) input = "+56 9 ";
        }
        const cleaned = input;
        setManualOrder(prev => ({ ...prev, client_phone: cleaned }));

        const digitCount = cleaned.replace(/\D/g, '').length;
        setPhoneValid(digitCount >= 11);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const { valid, error: validationError } = validateImageFile(file);
            if (!valid) {
                showNotify(validationError || 'Archivo no válido', 'error');
                e.target.value = '';
                return;
            }
            if (receiptPreview) URL.revokeObjectURL(receiptPreview);
            setReceiptFile(file);
            setReceiptPreview(URL.createObjectURL(file));
        }
    };

    const removeReceipt = () => {
        setReceiptFile(null);
        setReceiptPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    };

    // --- LÓGICA DEL CARRITO ---
    const addItem = useCallback((product) => {
        setManualOrder(prev => {
            const currentItems = prev.items || [];
            const exists = currentItems.find(i => i.id === product.id);
            let newItems;

            if (exists) {
                if (exists.quantity >= 20) return prev;
                newItems = currentItems.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            } else {
                newItems = [...currentItems, {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    has_discount: product.has_discount,
                    discount_price: product.discount_price,
                    image_url: product.image_url,
                    description: product.description,
                    quantity: 1,
                    manual_order_source: product.manual_order_source || null,
                    is_extra: product.manual_order_source === 'extras'
                }];
            }
            // Recalcular total
            const newTotal = Math.round(newItems.reduce((acc, i) => acc + (getPrice(i) * i.quantity), 0));
            const newState = { ...prev, items: newItems, total: newTotal };
            return newState;
        });
    }, [getPrice]);

    const updateQuantity = useCallback((itemId, change) => {
        setManualOrder(prev => {
            const item = prev.items.find(i => i.id === itemId);
            if (!item) return prev;

            if (change > 0 && item.quantity >= 20) return prev;

            let newItems;
            if (item.quantity + change < 1) {
                // Opción: No bajar de 1 (usar botón eliminar para eso)
                newItems = prev.items.map(i => i.id === itemId ? { ...i, quantity: 1 } : i);
            } else {
                newItems = prev.items.map(i => i.id === itemId ? { ...i, quantity: i.quantity + change } : i);
            }

            const newTotal = Math.round(newItems.reduce((acc, i) => acc + (getPrice(i) * i.quantity), 0));
            return { ...prev, items: newItems, total: newTotal };
        });
    }, [getPrice]);

    const removeItem = useCallback((itemId) => {
        setManualOrder(prev => {
            const newItems = prev.items.filter(i => i.id !== itemId);
            const newTotal = Math.round(newItems.reduce((acc, i) => acc + (getPrice(i) * i.quantity), 0));
            return { ...prev, items: newItems, total: newTotal };
        });
    }, [getPrice]);

    const resetOrder = useCallback(() => {
        setManualOrder({ ...initialOrderState });
        setCouponPreview({ loading: false, discount: 0, message: '', variant: 'neutral' });
        setReceiptFile(null);
        setReceiptPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setRutValid(true);
        setPhoneValid(true);
    }, []);

    useEffect(() => {
        if (!branch?.company_id) {
            setCouponPreview((p) =>
                (p.variant === 'neutral' && p.discount === 0 && !p.message && !p.loading)
                    ? p
                    : { loading: false, discount: 0, message: '', variant: 'neutral' },
            );
            return undefined;
        }
        const rawCode = String(manualOrder.coupon_code ?? '').trim();
        if (!rawCode) {
            setCouponPreview({ loading: false, discount: 0, message: '', variant: 'neutral' });
            return undefined;
        }
        let cancelled = false;
        const subtotalPreview = manualOrder.total;
        setCouponPreview({ loading: true, discount: 0, message: '', variant: 'neutral' });
        const tid = setTimeout(async () => {
            try {
                const pv = await buildCouponPreview({
                    supabase,
                    companyId: String(branch.company_id),
                    rawCode,
                    itemsSubtotal: subtotalPreview,
                    clientPhone: String(manualOrder.client_phone ?? '').trim(),
                    tablesCoupons: TABLES.discount_coupons,
                    tablesClients: TABLES.clients,
                    tablesRedemptions: TABLES.discount_coupon_redemptions,
                });
                if (cancelled) return;
                if (!pv.ok) {
                    setCouponPreview({
                        loading: false,
                        discount: 0,
                        message: PREVIEW_ERR_MSG[pv.key] || 'No se pudo validar el cupón.',
                        variant: 'error',
                    });
                    return;
                }
                setCouponPreview({
                    loading: false,
                    discount: pv.discount,
                    message: pv.discount > 0 ? 'Cupón válido (estimado; confirma al crear el pedido).' : '',
                    variant: pv.discount > 0 ? 'success' : 'neutral',
                });
            } catch {
                if (!cancelled) {
                    setCouponPreview({
                        loading: false,
                        discount: 0,
                        message: 'No se pudo validar el cupón.',
                        variant: 'error',
                    });
                }
            }
        }, 420);
        return () => {
            cancelled = true;
            clearTimeout(tid);
        };
    }, [
        branch?.company_id,
        manualOrder.coupon_code,
        manualOrder.total,
        manualOrder.client_phone,
    ]);

    // --- ENVÍO ---
    const submitOrder = async () => {
        if (!branch) {
            showNotify('Error: No hay sucursal seleccionada', 'error');
            return;
        }

        const sanitizeInput = (text) => text ? text.replace(/<[^>]*>?/gm, "").trim() : "";

        const digitCount = (manualOrder.client_phone || '').replace(/\D/g, '').length;
        if (!manualOrder.client_name || manualOrder.client_name.trim().length < 3 || digitCount < 11 || manualOrder.items.length === 0) {
            showNotify('Faltan datos obligatorios o son incorrectos', 'error');
            return;
        }

        if (manualOrder.order_type === 'delivery' && (!manualOrder.delivery_address || manualOrder.delivery_address.trim().length < 5)) {
            showNotify('La dirección de despacho es obligatoria para Delivery', 'error');
            return;
        }
        if (!manualOrder.client_rut || !validateRut(manualOrder.client_rut)) {
            showNotify('El RUT ingresado no es válido', 'error');
            return;
        }

        setLoading(true);
        try {
            const sanitizedOrder = {
                ...manualOrder,
                client_name: sanitizeInput(manualOrder.client_name),
                client_phone: sanitizeInput(manualOrder.client_phone),
                client_rut: sanitizeInput(manualOrder.client_rut),
                note: sanitizeInput(manualOrder.note),
                branch_id: branch.id,
                company_id: branch.company_id,
                branch_name: branch.name,
                order_type: manualOrder.order_type,
                delivery_address: manualOrder.order_type === 'delivery' ? sanitizeInput(manualOrder.delivery_address) : null,
                manual_delivery_fee: manualOrder.order_type === 'delivery' ? manualOrder.delivery_fee : 0,
                coupon_code: sanitizeInput(manualOrder.coupon_code) || '',
            };

            const itemsForOrder = (sanitizedOrder.items || []).map((item) => ({
                id: item.id,
                name: String(item.name ?? ''),
                quantity: Number(item.quantity) || 1,
                price: Number(item.price) || 0,
                has_discount: Boolean(item.has_discount),
                discount_price: item.has_discount && item.discount_price != null ? Number(item.discount_price) : null,
                description: item.description ? String(item.description) : null,
                manual_order_source: item.manual_order_source || null,
                is_extra: Boolean(item.is_extra)
            }));

            const totalForOrder = itemsForOrder.reduce((acc, i) => {
                const unit = i.has_discount && i.discount_price && Number(i.discount_price) > 0 ? Number(i.discount_price) : Number(i.price);
                return acc + (unit * i.quantity);
            }, 0);

            sanitizedOrder.items = itemsForOrder;
            sanitizedOrder.total = totalForOrder;

            // Aquí llamamos a tu servicio existente
            await createManualOrder(sanitizedOrder, receiptFile);

			// Comentario: la venta en caja se registra al pasar a cocina
			// (moveOrder -> active), no al crear el pedido manual.

            showNotify('Pedido creado con éxito', 'success');
            resetOrder();
            if (onOrderSaved) onOrderSaved();
            if (onClose) onClose();

        } catch (error) {
            showNotify(error.message || 'Error al crear pedido', 'error');
        } finally {
            setLoading(false);
        }
    };

    const isValid = useMemo(() => {
        return manualOrder.client_name && manualOrder.items.length > 0;
    }, [manualOrder]);

    const getInputStyle = (isValid) => {
        if (isValid === true) return { borderColor: '#25d366', boxShadow: '0 0 0 1px #25d366' };
        if (isValid === false) return { borderColor: '#ff4444', boxShadow: '0 0 0 1px #ff4444' };
        return {};
    };

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
        updatePaymentType,
        handleRutChange,
        handlePhoneChange,
        handleFileChange,
        removeReceipt,
        addItem,
        updateQuantity,
        removeItem,
        updateOrderType,
        updateDeliveryAddress,
        updateDeliveryFee,
        submitOrder,
        resetOrder,
        isValid,
        getInputStyle
    };
};