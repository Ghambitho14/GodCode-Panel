"use client";

import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import {
    X, Search, Plus, User, ShoppingBag, Minus, Trash2,
    CreditCard, CheckCircle2, Store, Receipt, MessageCircle, Printer,
    Upload, FileText, ChefHat, Banknote, CupSoda, Sparkles
} from 'lucide-react';
import { formatCurrency } from '../../shared/utils/formatters';
const logo = '/tenant/logo-placeholder.svg';
import { useManualOrder } from '../hooks/useManualOrder';
import { printOrderTicket } from '../utils/receiptPrinting';
import AdminIconSlot from './AdminIconSlot';

function branchFlag(map, branchId, defaultOn = true) {
    if (!branchId || !map || typeof map !== 'object') return defaultOn;
    if (Object.prototype.hasOwnProperty.call(map, branchId)) {
        return map[branchId] !== false;
    }
    return defaultOn;
}

function normalizeCartUpsellCatalog(catalog, kind) {
    if (!Array.isArray(catalog)) return [];
    return catalog
        .map((row) => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
            const id = String(row.id ?? '').trim();
            const name = String(row.name ?? '').trim();
            const price = Number(row.price);
            if (!id || !name || !Number.isFinite(price) || price < 0) return null;
            const category = String(row.category ?? row.catalogCategory ?? row.group ?? '').trim();
            const beverageKind = String(row.beverageKind ?? row.beverage_kind ?? '').trim();
            const imageUrl = String(row.imageUrl ?? row.image_url ?? '').trim();

            if (row.active === false || row.is_active === false || row.enabled === false) return null;

            return {
                id,
                name,
                price,
                has_discount: false,
                discount_price: null,
                image_url: imageUrl,
                description: beverageKind || null,
                category_name: category,
                manual_order_source: kind,
                is_active: true,
            };
        })
        .filter(Boolean);
}

function groupProductsByCategory(items, categories = []) {
    const sortedCategories = [...(categories || [])]
        .filter((cat) => cat?.is_active !== false)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const normalizeId = (value) => (value == null ? '' : String(value).trim());
    const normalizeName = (value) => (typeof value === 'string' ? value.trim() : '');

    const categoryById = new Map(sortedCategories.map((cat) => [normalizeId(cat?.id), cat]));
    const buckets = new Map();
    const uncategorized = [];

    (items || []).forEach((item) => {
        const id =
            normalizeId(item?.category_id) ||
            normalizeId(item?.categoryId) ||
            normalizeId(item?.category?.id);
        const name =
            normalizeName(item?.category_name) ||
            normalizeName(item?.categoryName) ||
            normalizeName(item?.category?.name);

        const knownCategory = id ? categoryById.get(id) : null;
        if (knownCategory) {
            const key = `id:${normalizeId(knownCategory.id)}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    id: knownCategory.id,
                    name: knownCategory.name || 'Sin categoría',
                    order: Number(knownCategory.order) || 0,
                    products: [],
                });
            }
            buckets.get(key).products.push(item);
            return;
        }

        if (name) {
            const key = `name:${name.toLowerCase()}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    id: key,
                    name,
                    order: 9999,
                    products: [],
                });
            }
            buckets.get(key).products.push(item);
            return;
        }

        uncategorized.push(item);
    });

    const groupedCategories = [...buckets.values()].sort((a, b) => (
        a.order === b.order
            ? String(a.name).localeCompare(String(b.name), 'es')
            : a.order - b.order
    ));

    return { groupedCategories, uncategorized };
}

const ManualOrderModal = ({ isOpen, onClose, products, categories = [], onOrderSaved, showNotify, registerSale, branch, logoUrl }) => {
    const {
        manualOrder, loading, rutValid, phoneValid,
        receiptFile, receiptPreview,
        updateClientName, updateNote, updatePaymentType, handleRutChange,
        handlePhoneChange, handleFileChange, removeReceipt, addItem, updateQuantity, removeItem,
        submitOrder, resetOrder, getInputStyle
    } = useManualOrder(showNotify, onOrderSaved, onClose, registerSale, branch);
	
	const [showCustomerFields, setShowCustomerFields] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [printMenuOpen, setPrintMenuOpen] = useState(false);
    const [showProductImages, setShowProductImages] = useState(false);
    const [isMobileLikeLayout, setIsMobileLikeLayout] = useState(false);
    const [cartUpsellCatalogs, setCartUpsellCatalogs] = useState({
        beveragesEnabled: false,
        extrasEnabled: false,
        beverages: [],
        extras: [],
    });
    const printMenuRef = useRef(null);
    const productsSectionRef = useRef(null);
    const beveragesSectionRef = useRef(null);
    const extrasSectionRef = useRef(null);

    // Reiniciar modal al abrir para evitar el bug de persistencia
    useEffect(() => {
        if (isOpen) {
            if (typeof resetOrder === 'function') resetOrder();
            setShowCustomerFields(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mqWidth = window.matchMedia('(max-width: 1024px)');
        const mqCoarse = window.matchMedia('(hover: none) and (pointer: coarse)');

        const syncLayout = () => {
            setIsMobileLikeLayout(mqWidth.matches || mqCoarse.matches);
        };

        syncLayout();
        mqWidth.addEventListener('change', syncLayout);
        mqCoarse.addEventListener('change', syncLayout);
        return () => {
            mqWidth.removeEventListener('change', syncLayout);
            mqCoarse.removeEventListener('change', syncLayout);
        };
    }, []);

    useEffect(() => {
        if (!printMenuOpen) return;
        const onDown = (ev) => {
            const el = printMenuRef.current;
            if (el && !el.contains(ev.target)) setPrintMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [printMenuOpen]);

    useEffect(() => {
        let cancelled = false;

        const resetCatalogs = () => {
            setCartUpsellCatalogs({
                beveragesEnabled: false,
                extrasEnabled: false,
                beverages: [],
                extras: [],
            });
        };

        if (!isOpen || !branch?.id || branch.id === 'all') {
            resetCatalogs();
            return undefined;
        }

        const loadCatalogs = async () => {
            try {
                const res = await fetch(
                    `/api/tenant-branch-delivery-enabled?branchId=${encodeURIComponent(branch.id)}`,
                    { cache: 'no-store', credentials: 'include' },
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el catálogo de carrito');
                if (cancelled) return;

                setCartUpsellCatalogs({
                    beveragesEnabled: branchFlag(data.beveragesUpsellEnabledByBranch, branch.id, true),
                    extrasEnabled: branchFlag(data.extrasEnabledByBranch, branch.id, true),
                    beverages: normalizeCartUpsellCatalog(data.cartBeveragesCatalog, 'beverages'),
                    extras: normalizeCartUpsellCatalog(data.cartGlobalExtrasCatalog, 'extras'),
                });
            } catch {
                if (!cancelled) resetCatalogs();
            }
        };

        void loadCatalogs();

        return () => {
            cancelled = true;
        };
    }, [isOpen, branch?.id]);

    const getEffectivePrice = (product) => {
        const basePrice = Number(product?.price || 0);
        const hasDiscount = Boolean(product?.has_discount) && product?.discount_price != null && Number(product.discount_price) > 0;
        return hasDiscount ? Number(product.discount_price) : basePrice;
    };

    const isProductAvailableForManualOrder = (product) => {
        if (!product) return false;
        if (product.is_active !== true) return false;
        return getEffectivePrice(product) > 0;
    };

    const getQty = (id) => manualOrder.items.find(i => i.id === id)?.quantity || 0;

	// [MEJORA SEGURIDAD] Función de sanitización
	const sanitizeInput = (text) => {
		if (!text) return '';
		return text.replace(/[<>]/g, '').trim(); // Elimina < y > para evitar inyección básica
	};

	// En inputs en vivo (ej: nombre) no hacer trim para permitir espacios al escribir.
	const sanitizeInputLive = (text) => {
		if (text == null || text === '') return '';
		return text.replace(/[<>]/g, '');
	};

	// La nota no debe hacer trim para permitir espacios entre palabras mientras escribes.
	const sanitizeNote = (text) => {
		if (text == null || text === '') return '';
		return text.replace(/[<>]/g, '');
	};

    const ticketOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        orderChannel: 'PDV',
    });

    const printManualKitchen = () => {
        printOrderTicket(manualOrder, branch?.name, logoUrl ?? null, ticketOpts('kitchen'));
        setPrintMenuOpen(false);
    };

    const printManualCaja = () => {
        printOrderTicket(manualOrder, branch?.name, logoUrl ?? null, ticketOpts('cashier'));
        setPrintMenuOpen(false);
    };

    // --- EFFECT: ESCAPE KEY ---
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // --- MOBILE GESTURES ---
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientY);
    };

    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientY);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isDownSwipe = distance < -minSwipeDistance;
        if (isDownSwipe) {
            onClose();
        }
    };

    const [searchExpanded, setSearchExpanded] = useState(false);
    const searchInputRef = React.useRef(null);

    const toggleSearch = () => {
        setSearchExpanded(!searchExpanded);
        if (!searchExpanded) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    const handleSearchBlur = () => {
        if (!searchQuery) {
            setSearchExpanded(false);
        }
    };

    // Validación del formulario
    const isFormValid = () => {
        const hasItems = manualOrder.items && manualOrder.items.length > 0;
        const hasClientName = manualOrder.client_name && manualOrder.client_name.trim().length >= 3;
        const hasPaymentType = !!manualOrder.payment_type;

        // Validación específica por tipo de pago
        let isPaymentValid = true;
        if (manualOrder.payment_type === 'online') {
            isPaymentValid = !!receiptFile;
        }

        const exactRutLength = manualOrder.client_rut?.trim().length || 0;
        const isRutRequiredAndValid = exactRutLength > 0 && rutValid;
        const isPhoneStrictlyValid = phoneValid === true;

        return hasItems && hasClientName && hasPaymentType && isPaymentValid && isRutRequiredAndValid && isPhoneStrictlyValid;
    };

    const customerSection = (
        <div className="manual-order-section">
            <div className="manual-order-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} aria-hidden />
                    DATOS CLIENTE
                </div>
                {!showCustomerFields && (
                    <button 
                        type="button"
                        onClick={() => setShowCustomerFields(true)}
                        style={{ 
                            fontSize: '10px', 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: '4px', 
                            padding: '4px 8px', 
                            color: 'white', 
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        EDITAR
                    </button>
                )}
            </div>

            {!showCustomerFields ? (
                <div 
                    className="manual-order-client-summary-box" 
                    onClick={() => setShowCustomerFields(true)}
                    style={{ 
                        cursor: 'pointer', 
                        padding: '12px', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px', 
                        fontSize: '13px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.2s ease',
                        marginTop: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                    <div style={{ fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {manualOrder.client_name || 'Sin nombre'}
                        {manualOrder.client_name === 'CAJA' && (
                            <span style={{ fontSize: '9px', background: '#25d366', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: '900' }}>DEFAULT</span>
                        )}
                    </div>
                    <div style={{ color: '#333333', opacity: 0.8, fontSize: '11px', letterSpacing: '0.5px', fontWeight: '500' }}>
                        {manualOrder.client_rut} • {manualOrder.client_phone}
                    </div>
                </div>
            ) : (
                <div className="manual-order-form-grid animate-fade-in" style={{ marginTop: '12px' }}>
                    <div className="manual-order-input-wrapper full-width">
                        <input
                            type="text"
                            placeholder="NOMBRE COMPLETO *"
                            className="manual-order-input"
                            value={manualOrder.client_name}
                            onChange={e => updateClientName(sanitizeInputLive(e.target.value))}
                            aria-label="Nombre completo del cliente"
                            style={{ paddingRight: manualOrder.client_name.length >= 3 ? '40px' : '16px' }}
                        />
                        {manualOrder.client_name.length >= 3 && (
                            <div className="manual-order-validation-icon">
                                <CheckCircle2 size={18} color="#25d366" />
                            </div>
                        )}
                    </div>

                    <div className="manual-order-input-wrapper">
                        <input
                            type="text"
                            placeholder="RUT *"
                            className="manual-order-input"
                            value={manualOrder.client_rut}
                            onChange={handleRutChange}
                            style={{
                                ...getInputStyle(rutValid),
                                paddingRight: rutValid ? '40px' : '16px'
                            }}
                        />
                        {rutValid && (
                            <div className="manual-order-validation-icon">
                                <CheckCircle2 size={18} color="#25d366" />
                            </div>
                        )}
                    </div>

                    <div className="manual-order-input-wrapper">
                        <input
                            type="tel"
                            placeholder="+56 9..."
                            className="manual-order-input"
                            value={manualOrder.client_phone}
                            onChange={handlePhoneChange}
                            style={{
                                ...getInputStyle(phoneValid),
                                paddingRight: phoneValid ? '40px' : '16px'
                            }}
                        />
                        {phoneValid && (
                            <div className="manual-order-validation-icon">
                                <CheckCircle2 size={18} color="#25d366" />
                            </div>
                        )}
                    </div>
                    
                    <button 
                        type="button"
                        onClick={() => setShowCustomerFields(false)}
                        style={{ 
                            gridColumn: '1 / -1',
                            fontSize: '11px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.5)',
                            padding: '8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            marginTop: '4px'
                        }}
                    >
                        CERRAR EDICIÓN
                    </button>
                </div>
            )}
        </div>
    );

    const noteSection = (
        <div className="manual-order-section manual-order-section--note">
            <div className="manual-order-section-title manual-order-section-title--note">
                <MessageCircle size={12} aria-hidden />
                NOTA DEL PEDIDO
            </div>
            <div className="manual-order-note-wrap">
                <textarea
                    placeholder="Nota opcional..."
                    className="manual-order-input manual-order-note-textarea"
                    value={manualOrder.note}
                    onChange={e => updateNote(sanitizeNote(e.target.value))}
                    rows={1}
                    maxLength={500}
                    aria-label="Nota o comentario del pedido"
                />
                {manualOrder.note.length > 0 && (
                    <div
                        className={
                            manualOrder.note.length > 450
                                ? 'manual-order-note-count manual-order-note-count--warn'
                                : 'manual-order-note-count'
                        }
                    >
                        {manualOrder.note.length}/500
                    </div>
                )}
            </div>
        </div>
    );

    const summarySection = (
        <div className="manual-order-section manual-order-summary-section">
            <div className="manual-order-section-title manual-order-summary-head">
                <div className="manual-order-summary-head-row">
                    <div className="manual-order-summary-head-label">
                        <ShoppingBag size={14} aria-hidden />
                        RESUMEN ORDEN ({manualOrder.items.reduce((acc, i) => acc + i.quantity, 0)})
                    </div>
                    {manualOrder.items.length > 0 && (
                        <div className="manual-order-print-menu" ref={printMenuRef}>
                            <button
                                type="button"
                                onClick={() => setPrintMenuOpen((v) => !v)}
                                className="manual-order-summary-print"
                                title="Imprimir tickets"
                                aria-expanded={printMenuOpen}
                                aria-haspopup="menu"
                                aria-label="Imprimir tickets"
                            >
                                <Printer size={14} aria-hidden />
                            </button>
                            {printMenuOpen ? (
                                <div className="manual-order-print-panel" role="menu">
                                    <button
                                        type="button"
                                        className="manual-order-print-item"
                                        role="menuitem"
                                        onClick={printManualKitchen}
                                    >
                                        <ChefHat size={16} aria-hidden />
                                        Ticket cocina
                                    </button>
                                    <button
                                        type="button"
                                        className="manual-order-print-item"
                                        role="menuitem"
                                        onClick={printManualCaja}
                                    >
                                        <Banknote size={16} aria-hidden />
                                        Ticket caja
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            <div className="manual-order-cart-body">
                {manualOrder.items.length === 0 ? (
                    <div className="manual-order-cart-empty">
                        <ShoppingBag size={42} strokeWidth={1} className="manual-order-cart-empty-icon" aria-hidden />
                        <div className="manual-order-cart-empty-text">CARRITO VACÍO</div>
                    </div>
                ) : (
                    <div className="manual-order-cart-list">
                        {manualOrder.items.map(item => (
                            <div
                                key={item.id}
                                className="manual-order-cart-item animate-slide-up"
                            >
                                <div className="manual-order-cart-item-accent" aria-hidden />

                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.image_url || logo}
                                    alt={item.name}
                                    className="manual-order-cart-item-thumb"
                                    onError={(e) => { e.target.src = logo }}
                                />

                                <div className="manual-order-cart-item-info">
                                    <div className="manual-order-cart-item-title">
                                        {item.name}
                                    </div>

                                    <div className="manual-order-cart-item-price-block">
                                        {(() => {
                                            const hasDiscount = Boolean(item.has_discount) && item.discount_price != null && Number(item.discount_price) > 0;
                                            const unit = hasDiscount ? Number(item.discount_price) : Number(item.price);
                                            const subtotal = unit * Number(item.quantity || 1);
                                            return (
                                                <div className="manual-order-cart-price-rows">
                                                    {hasDiscount && (
                                                        <div className="manual-order-cart-discount-row">
                                                            <span className="manual-order-cart-badge-oferta">
                                                                Oferta
                                                            </span>
                                                            <span className="manual-order-cart-price-old">
                                                                {formatCurrency(Number(item.price))}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="manual-order-cart-price-main-row">
                                                        <span className="manual-order-cart-price-total">
                                                            {formatCurrency(subtotal)}
                                                        </span>
                                                        <span className="manual-order-cart-price-unit">
                                                            {formatCurrency(unit)} c/u
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="manual-order-cart-stepper">
                                    <button
                                        type="button"
                                        className="manual-order-cart-step-btn"
                                        onClick={() => updateQuantity(item.id, -1)}
                                        aria-label="Reducir cantidad"
                                    >
                                        <Minus size={14} aria-hidden />
                                    </button>
                                    <span className="manual-order-cart-step-qty">
                                        {item.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        className="manual-order-cart-step-btn"
                                        onClick={() => updateQuantity(item.id, 1)}
                                        aria-label="Aumentar cantidad"
                                    >
                                        <Plus size={14} aria-hidden />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="manual-order-cart-remove"
                                    onClick={() => removeItem(item.id)}
                                    title="Eliminar ítem"
                                    aria-label="Eliminar ítem"
                                >
                                    <Trash2 size={14} aria-hidden />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    const footerSection = (
        <div className="manual-order-footer">
            <div className="manual-order-total">
                <span className="manual-order-total-label">TOTAL A PAGAR</span>
                <span className="manual-order-total-amount">
                    {formatCurrency(manualOrder.total)}
                </span>
            </div>

            {/* Métodos de pago */}
            <div className="manual-order-payment-methods">
                <button
                    className={`manual-order-payment-btn ${manualOrder.payment_type === 'tienda' ? 'active' : ''}`}
                    onClick={() => updatePaymentType('tienda')}
                >
                    <Store size={20} />
                    EFECTIVO
                </button>
                <button
                    className={`manual-order-payment-btn ${manualOrder.payment_type === 'tarjeta' ? 'active' : ''}`}
                    onClick={() => updatePaymentType('tarjeta')}
                >
                    <CreditCard size={20} />
                    TARJETA
                </button>
                <button
                    className={`manual-order-payment-btn ${manualOrder.payment_type === 'online' ? 'active' : ''}`}
                    onClick={() => updatePaymentType('online')}
                >
                    <Receipt size={20} />
                    TRANSF.
                </button>
            </div>

            {/* Comprobante de transferencia - Destacado */}
            {manualOrder.payment_type === 'online' && (
                <div style={{
                    marginBottom: '12px',
                    padding: '12px',
                    background: 'rgba(230, 57, 70, 0.08)',
                    border: '1px solid rgba(230, 57, 70, 0.3)',
                    borderRadius: '8px',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{
                        fontSize: '11px',
                        color: '#e63946',
                        fontWeight: '800',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textTransform: 'uppercase'
                    }}>
                        <Upload size={14} />
                        Adjuntar Comprobante
                    </div>

                    <label
                        htmlFor="receipt-upload"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '16px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            border: '1px dashed rgba(230, 57, 70, 0.3)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(230, 57, 70, 0.05)';
                            e.currentTarget.style.borderColor = '#e63946';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(230, 57, 70, 0.3)';
                        }}
                    >
                        <AdminIconSlot Icon={FileText} slotSize="md" tone="accent" />
                        <span style={{ fontSize: '12px', color: 'var(--admin-text-muted, #64748b)', fontWeight: '500' }}>
                            {receiptFile ? receiptFile.name : 'Click para subir imagen'}
                        </span>
                    </label>
                    <input
                        id="receipt-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                    />

                    {receiptPreview && (
                        <div style={{
                            marginTop: '12px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            position: 'relative'
                        }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={receiptPreview}
                                alt="Preview"
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '150px',
                                    objectFit: 'cover'
                                }}
                            />
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    removeReceipt();
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    background: 'rgba(230, 57, 70, 0.9)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                                }}
                            >
                                QUITAR
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Botón confirmar */}
            <button
                className="manual-order-confirm-btn"
                onClick={submitOrder}
                disabled={loading || !isFormValid()}
                style={{
                    opacity: loading || !isFormValid() ? 0.5 : 1,
                    cursor: loading || !isFormValid() ? 'not-allowed' : 'pointer'
                }}
            >
                {loading ? (
                    <>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            border: '2px solid rgba(255,255,255,0.3)',
                            borderTop: '2px solid white',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite'
                        }} />
                        PROCESANDO...
                    </>
                ) : (
                    <>
                        <CheckCircle2 size={20} />
                        CONFIRMAR PEDIDO
                    </>
                )}
            </button>
        </div>
    );

    const renderProductCard = (p, sourceLabel = '', variant = 'products') => {
        const hasDiscount = Boolean(p.has_discount) && p.discount_price != null && Number(p.discount_price) > 0;
        const unitPrice = hasDiscount ? Number(p.discount_price) : Number(p.price);

        const handleAddClick = (e) => {
            e.stopPropagation();
            try { addItem(p); } catch {}
        };

        return (
            <div
                key={p.id}
                className={`manual-order-product-card manual-order-product-card--${variant} ${showProductImages ? '' : 'no-images'}`}
                onClick={() => addItem(p)}
            >
                {sourceLabel ? (
                    <div className="manual-order-product-source-badge">
                        {sourceLabel}
                    </div>
                ) : null}
                {hasDiscount && (
                    <div style={{
                        position: 'absolute', top: '10px', left: '10px',
                        background: 'rgba(230,57,70,0.95)', color: '#fff',
                        fontSize: '10px', fontWeight: '800', padding: '4px 8px',
                        borderRadius: '999px', letterSpacing: '1px',
                        textTransform: 'uppercase', boxShadow: '0 8px 20px rgba(230,57,70,0.25)', zIndex: 2
                    }}>
                        Oferta
                    </div>
                )}
                {showProductImages ? (
                    <div className="manual-order-image-wrapper">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={p.image_url || logo} alt={p.name}
                            className={!p.image_url ? 'is-logo' : ''}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.target.onerror = null; e.target.src = logo; e.target.classList.add('is-logo'); }}
                        />
                    </div>
                ) : null}
                <div className="manual-order-card-content">
                    <h3 className="manual-order-card-title" title={p.name}>{p.name}</h3>
                    {p.description && (
                        <p className="manual-order-card-desc" title={p.description}>
                            {p.description}
                        </p>
                    )}
                    <div className="manual-order-card-footer-row">
                        <div className="manual-order-card-price">
                            {hasDiscount ? (
                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                                    <span style={{ fontSize: '11px', opacity: 0.65, textDecoration: 'line-through' }}>
                                        {formatCurrency(Number(p.price))}
                                    </span>
                                    <span style={{ fontSize: '14px', fontWeight: '900', color: '#e63946' }}>
                                        {formatCurrency(unitPrice)}
                                    </span>
                                </div>
                            ) : (
                                formatCurrency(Number(p.price))
                            )}
                        </div>
                        <div className={`manual-order-stepper-container ${getQty(p.id) > 0 ? 'active' : ''}`}>
                            {getQty(p.id) === 0 ? (
                                <button className="manual-order-add-btn" onClick={handleAddClick}>
                                    <Plus size={18} />
                                </button>
                            ) : (
                                <div className="manual-order-stepper animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                    <button className="mo-step-btn minus" onClick={(e) => {
                                        e.stopPropagation();
                                        if (getQty(p.id) === 1) removeItem(p.id);
                                        else updateQuantity(p.id, -1);
                                    }}>
                                        <Minus size={14} />
                                    </button>
                                    <span className="mo-step-count">{getQty(p.id)}</span>
                                    <button className="mo-step-btn plus" onClick={handleAddClick}>
                                        <Plus size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const deferredSearchQuery = useDeferredValue(searchQuery);
    const query = deferredSearchQuery.trim().toLowerCase();

    const baseProducts = useMemo(() => {
        return (products || []).filter((product) => {
            if (!isProductAvailableForManualOrder(product)) return false;
            const productName = String(product?.name || '').toLowerCase();
            const categoryName = String(product?.category_name || product?.categoryName || product?.category?.name || '').toLowerCase();
            return productName.includes(query) || categoryName.includes(query);
        });
    }, [products, query]);

    const beverageProducts = useMemo(() => {
        if (!cartUpsellCatalogs.beveragesEnabled) return [];
        return cartUpsellCatalogs.beverages.filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const categoryName = String(item?.category_name || '').toLowerCase();
            const detail = String(item?.description || '').toLowerCase();
            return name.includes(query) || categoryName.includes(query) || detail.includes(query);
        });
    }, [cartUpsellCatalogs.beverages, cartUpsellCatalogs.beveragesEnabled, query]);

    const extraProducts = useMemo(() => {
        if (!cartUpsellCatalogs.extrasEnabled) return [];
        return cartUpsellCatalogs.extras.filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const categoryName = String(item?.category_name || '').toLowerCase();
            const detail = String(item?.description || '').toLowerCase();
            return name.includes(query) || categoryName.includes(query) || detail.includes(query);
        });
    }, [cartUpsellCatalogs.extras, cartUpsellCatalogs.extrasEnabled, query]);

    const groupedBaseCatalog = useMemo(
        () => (baseProducts.length > 0 ? groupProductsByCategory(baseProducts, categories) : { groupedCategories: [], uncategorized: [] }),
        [baseProducts, categories],
    );

    const groupedBeverageCatalog = useMemo(
        () => (beverageProducts.length > 0 ? groupProductsByCategory(beverageProducts, []) : { groupedCategories: [], uncategorized: [] }),
        [beverageProducts],
    );

    const groupedExtrasCatalog = useMemo(
        () => (extraProducts.length > 0 ? groupProductsByCategory(extraProducts, []) : { groupedCategories: [], uncategorized: [] }),
        [extraProducts],
    );

    const renderCatalogSection = (catalog, sectionTitle, sourceLabel = '', variant = 'products', sectionNote = '') => {
        if (!catalog || (catalog.groupedCategories.length === 0 && catalog.uncategorized.length === 0)) return null;

        const totalCount = catalog.groupedCategories.reduce((sum, cat) => sum + cat.products.length, 0) + catalog.uncategorized.length;

        return (
            <section className={`manual-order-catalog-section manual-order-catalog-section--${variant}`}>
                <header className="manual-order-catalog-section__head">
                    <div className="manual-order-catalog-section__title-wrap">
                        <span className="manual-order-catalog-section__eyebrow">{variant === 'products' ? 'Catálogo principal' : variant === 'beverages' ? 'Upsell sucursal' : 'Complementos'}</span>
                        <h3 className="manual-order-catalog-section__title">{sectionTitle}</h3>
                    </div>
                    <div className="manual-order-catalog-section__meta">
                        <span className="manual-order-catalog-section__count">{totalCount}</span>
                        <span className="manual-order-catalog-section__count-label">{totalCount === 1 ? 'ítem' : 'ítems'}</span>
                    </div>
                </header>
                {sectionNote ? <p className="manual-order-catalog-section__note">{sectionNote}</p> : null}
                {catalog.groupedCategories.map((cat) => (
                    <div key={cat.id} className="manual-order-category-section">
                        <h3 className="manual-order-category-title">{cat.name}</h3>
                        <div className="manual-order-products-grid">
                            {cat.products.map((p) => renderProductCard(p, sourceLabel, variant))}
                        </div>
                    </div>
                ))}
                {catalog.uncategorized.length > 0 && (
                    <div className="manual-order-category-section">
                        <h3 className="manual-order-category-title">Otros</h3>
                        <div className="manual-order-products-grid">
                            {catalog.uncategorized.map((p) => renderProductCard(p, sourceLabel, variant))}
                        </div>
                    </div>
                )}
            </section>
        );
    };

    const hasAnyResults = baseProducts.length > 0 || beverageProducts.length > 0 || extraProducts.length > 0;
    const hasProductsSection = baseProducts.length > 0;
    const hasBeveragesSection = cartUpsellCatalogs.beveragesEnabled && beverageProducts.length > 0;
    const hasExtrasSection = cartUpsellCatalogs.extrasEnabled && extraProducts.length > 0;

    const scrollToSection = (sectionRef) => {
        sectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (!isOpen) return null;

    return (
        <div className="manual-order-overlay" onClick={onClose}>
            <div
                className="manual-order-container"
                onClick={e => e.stopPropagation()}
            >
                {/* DRAG HANDLER (Invisible top area for gestures) */}
                <div
                    className="manual-order-drag-zone"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                />

                {/* FLOATING CLOSE BUTTON */}
                <button
                    onClick={onClose}
                    className="manual-order-floating-close"
                    title="Cerrar (Esc)"
                >
                    <X size={24} />
                </button>

                {/* HEADER REMOVED */}

                {/* CONTENT: 2 COLUMNAS */}
                <div className="manual-order-body">
                    {/* COLUMNA IZQUIERDA: PRODUCTOS */}
                    <div className="manual-order-products">

                        {/* FLOATING SEARCH PILL */}
                        <div
                            className={`manual-order-search-pill ${searchExpanded || searchQuery ? 'expanded' : ''}`}
                            onClick={toggleSearch}
                        >
                            <div className="manual-order-search-icon-wrapper">
                                <Search size={20} />
                            </div>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Buscar..."
                                className="manual-order-search-input-pill"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onBlur={handleSearchBlur}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        <label className="manual-order-images-toggle" title="Mostrar/ocultar imágenes de productos">
                            <input
                                type="checkbox"
                                checked={showProductImages}
                                onChange={(e) => setShowProductImages(e.target.checked)}
                            />
                            <span className="manual-order-images-toggle__track" aria-hidden="true">
                                <span className="manual-order-images-toggle__thumb" />
                            </span>
                            <span className="manual-order-images-toggle__label">Mostrar imágenes</span>
                        </label>

                        <div className="manual-order-section-jumprail" aria-label="Navegación rápida del catálogo">
                            <button
                                type="button"
                                className="manual-order-section-jumprail__btn manual-order-section-jumprail__btn--products"
                                onClick={() => scrollToSection(productsSectionRef)}
                                disabled={!hasProductsSection}
                                aria-label="Ir a Productos"
                                title="Productos"
                            >
                                <ShoppingBag size={18} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="manual-order-section-jumprail__btn manual-order-section-jumprail__btn--beverages"
                                onClick={() => scrollToSection(beveragesSectionRef)}
                                disabled={!hasBeveragesSection}
                                aria-label="Ir a Bebidas"
                                title="Bebidas"
                            >
                                <CupSoda size={18} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="manual-order-section-jumprail__btn manual-order-section-jumprail__btn--extras"
                                onClick={() => scrollToSection(extrasSectionRef)}
                                disabled={!hasExtrasSection}
                                aria-label="Ir a Extras"
                                title="Extras"
                            >
                                <Sparkles size={18} aria-hidden="true" />
                            </button>
                        </div>

                        {/* Productos agrupados por categoría */}
                        <div className="manual-order-categories-scroll">
                            {!hasAnyResults ? (
                                <div className="manual-order-empty-search" style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                    No se encontraron productos
                                </div>
                            ) : (
                                <>
                                    <div ref={productsSectionRef}>
                                        {renderCatalogSection(groupedBaseCatalog, 'Productos', '', 'products', 'Producto regular del menú para este pedido manual.')}
                                    </div>
                                    {beverageProducts.length > 0 && (
                                        <div ref={beveragesSectionRef}>
                                            {renderCatalogSection(groupedBeverageCatalog, 'Bebidas', 'Bebida', 'beverages', 'Opciones de bebida activas para esta sucursal.')}
                                        </div>
                                    )}
                                    {extraProducts.length > 0 && (
                                        <div ref={extrasSectionRef}>
                                            {renderCatalogSection(groupedExtrasCatalog, 'Extras', 'Extra', 'extras', 'Complementos opcionales disponibles en carrito.')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: SIDEBAR — en móvil/tablet el DOM va: resumen → cliente → nota → footer */}
                    <div className="manual-order-sidebar">
                        {isMobileLikeLayout ? (
                            <>
                                {summarySection}
                                {customerSection}
                                {noteSection}
                                {footerSection}
                            </>
                        ) : (
                            <>
                                {customerSection}
                                {noteSection}
                                {summarySection}
                                {footerSection}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManualOrderModal;
