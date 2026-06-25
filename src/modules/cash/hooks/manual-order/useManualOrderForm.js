import { useState, useCallback, useMemo } from 'react';
import { formatRut, validateRut } from '@/shared/utils/formatters';
import { firstEnabledLocalChannel, parseLocalOrderChannels } from '@/lib/delivery-settings';
import {
    normalizeManualPhone,
    fetchClientAddresses,
} from '../../services/clientService';
import {
    MANUAL_ORDER_INITIAL_FORM_STATE,
    mergeAddressIntoForm,
    OPEN_MESA_CAJA_DEFAULTS,
    applyLocalFulfillmentMode,
    applyMesaPartyMode,
} from './manualOrderShared';

const initialFormState = MANUAL_ORDER_INITIAL_FORM_STATE;

/**
 * Hook especializado en gestionar todos los estados del formulario del pedido manual:
 * nombre del cliente, RUT (formateo y validación), teléfono, notas del pedido, tipo de despacho,
 * dirección de entrega, kilómetros, tarifas y comprobantes de pago.
 */
export const useManualOrderForm = (enabledLocalChannels = null) => {
    const resolvedChannels = useMemo(
        () => parseLocalOrderChannels(enabledLocalChannels),
        [
            enabledLocalChannels?.mesa,
            enabledLocalChannels?.retiro,
            enabledLocalChannels?.delivery,
        ],
    );
    const [form, setForm] = useState(() => ({ ...initialFormState }));
    const [rutValid, setRutValid] = useState(true);
    const [phoneValid, setPhoneValid] = useState(true);

    const applySavedAddress = useCallback((addressRow, branchDeliveryCfg, subtotal = 0) => {
        if (!addressRow || typeof addressRow !== 'object') return;
        setForm((prev) => mergeAddressIntoForm(prev, addressRow, branchDeliveryCfg, subtotal));
    }, []);

    const updateClientName = useCallback((val, opts = {}) => {
        setForm((prev) => {
            const next = { ...prev, client_name: val };
            if (!opts.fromClientSelect && prev.selected_client_id) {
                next.selected_client_id = '';
                next.saved_addresses = [];
                next.selected_address_id = '';
            }
            return next;
        });
    }, []);

    const updateCouponCode = useCallback((val) => {
        setForm(prev => ({ ...prev, coupon_code: typeof val === 'string' ? val : '' }));
    }, []);

    const updateNote = useCallback((val) => {
        setForm(prev => ({ ...prev, note: val }));
    }, []);

    const updateOrderType = useCallback((val, branchDeliveryCfg = null, subtotal = 0) => {
        setForm((prev) => {
            if (val === 'pickup') {
                return {
                    ...prev,
                    order_type: val,
                    delivery_named_area_id: '',
                    delivery_fee: 0,
                    delivery_address: '',
                    delivery_reference: '',
                    delivery_km: '',
                    selected_address_id: '',
                };
            }

            const next = { ...prev, order_type: val };
            if (
                val === 'delivery' &&
                Array.isArray(prev.saved_addresses) &&
                prev.saved_addresses.length > 0 &&
                !prev.delivery_address &&
                !prev.delivery_reference &&
                !prev.delivery_named_area_id
            ) {
                return mergeAddressIntoForm(
                    next,
                    prev.saved_addresses[0],
                    branchDeliveryCfg,
                    subtotal,
                );
            }
            return next;
        });
    }, []);

    const updateLocalFulfillmentMode = useCallback((mode, branchDeliveryCfg = null, subtotal = 0) => {
        setForm((prev) => applyLocalFulfillmentMode(prev, mode, branchDeliveryCfg, subtotal));
    }, []);

    const updateMesaPartyMode = useCallback((mode) => {
        setForm((prev) => applyMesaPartyMode(prev, mode));
    }, []);

    const updateDeliveryAddress = useCallback((val) => {
        setForm(prev => ({ ...prev, delivery_address: val, selected_address_id: '' }));
    }, []);

    const updateDeliveryReference = useCallback((val) => {
        setForm((prev) => ({
            ...prev,
            delivery_reference: typeof val === 'string' ? val : '',
            selected_address_id: '',
        }));
    }, []);

    const updateDeliveryKm = useCallback((val) => {
        setForm((prev) => ({
            ...prev,
            delivery_km: val === '' || val == null ? '' : String(val),
            selected_address_id: '',
        }));
    }, []);

    const updateDeliveryFee = useCallback((val) => {
        setForm(prev => ({ ...prev, delivery_fee: Number(val) || 0 }));
    }, []);

    const updateDeliveryNamedAreaId = useCallback((val) => {
        setForm((prev) => ({
            ...prev,
            delivery_named_area_id: typeof val === 'string' ? val : '',
            selected_address_id: '',
        }));
    }, []);

    const updatePaymentType = useCallback((type) => {
        setForm(prev => ({
            ...prev,
            payment_type: type,
            payment_mode: 'single',
            cash_amount: 0,
            card_amount: 0,
            cash_tendered: '',
        }));
    }, []);

    const updatePaymentMode = useCallback((mode) => {
        setForm(prev => ({
            ...prev,
            payment_mode: mode === 'mixed' ? 'mixed' : 'single',
            cash_amount: mode === 'mixed' ? prev.cash_amount : 0,
            card_amount: mode === 'mixed' ? prev.card_amount : 0,
            cash_tendered: '',
            ...(mode === 'mixed' ? { payment_type: 'tienda' } : {}),
        }));
    }, []);

    const updateCashAmount = useCallback((val) => {
        const parsed = val === '' || val == null ? 0 : Math.max(0, Math.round(Number(String(val).replace(/\D/g, '')) || 0));
        setForm(prev => ({ ...prev, cash_amount: parsed, cash_tendered: '' }));
    }, []);

    const updateCardAmount = useCallback((val) => {
        const parsed = val === '' || val == null ? 0 : Math.max(0, Math.round(Number(String(val).replace(/\D/g, '')) || 0));
        setForm(prev => ({ ...prev, card_amount: parsed }));
    }, []);

    const updateCashTendered = useCallback((val) => {
        if (val === '' || val == null) {
            setForm(prev => ({ ...prev, cash_tendered: '' }));
            return;
        }
        const parsed = Math.max(0, Math.round(Number(String(val).replace(/\D/g, '')) || 0));
        setForm(prev => ({ ...prev, cash_tendered: parsed }));
    }, []);

    const updateChargeNow = useCallback((enabled) => {
        setForm((prev) => ({
            ...prev,
            charge_now: Boolean(enabled),
            payment_type: enabled
                ? (prev.payment_type === 'pendiente' ? 'tienda' : prev.payment_type)
                : 'pendiente',
            payment_mode: 'single',
            cash_amount: 0,
            card_amount: 0,
            cash_tendered: '',
        }));
    }, []);

    const handleRutChange = useCallback((e) => {
        const rawValue = e.target.value;
        const formatted = formatRut(rawValue);
        setForm(prev => ({ ...prev, client_rut: formatted }));
        setRutValid(validateRut(formatted));
    }, []);

    const handlePhoneChange = useCallback((e) => {
        let input = e.target.value;
        if (!input.startsWith("+56 9")) {
            if (input.length < 6) input = "+56 9 ";
        }
        const cleaned = input;
        setForm((prev) => ({
            ...prev,
            client_phone: cleaned,
            ...(prev.selected_client_id ? {
                selected_client_id: '',
                saved_addresses: [],
                selected_address_id: '',
            } : {}),
        }));

        const digitCount = cleaned.replace(/\D/g, '').length;
        setPhoneValid(digitCount >= 11);
    }, []);

    const applyClientRecord = useCallback(async (client, opts = {}) => {
        if (!client || typeof client !== 'object') return;

        const { branchDeliveryCfg = null, subtotal = 0 } = opts;
        const name = String(client.name ?? '').trim();
        const rutRaw = String(client.rut ?? client.document ?? '').trim();
        const rut = rutRaw ? formatRut(rutRaw) : '';
        const phone = normalizeManualPhone(client.phone) || '+56 9 ';
        const clientId = client.id != null ? String(client.id) : '';

        let savedAddresses = [];
        if (clientId) {
            try {
                savedAddresses = await fetchClientAddresses(clientId);
            } catch {
                savedAddresses = [];
            }
        }

        setForm((prev) => {
            let next = {
                ...prev,
                client_name: name || prev.client_name,
                client_rut: rut || prev.client_rut,
                client_phone: phone || prev.client_phone,
                selected_client_id: clientId,
                saved_addresses: savedAddresses,
                selected_address_id: '',
            };

            if (prev.order_type === 'delivery' && savedAddresses.length > 0) {
                next = mergeAddressIntoForm(
                    next,
                    savedAddresses[0],
                    branchDeliveryCfg,
                    subtotal,
                );
            }

            return next;
        });

        setRutValid(rut ? validateRut(rut) : false);
        const digitCount = phone.replace(/\D/g, '').length;
        setPhoneValid(digitCount >= 11);
    }, []);

    const resetForm = useCallback(() => {
        setForm({ ...initialFormState });
        setRutValid(true);
        setPhoneValid(true);
    }, []);

    const resetOpenMesaForm = useCallback(() => {
        const defaultMode = firstEnabledLocalChannel(resolvedChannels);
        setForm({
            ...initialFormState,
            client_name: '',
            client_rut: OPEN_MESA_CAJA_DEFAULTS.client_rut,
            client_phone: OPEN_MESA_CAJA_DEFAULTS.client_phone,
            order_type: defaultMode === 'delivery' ? 'delivery' : 'pickup',
            local_fulfillment_mode: defaultMode,
            mesa_party_mode: defaultMode === 'mesa' ? 'mesero' : 'cliente',
            payment_type: 'pendiente',
            charge_now: false,
        });
        setRutValid(true);
        setPhoneValid(true);
    }, [resolvedChannels]);

    const getInputStyle = useCallback((isValid) => {
        if (isValid === true) return { borderColor: '#4f5bff', boxShadow: '0 0 0 1px #4f5bff' };
        if (isValid === false) return { borderColor: '#c31d2d', boxShadow: '0 0 0 1px #c31d2d' };
        return {};
    }, []);

    return {
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
    };
};
