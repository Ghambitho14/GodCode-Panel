import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Store, Truck, MapPin, User, CheckCircle2, Loader2, Banknote } from 'lucide-react';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { geocodeAddress } from '../../services/geocodeService';
import { geocodeToCoords } from '../../services/placesService';
import { haversineKm, isValidLatLng } from '@/lib/geo';
import {
    computeDeliveryFee,
    effectiveDeliveryPricingMode,
} from '@/lib/delivery-settings';
import { formatSavedAddressLabel, normalizePhoneForSearch } from '../../services/clientService';
import {
    getLocalFulfillmentMode,
    isOpenMesaMeseroMode,
    LOCAL_FULFILLMENT_MODES,
} from '../../hooks/manual-order/manualOrderShared';
import TableRestaurantIcon from '../TableRestaurantIcon';
import DeliveryMotoIcon from '../DeliveryMotoIcon';
import PickupBagIcon from '../PickupBagIcon';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { selectedToggleActiveClass, spacing, textScale } from './manualOrderStyles';
import SectionHeader from './SectionHeader';
import { requirementsFor } from '../../domain/manual-order-settings';
import { majorToMinor, minorToMajor } from '@/lib/money/minor-units';

const sectionCardClass = 'manual-order-step-card rounded-[18px] border border-gc-border bg-gc-card p-4 shadow-sm sm:p-5';
const inputClass =
    `w-full rounded-[12px] border border-gc-border bg-gc-page px-3.5 py-3 ${textScale.body} text-gc-text placeholder:text-gc-text-muted focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/15`;
const inputReadonlyClass =
    'cursor-not-allowed border-gc-border/50 bg-gc-muted/60 text-gc-text-muted focus:ring-0';
const toggleBaseClass =
    `flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-gc-border bg-gc-page px-2.5 py-3 ${textScale.body} font-semibold text-gc-text transition-colors sm:px-3`;
const hintClass =
    `mt-3 rounded-[12px] border border-gc-accent/20 bg-gc-accent/10 px-3 py-2.5 ${textScale.body} leading-relaxed text-gc-text-muted`;
const inlineActionClass =
    `inline-flex min-h-[42px] items-center gap-1.5 self-start rounded-[12px] border border-gc-border bg-gc-card px-3.5 py-2 ${textScale.body} font-semibold text-gc-text transition-colors hover:border-gc-accent/30 disabled:cursor-not-allowed disabled:opacity-50`;
const fieldLabelClass = `flex flex-col ${spacing.compact} ${textScale.micro} font-semibold text-gc-text-muted`;

const fulfillmentActiveClass = {
    mesa: 'border-[var(--fulfillment-mesa-border)] bg-[var(--fulfillment-mesa-bg)] text-[var(--fulfillment-mesa-fg)]',
    retiro: 'border-[var(--fulfillment-retiro-border)] bg-[var(--fulfillment-retiro-bg)] text-[var(--fulfillment-retiro-fg)]',
    delivery: 'border-[var(--fulfillment-delivery-border)] bg-[var(--fulfillment-delivery-bg)] text-[var(--fulfillment-delivery-fg)]',
};

const sanitizeInputLive = (text) => {
    if (text == null || text === '') return '';
    return text.replace(/[<>]/g, '');
};

const normalizeSearch = (value) => String(value ?? '').trim().toLowerCase();

const filterClientsByNameOrPhone = (clients, query) => {
    const q = normalizeSearch(query);
    const qDigits = normalizePhoneForSearch(query);
    if (!q || !Array.isArray(clients)) return [];
    return clients
        .filter((c) => {
            const name = normalizeSearch(c?.name);
            const phoneDigits = normalizePhoneForSearch(c?.phone);
            return name.startsWith(q) || (qDigits.length >= 3 && phoneDigits.startsWith(qDigits));
        })
        .slice(0, 8);
};

/**
 * Paso Cliente: dos columnas (datos cliente | retiro/delivery).
 */
const ClientForm = ({
    manualOrder,
    branchDeliveryCfg,
    clients = [],
    updateOrderType,
    updateLocalFulfillmentMode,
    updateMesaPartyMode,
    updateDeliveryAddress,
    updateDeliveryReference,
    updateDeliveryKm,
    updateDeliveryFee,
    updateDeliveryNamedAreaId,
    updateClientName,
    applyClientRecord,
    applySavedAddress,
    handleRutChange,
    handlePhoneChange,
    rutValid,
    phoneValid,
    getInputStyle,
    branch,
    showNotify,
    canOverrideDeliveryFee = false,
    openMesaMode = false,
    branchDeliveryCfgLoading = false,
    enabledLocalChannels = null,
    isEditMode = false,
}) => {
    const { formatMoney } = useBranchMoney();
    const { companyProfile } = useAdmin();
    const formStrategy = useMemo(() => {
        const country = resolveEffectiveCountry(branch, companyProfile);
        return getFormStrategy(country);
    }, [branch, companyProfile]);
    const [detectingZone, setDetectingZone] = useState(false);
    const [calculatingDistance, setCalculatingDistance] = useState(false);
    const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
	const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const clientSearchRef = useRef(null);

    const isPickup = manualOrder.order_type !== 'delivery';
    const isDelivery = manualOrder.order_type === 'delivery';

    const clientSuggestions = useMemo(
        () => filterClientsByNameOrPhone(clients, manualOrder.client_name),
        [clients, manualOrder.client_name],
    );

    const savedAddresses = Array.isArray(manualOrder.saved_addresses)
        ? manualOrder.saved_addresses
        : [];

    const clientSelectOpts = useMemo(
        () => ({
            branchDeliveryCfg,
            subtotal: Number(manualOrder.total) || 0,
        }),
        [branchDeliveryCfg, manualOrder.total],
    );

    const showClientSuggestions =
        clientSuggestionsOpen &&
        clientSuggestions.length > 0 &&
        normalizeSearch(manualOrder.client_name).length >= 1;

    useEffect(() => {
        const onDocClick = (e) => {
            if (!clientSearchRef.current?.contains(e.target)) {
                setClientSuggestionsOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

	const settingsFulfillments = manualOrder.manualOrderSettings?.enabledFulfillments ?? { table: true, pickup: true, delivery: true };
    const resolvedLocalChannels = useMemo(
		() => {
			const channels = enabledLocalChannels ?? { mesa: true, retiro: true, delivery: true };
			return {
				mesa: channels.mesa !== false && settingsFulfillments.table !== false,
				retiro: channels.retiro !== false && settingsFulfillments.pickup !== false,
				delivery: channels.delivery !== false && settingsFulfillments.delivery !== false,
			};
		},
		[
            enabledLocalChannels?.mesa,
            enabledLocalChannels?.retiro,
            enabledLocalChannels?.delivery,
			settingsFulfillments.table,
			settingsFulfillments.pickup,
			settingsFulfillments.delivery,
        ],
    );
    const openMesaFulfillmentMode = openMesaMode ? getLocalFulfillmentMode(manualOrder) : null;
	const contextualFulfillment = isDelivery ? 'delivery' : openMesaFulfillmentMode === 'mesa' ? 'table' : 'pickup';
	const customerRequirements = requirementsFor(manualOrder.manualOrderSettings, contextualFulfillment);
	const requiredMark = (required) => required
		? <span className="text-gc-danger"> *</span>
		: <span className="font-normal text-gc-text-muted"> (opcional)</span>;

    const showNamedZonePicker = Boolean(
        branchDeliveryCfg &&
        isDelivery &&
        effectiveDeliveryPricingMode(branchDeliveryCfg) === 'named' &&
        (branchDeliveryCfg.namedAreas?.length ?? 0) > 0,
    );

    const namedAreaAutoMode = showNamedZonePicker &&
        String(branchDeliveryCfg?.namedAreaResolution ?? '').toLowerCase() === 'address_matched';

    const showDistancePricing = Boolean(
        branchDeliveryCfg &&
        isDelivery &&
        effectiveDeliveryPricingMode(branchDeliveryCfg) === 'distance',
    );

    const distanceAutoMode = showDistancePricing &&
        isValidLatLng(branchDeliveryCfg?.originLat, branchDeliveryCfg?.originLng);

    const handleDetectZone = async () => {
        if (detectingZone) return;
        const branchId = String(branch?.id ?? '').trim();
        const address = String(manualOrder.delivery_address ?? '').trim();
        if (!branchId) {
            showNotify?.('Selecciona una sucursal primero.', 'warning');
            return;
        }
        if (!address) {
            showNotify?.('Escribe una dirección para detectar la zona.', 'warning');
            return;
        }
        setDetectingZone(true);
        try {
            const result = await geocodeAddress({ branchId, address });
            if (result.ok) {
                updateDeliveryNamedAreaId(result.namedAreaId);
                showNotify?.(`Zona detectada: ${result.label}`, 'success');
            } else {
                showNotify?.(result.message, 'warning');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al detectar la zona';
            showNotify?.(msg, 'error');
        } finally {
            setDetectingZone(false);
        }
    };

    const handleCalculateDistance = async () => {
        if (calculatingDistance) return;
        const address = String(manualOrder.delivery_address ?? '').trim();
        if (!address) {
            showNotify?.('Escribe una dirección para calcular la distancia.', 'warning');
            return;
        }
        if (!isValidLatLng(branchDeliveryCfg?.originLat, branchDeliveryCfg?.originLng)) {
            showNotify?.(
                'Configura la ubicación del local en Settings para autocalcular distancia.',
                'warning',
            );
            return;
        }
        setCalculatingDistance(true);
        try {
            const result = await geocodeToCoords({ address });
            if (!result.ok) {
                showNotify?.(result.message, 'warning');
                return;
            }
            const km = haversineKm(
                { lat: Number(branchDeliveryCfg.originLat), lng: Number(branchDeliveryCfg.originLng) },
                { lat: result.lat, lng: result.lng },
            );
            const safeKm = Number.isFinite(km) && km >= 0 ? km : 0;
            updateDeliveryKm(safeKm.toFixed(2));
            showNotify?.(
                `Distancia calculada: ${safeKm.toFixed(2)} km (${result.label})`,
                'success',
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al calcular la distancia';
            showNotify?.(msg, 'error');
        } finally {
            setCalculatingDistance(false);
        }
    };

    const handleSelectClient = (client) => {
        applyClientRecord?.(client, clientSelectOpts);
        setClientSuggestionsOpen(false);
		setActiveSuggestionIndex(-1);
    };

    const handleClientNameChange = (value) => {
        updateClientName(sanitizeInputLive(value), { fromClientSelect: false });
        setClientSuggestionsOpen(true);
		setActiveSuggestionIndex(-1);
    };

	const handleClientComboboxKeyDown = (event) => {
		if (!showClientSuggestions && event.key === 'ArrowDown') setClientSuggestionsOpen(true);
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActiveSuggestionIndex((index) => Math.min(clientSuggestions.length - 1, index + 1));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActiveSuggestionIndex((index) => Math.max(0, index - 1));
		} else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
			event.preventDefault();
			handleSelectClient(clientSuggestions[activeSuggestionIndex]);
		} else if (event.key === 'Escape') {
			setClientSuggestionsOpen(false);
			setActiveSuggestionIndex(-1);
		}
	};

    const handleSavedAddressChange = (e) => {
        const addressId = e.target.value;
        if (!addressId) {
            updateDeliveryAddress('');
            updateDeliveryReference('');
            updateDeliveryKm('');
            updateDeliveryNamedAreaId('');
            return;
        }
        const row = savedAddresses.find((a) => String(a.id) === addressId);
        if (row) {
            applySavedAddress?.(row, branchDeliveryCfg, Number(manualOrder.total) || 0);
        }
    };

    const handleOrderTypeChange = (type) => {
        updateOrderType(type, branchDeliveryCfg, Number(manualOrder.total) || 0);
    };

	useEffect(() => {
		if (openMesaMode) {
			const current = getLocalFulfillmentMode(manualOrder);
			if (resolvedLocalChannels[current]) return;
			const fallback = ['mesa', 'retiro', 'delivery'].find((mode) => resolvedLocalChannels[mode]);
			if (fallback) updateLocalFulfillmentMode?.(fallback);
			return;
		}
		if (isDelivery && settingsFulfillments.delivery === false && settingsFulfillments.pickup !== false) handleOrderTypeChange('pickup');
		if (!isDelivery && settingsFulfillments.pickup === false && settingsFulfillments.delivery !== false) handleOrderTypeChange('delivery');
	}, [openMesaMode, manualOrder.local_fulfillment_mode, isDelivery, resolvedLocalChannels, settingsFulfillments.pickup, settingsFulfillments.delivery]);

    const validationIcon = (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 size={18} className="text-gc-accent" aria-hidden />
        </div>
    );

    const clientSuggestionsList = (suggestionsId) => showClientSuggestions ? (
        <ul
            id={suggestionsId}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-[4px] border border-gc-border bg-gc-card py-1 shadow-lg"
            role="listbox"
        >
            {clientSuggestions.map((client, index) => (
                <li key={client.id} id={`${suggestionsId}-option-${index}`} role="option" aria-selected={index === activeSuggestionIndex}>
                    <Button variant="outline"
                        type="button"
                        className={cn('flex min-h-[44px] w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-gc-muted focus-visible:bg-gc-muted focus-visible:outline-none', index === activeSuggestionIndex && 'bg-gc-muted')}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectClient(client)}
                    >
                        <span className={`${textScale.body} font-bold text-gc-text`}>
                            {client.name}
                        </span>
                        <span className={`${textScale.micro} text-gc-text-muted`}>
                            {[client.rut, client.phone].filter(Boolean).join(' · ')}
                        </span>
                    </Button>
                </li>
            ))}
        </ul>
    ) : null;

    const registeredClientSearchField = (placeholder, suggestionsId = 'manual-order-client-suggestions') => (
        <div className="grid gap-3">
            <div className="relative w-full" ref={clientSearchRef}>
                <input
                    type="text"
                    placeholder={placeholder}
                    className={inputClass}
                    value={manualOrder.client_name}
                    onChange={(e) => handleClientNameChange(e.target.value)}
                    onFocus={() => setClientSuggestionsOpen(true)}
					onKeyDown={handleClientComboboxKeyDown}
                    autoComplete="off"
					role="combobox"
					aria-autocomplete="list"
                    aria-label="Buscar cliente registrado"
                    aria-expanded={showClientSuggestions}
                    aria-controls={suggestionsId}
					aria-activedescendant={activeSuggestionIndex >= 0 ? `${suggestionsId}-option-${activeSuggestionIndex}` : undefined}
                    style={{
                        paddingRight:
                            manualOrder.selected_client_id || manualOrder.client_name.length >= 3
                                ? '40px'
                                : undefined,
                    }}
                />
                {(manualOrder.selected_client_id || manualOrder.client_name.length >= 3) && validationIcon}
                {clientSuggestionsList(suggestionsId)}
            </div>
        </div>
    );

    const openMesaContactFields = ({
        namePlaceholder,
        suggestionsId = 'manual-order-open-mesa-client-suggestions',
        lockIdentityFields = false,
        allowClientSearch = true,
    }) => (
        <div className="mt-3 grid gap-3">
            {allowClientSearch ? (
                registeredClientSearchField(namePlaceholder, suggestionsId)
            ) : (
                <div className="relative w-full">
                    <input
                        type="text"
                        placeholder={namePlaceholder}
                        className={inputClass}
                        value={manualOrder.client_name}
                        onChange={(e) => handleClientNameChange(e.target.value)}
                        autoComplete="off"
                        aria-label={namePlaceholder}
                    />
                </div>
            )}

            <div className="relative w-full">
                <input
                    type="text"
                    placeholder={`${formStrategy.idName}${customerRequirements.document ? ' *' : ' (opcional)'}`}
                    className={cn(inputClass, lockIdentityFields && inputReadonlyClass)}
                    value={manualOrder.client_rut}
                    onChange={handleRutChange}
                    readOnly={lockIdentityFields}
                    aria-readonly={lockIdentityFields}
                    style={{
                        ...(lockIdentityFields ? {} : getInputStyle(rutValid)),
                        paddingRight: !lockIdentityFields && rutValid ? '40px' : undefined,
                    }}
                />
                {!lockIdentityFields && rutValid ? validationIcon : null}
            </div>

            <div className="relative w-full">
                <input
                    type="tel"
                    placeholder={`${formStrategy.phonePrefix}…${customerRequirements.phone ? ' *' : ''}`}
                    className={cn(inputClass, lockIdentityFields && inputReadonlyClass)}
                    value={manualOrder.client_phone}
                    onChange={handlePhoneChange}
                    readOnly={lockIdentityFields}
                    aria-readonly={lockIdentityFields}
                    style={{
                        ...(lockIdentityFields ? {} : getInputStyle(phoneValid)),
                        paddingRight: !lockIdentityFields && phoneValid ? '40px' : undefined,
                    }}
                />
                {!lockIdentityFields && phoneValid ? validationIcon : null}
            </div>

            {lockIdentityFields ? (
                <p className={hintClass}>
                    La referencia del mesero se guarda separada; no se inventan datos personales del cliente.
                </p>
            ) : null}
        </div>
    );

    const inputWithIcon = (icon, children, muted = false) => (
        <div className="relative w-full">
            <span className={cn(
                'pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-gc-text-muted',
                muted && 'opacity-70',
            )}>
                {icon}
            </span>
            {children}
        </div>
    );

    const deliveryFields = isDelivery ? (
        <div className={`mt-3 flex flex-col ${spacing.normal}`}>
            {savedAddresses.length > 0 ? (
                inputWithIcon(
                    <MapPin size={14} aria-hidden />,
                    <select
                        id="manual-order-saved-address"
                        aria-label="Dirección guardada del cliente"
                        className={cn(inputClass, 'pl-10 font-semibold')}
                        value={manualOrder.selected_address_id || ''}
                        onChange={handleSavedAddressChange}
                    >
                        <option value="">NUEVA DIRECCIÓN</option>
                        {savedAddresses.map((addr) => (
                            <option key={String(addr.id)} value={String(addr.id)}>
                                {formatSavedAddressLabel(addr)}
                            </option>
                        ))}
                    </select>,
                )
            ) : null}

            {namedAreaAutoMode ? (
                <>
                    {inputWithIcon(
                        <MapPin size={14} aria-hidden />,
                        <input
                            type="text"
                            placeholder="DIRECCIÓN DE ENTREGA *"
                            className={cn(inputClass, 'pl-10 font-semibold')}
                            value={manualOrder.delivery_address}
                            onChange={(e) => updateDeliveryAddress(e.target.value)}
                        />,
                    )}
                    <Button variant="default"
                        type="button"
                        className={inlineActionClass}
                        onClick={handleDetectZone}
                        disabled={detectingZone || !manualOrder.delivery_address}
                    >
                        {detectingZone ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Detectando...
                            </>
                        ) : (
                            <>
                                <MapPin size={14} />
                                Detectar zona
                            </>
                        )}
                    </Button>
                </>
            ) : null}

            {showNamedZonePicker ? (
                inputWithIcon(
                    <MapPin size={14} aria-hidden />,
                    <select
                        id="manual-order-delivery-zone"
                        aria-label="Zona de entrega"
                        className={cn(inputClass, 'pl-10 font-semibold')}
                        value={manualOrder.delivery_named_area_id || ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            updateDeliveryNamedAreaId(v);
                            if (v && branchDeliveryCfg) {
                                const subtotal = Number(manualOrder.total) || 0;
                                const r = computeDeliveryFee(branchDeliveryCfg, 0, subtotal, { namedAreaId: v });
                                if (r.fee >= 0) {
									const currency = manualOrder.currency || 'CLP';
									updateDeliveryFee(String(minorToMajor(majorToMinor(r.fee, currency, manualOrder.fractionDigits), currency, manualOrder.fractionDigits)));
                                }
                            }
                        }}
                    >
                        <option value="">{namedAreaAutoMode ? 'ZONA DETECTADA / SELECCIÓN MANUAL' : 'ZONA DE ENTREGA *'}</option>
                        {(branchDeliveryCfg?.namedAreas ?? []).map((z) => (
                            <option key={z.id} value={z.id}>
                                {z.name} — {formatMoney(z.feeFlat)}
                            </option>
                        ))}
                    </select>,
                )
            ) : null}

            {showNamedZonePicker ? (
                inputWithIcon(
                    <MapPin size={14} className="opacity-70" aria-hidden />,
                    <input
                        type="text"
                        placeholder="REFERENCIA: CALLE, NÚMERO U OBSERVACIÓN (OPC.)"
                        className={cn(inputClass, 'pl-10')}
                        value={manualOrder.delivery_reference}
                        onChange={(e) => updateDeliveryReference(e.target.value)}
                    />,
                    true,
                )
            ) : null}

            {showDistancePricing ? (
                inputWithIcon(
                    <MapPin size={14} className="opacity-70" aria-hidden />,
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="DISTANCIA APROX. (KM) — OPC."
                        className={cn(inputClass, 'pl-10')}
                        value={manualOrder.delivery_km}
                        onChange={(e) => updateDeliveryKm(e.target.value)}
                    />,
                    true,
                )
            ) : null}

            {!showNamedZonePicker ? (
                inputWithIcon(
                    <MapPin size={14} aria-hidden />,
                    <input
                        type="text"
                        placeholder={showDistancePricing ? 'DIRECCIÓN DE ENTREGA *' : 'DIRECCIÓN DE ENTREGA'}
                        className={cn(inputClass, 'pl-10 font-semibold')}
                        value={manualOrder.delivery_address}
                        onChange={(e) => updateDeliveryAddress(e.target.value)}
                    />,
                )
            ) : null}

            {distanceAutoMode ? (
                <Button variant="default"
                    type="button"
                    className={inlineActionClass}
                    onClick={handleCalculateDistance}
                    disabled={calculatingDistance || !manualOrder.delivery_address}
                >
                    {calculatingDistance ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Calculando...
                        </>
                    ) : (
                        <>
                            <MapPin size={14} />
                            Calcular distancia
                        </>
                    )}
                </Button>
            ) : null}

            {showDistancePricing && !distanceAutoMode && (
                <p className={`${textScale.micro} italic leading-relaxed text-gc-text-muted`}>
                    Configura la ubicación del local en Settings → Delivery para autocalcular distancia.
                </p>
            )}

            {inputWithIcon(
                <Banknote size={14} aria-hidden />,
                <input
                    type="number"
                    placeholder={
                        canOverrideDeliveryFee
                            ? (showNamedZonePicker || showDistancePricing
                                ? 'COSTO ENVÍO (calculado; puedes ajustar)'
                                : 'COSTO DE ENVÍO (OPCIONAL)')
                            : (showNamedZonePicker || showDistancePricing
                                ? 'COSTO ENVÍO (calculado automáticamente)'
                                : 'COSTO DE ENVÍO')
                    }
                    className={cn(inputClass, 'pl-10 font-semibold')}
                    value={manualOrder.delivery_fee || ''}
                    onChange={(e) => updateDeliveryFee(e.target.value)}
                    readOnly={!canOverrideDeliveryFee}
                    aria-readonly={!canOverrideDeliveryFee}
                />,
            )}
        </div>
    ) : (
        <p className={hintClass}>
            El cliente retira en el local. No se requieren datos de despacho.
        </p>
    );

    if (openMesaMode) {
        const channels = resolvedLocalChannels;
        const fulfillmentMode = openMesaFulfillmentMode;
        const isMesa = fulfillmentMode === 'mesa';
        const isRetiro = fulfillmentMode === 'retiro';
        const isMesero = isOpenMesaMeseroMode(manualOrder);
        const visibleModes = LOCAL_FULFILLMENT_MODES.filter((mode) => channels[mode]);

        return (
            <div className="w-full space-y-3">
            <div className={sectionCardClass}>
                <SectionHeader icon={Store} tone="accent">Tipo de pedido local</SectionHeader>

                {visibleModes.length > 0 ? (
                        <div className={cn(
                            `grid ${spacing.normal}`,
                            visibleModes.length === 1
                                ? 'grid-cols-1'
                                : visibleModes.length === 2
                                  ? 'grid-cols-1 min-[400px]:grid-cols-2'
                                  : 'grid-cols-1 min-[400px]:grid-cols-3',
                        )}>
                            {channels.mesa ? (
                                <Button variant="default"
                                    type="button"
                                    className={cn(
                                        toggleBaseClass,
                                        isMesa ? fulfillmentActiveClass.mesa : null,
                                    )}
                                    onClick={() => updateLocalFulfillmentMode?.('mesa')}
                                >
                                    <TableRestaurantIcon size={18} />
                                    Mesa
                                </Button>
                            ) : null}
                            {channels.retiro ? (
                                <Button variant="default"
                                    type="button"
                                    className={cn(
                                        toggleBaseClass,
                                        isRetiro ? fulfillmentActiveClass.retiro : null,
                                    )}
                                    onClick={() => updateLocalFulfillmentMode?.('retiro')}
                                >
                                    <PickupBagIcon size={18} />
                                    Retiro
                                </Button>
                            ) : null}
                            {channels.delivery ? (
                                <Button variant="default"
                                    type="button"
                                    className={cn(
                                        toggleBaseClass,
                                        isDelivery ? fulfillmentActiveClass.delivery : null,
                                    )}
                                    onClick={() => updateLocalFulfillmentMode?.('delivery')}
                                >
                                    <DeliveryMotoIcon size={18} />
                                    Delivery
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <p className={hintClass}>
                            No hay tipos de pedido local habilitados para esta sucursal.
                        </p>
                    )}

                    {isMesa ? (
                        <p className={hintClass}>
                            {manualOrder.charge_now
                                ? 'Consumo en salón. El pago se registra al abrir la mesa.'
                                : 'Consumo en salón. El pago se registra al cerrar la mesa.'}
                        </p>
                    ) : null}
                    {isRetiro ? (
                        <p className={hintClass}>
                            {manualOrder.charge_now
                                ? 'Retiro en local. El pago se registra al abrir el retiro.'
                                : 'Retiro en local. El pago se registra al cerrar el retiro.'}
                        </p>
                    ) : null}
                </div>

            <div className={sectionCardClass}>
                <SectionHeader icon={User} tone="accent">{isMesa ? 'Mesa / Cliente' : 'Cliente'}</SectionHeader>

                {isMesa ? (
                        <div className={`mb-3 grid grid-cols-1 ${spacing.normal} min-[400px]:grid-cols-2`}>
                            <Button variant="default"
                                type="button"
                                className={cn(toggleBaseClass, isMesero && selectedToggleActiveClass)}
                                onClick={() => updateMesaPartyMode?.('mesero')}
                            >
                                <User size={16} />
                                Mesero
                            </Button>
                            <Button variant="default"
                                type="button"
                                className={cn(toggleBaseClass, !isMesero && selectedToggleActiveClass)}
                                onClick={() => updateMesaPartyMode?.('cliente')}
                            >
                                <User size={16} />
                                Cliente
                            </Button>
                        </div>
                    ) : null}

                    {isMesa && isMesero
                        ? openMesaContactFields({
                            namePlaceholder: 'NOMBRE DEL MESERO *',
                            lockIdentityFields: true,
                            allowClientSearch: false,
                        })
                        : openMesaContactFields({
							namePlaceholder: 'BUSCAR CLIENTE O NOMBRE *',
                            lockIdentityFields: false,
                            allowClientSearch: true,
                        })}
                </div>

            {isDelivery ? (
                <div className={sectionCardClass}>
                    <SectionHeader icon={Truck} tone="accent">Datos de delivery</SectionHeader>
                    {branchDeliveryCfgLoading ? (
                            <p className={`flex items-center gap-2 ${textScale.micro} text-gc-text-muted`} role="status">
                                <Loader2 size={14} className="animate-spin" aria-hidden />
                                Cargando zonas y tarifas de delivery…
                            </p>
                        ) : (
                            deliveryFields
                        )}
                        <p className={hintClass}>
                            {manualOrder.charge_now
                                ? 'El pago se registra al abrir el delivery.'
                                : 'El pago se registra al cerrar el delivery.'}
                        </p>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className={`grid grid-cols-1 ${spacing.normal} lg:grid-cols-2`}>
            <div className={sectionCardClass}>
                <SectionHeader icon={User} tone="accent">Datos cliente</SectionHeader>
                <p className={`mb-3 ${textScale.micro} leading-relaxed text-gc-text-muted`}>
                    Busca un cliente registrado o completa sus datos de contacto.
                </p>

                <div className="grid gap-3">
                    <div className={fieldLabelClass}>
                        <label htmlFor="manual-order-client-name">Nombre completo{requiredMark(customerRequirements.name)}</label>
                        <div className="relative w-full" ref={clientSearchRef}>
                            <input
                                id="manual-order-client-name"
                                type="text"
                                placeholder="Buscar o escribir nombre"
                                className={inputClass}
                                value={manualOrder.client_name}
                                onChange={(e) => handleClientNameChange(e.target.value)}
                                onFocus={() => setClientSuggestionsOpen(true)}
								onKeyDown={handleClientComboboxKeyDown}
                                autoComplete="off"
								role="combobox"
								aria-autocomplete="list"
                                aria-label="Nombre completo del cliente"
                                aria-expanded={showClientSuggestions}
                                aria-controls="manual-order-client-suggestions"
								aria-activedescendant={activeSuggestionIndex >= 0 ? `manual-order-client-suggestions-option-${activeSuggestionIndex}` : undefined}
                                style={{
                                    paddingRight: manualOrder.client_name.length >= 3 ? '40px' : undefined,
                                }}
                            />
                            {manualOrder.client_name.length >= 3 && validationIcon}
                            {clientSuggestionsList('manual-order-client-suggestions')}
                        </div>
                    </div>

                    <label className={fieldLabelClass}>
                        <span>{formStrategy.idName}{requiredMark(customerRequirements.document)}</span>
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder={`Ingresa ${formStrategy.idName}`}
                                className={inputClass}
                                value={manualOrder.client_rut}
                                onChange={handleRutChange}
                                style={{
									...(manualOrder.client_rut ? getInputStyle(rutValid) : {}),
									paddingRight: manualOrder.client_rut && rutValid ? '40px' : undefined,
                                }}
                            />
							{manualOrder.client_rut && rutValid ? validationIcon : null}
                        </div>
                    </label>

                    <label className={fieldLabelClass}>
                        <span>Teléfono{requiredMark(customerRequirements.phone)}</span>
                        <div className="relative w-full">
                            <input
                                type="tel"
                                placeholder={`${formStrategy.phonePrefix}…`}
                                className={inputClass}
                                value={manualOrder.client_phone}
                                onChange={handlePhoneChange}
                                style={{
									...(manualOrder.client_phone ? getInputStyle(phoneValid) : {}),
									paddingRight: manualOrder.client_phone && phoneValid ? '40px' : undefined,
                                }}
                            />
							{manualOrder.client_phone && phoneValid ? validationIcon : null}
                        </div>
                    </label>
                    </div>
                </div>

                <div className={sectionCardClass}>
                    <SectionHeader icon={Truck} tone="accent">Retiro o delivery</SectionHeader>
                    <p className={`mb-3 ${textScale.micro} leading-relaxed text-gc-text-muted`}>
                        Elige cómo recibirá el cliente este pedido.
                    </p>

                    <div className={`grid grid-cols-1 ${spacing.normal} min-[400px]:grid-cols-2`}>
						{settingsFulfillments.pickup !== false ? <Button variant="default"
                            type="button"
                            className={cn(toggleBaseClass, isPickup && selectedToggleActiveClass)}
                            onClick={() => handleOrderTypeChange('pickup')}
                        >
                            <Store size={16} />
                            Local / Retiro
						</Button> : null}
						{settingsFulfillments.delivery !== false ? <Button variant="default"
                            type="button"
                            className={cn(toggleBaseClass, isDelivery && selectedToggleActiveClass)}
                            onClick={() => handleOrderTypeChange('delivery')}
                        >
                            <Truck size={16} />
                            Delivery
						</Button> : null}
                    </div>

                    {deliveryFields}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ClientForm);
