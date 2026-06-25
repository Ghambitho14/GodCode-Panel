import React, { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Printer, ChefHat, Banknote, Minus, Plus, StickyNote, Trash2, Receipt } from 'lucide-react';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../constants/productImagePlaceholder';
import { cn } from '@/lib/utils';

/**
 * Resumen del carrito de compras con estilos Tailwind.
 */
const OrderSummary = ({
    manualOrder,
    updateQuantity,
    removeItem,
    updateItemNote,
    printManualKitchen,
    printManualCaja,
    showCheckoutTotals = false,
}) => {
    const { formatMoney } = useBranchMoney();
    const [printMenuOpen, setPrintMenuOpen] = useState(false);
    const [openNoteIds, setOpenNoteIds] = useState(() => new Set());
    const printMenuRef = useRef(null);

    const isItemNoteOpen = (item) => openNoteIds.has(item.id) || (item.note ?? '').length > 0;

    const toggleItemNote = (itemId) => setOpenNoteIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
    });

    useEffect(() => {
        if (!printMenuOpen) return;
        const onDown = (ev) => {
            const el = printMenuRef.current;
            if (el && !el.contains(ev.target)) setPrintMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [printMenuOpen]);

    const totalQty = manualOrder.items.reduce((acc, i) => acc + i.quantity, 0);
    const itemsSubtotal = Number(manualOrder.total ?? manualOrder.items_subtotal) || 0;
    const deliveryFeeAmt =
        manualOrder.order_type === 'delivery' ? (Number(manualOrder.delivery_fee) || 0) : 0;
    const checkoutTotal =
        Number.isFinite(Number(manualOrder.checkout_total))
            ? Number(manualOrder.checkout_total)
            : Math.round((itemsSubtotal + deliveryFeeAmt) * 100) / 100;
    const showTotals =
        showCheckoutTotals &&
        manualOrder.items.length > 0 &&
        (manualOrder.order_type === 'delivery' || deliveryFeeAmt > 0);

    return (
        <div className="gc-order-summary flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-gc-border bg-gc-page">
            <div className="flex items-center justify-between border-b border-gc-border px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-bold text-gc-text">
                    <ShoppingBag size={15} className="text-gc-accent" />
                    Resumen ({totalQty})
                </div>
                {manualOrder.items.length > 0 && (
                    <div className="relative" ref={printMenuRef}>
                        <button
                            type="button"
                            onClick={() => setPrintMenuOpen((v) => !v)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gc-muted text-gc-text-muted transition-colors hover:bg-gc-accent/10 hover:text-gc-accent"
                            title="Imprimir tickets"
                            aria-expanded={printMenuOpen}
                            aria-haspopup="menu"
                            aria-label="Imprimir tickets"
                        >
                            <Printer size={14} />
                        </button>
                        {printMenuOpen && (
                            <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-gc-border bg-gc-card p-1.5 shadow-lg" role="menu">
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-gc-text transition-colors hover:bg-gc-muted"
                                    role="menuitem"
                                    onClick={() => {
                                        printManualKitchen();
                                        setPrintMenuOpen(false);
                                    }}
                                >
                                    <ChefHat size={14} className="text-gc-accent" />
                                    Ticket cocina
                                </button>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-gc-text transition-colors hover:bg-gc-muted"
                                    role="menuitem"
                                    onClick={() => {
                                        printManualCaja();
                                        setPrintMenuOpen(false);
                                    }}
                                >
                                    <Banknote size={14} className="text-gc-success" />
                                    Ticket caja
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {manualOrder.items.length === 0 ? (
                    <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2.5 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gc-muted">
                            <Receipt size={22} className="text-gc-text-muted" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gc-text">Carrito vacío</p>
                            <p className="mt-0.5 text-xs text-gc-text-muted">Agregá productos para armar el pedido.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {manualOrder.items.map(item => {
                            const hasDiscount = Boolean(item.has_discount) && item.discount_price != null && Number(item.discount_price) > 0;
                            const unit = hasDiscount ? Number(item.discount_price) : Number(item.price);
                            const subtotal = unit * Number(item.quantity || 1);
                            const noteOpen = isItemNoteOpen(item);

                            return (
                                <div key={item.id} className="rounded-[4px] border border-gc-border bg-gc-page p-2.5">
                                    <div className="flex gap-2.5">
                                        <img
                                            src={item.image_url || PRODUCT_IMAGE_PLACEHOLDER}
                                            alt={item.name}
                                            className="h-12 w-12 flex-shrink-0 rounded-[4px] object-cover"
                                            onError={(e) => { e.target.src = PRODUCT_IMAGE_PLACEHOLDER; }}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold text-gc-text">{item.name}</p>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                        {hasDiscount && (
                                                            <span className="rounded bg-gc-discount/10 px-1 py-0.5 text-[9px] font-bold uppercase text-gc-discount">
                                                                Oferta
                                                            </span>
                                                        )}
                                                        {hasDiscount && (
                                                            <span className="text-[11px] text-gc-text-muted line-through">
                                                                {formatMoney(Number(item.price))}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-black text-gc-text">
                                                        {formatMoney(subtotal)}
                                                        <span className="ml-1 text-[10px] font-semibold text-gc-text-muted">
                                                            ({formatMoney(unit)} c/u)
                                                        </span>
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <div className="flex items-center gap-1 rounded-full bg-gc-card p-0.5 shadow-sm">
                                                        <button
                                                            type="button"
                                                            className="flex h-6 w-6 items-center justify-center rounded-full text-gc-text transition-colors hover:bg-gc-muted"
                                                            onClick={() => updateQuantity(item.id, -1)}
                                                            aria-label="Reducir cantidad"
                                                        >
                                                            <Minus size={12} strokeWidth={2.5} />
                                                        </button>
                                                        <span className="min-w-[1rem] text-center text-xs font-bold text-gc-text">{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            className="flex h-6 w-6 items-center justify-center rounded-full text-gc-text transition-colors hover:bg-gc-muted"
                                                            onClick={() => updateQuantity(item.id, 1)}
                                                            aria-label="Aumentar cantidad"
                                                        >
                                                            <Plus size={12} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-gc-card text-gc-text-muted transition-colors hover:bg-gc-danger/10 hover:text-gc-danger"
                                                        onClick={() => removeItem(item.id)}
                                                        title="Eliminar ítem"
                                                        aria-label="Eliminar ítem"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={cn(
                                            'mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[4px] border px-2.5 py-2 text-[11px] font-semibold transition-colors',
                                            (item.note ?? '').length > 0
                                                ? 'border-gc-accent/30 bg-gc-accent/10 text-gc-accent'
                                                : 'border-gc-border bg-gc-card text-gc-text-muted hover:border-gc-accent/25 hover:text-gc-accent',
                                        )}
                                        onClick={() => toggleItemNote(item.id)}
                                        title={(item.note ?? '').length > 0 ? 'Editar comentario' : 'Agregar comentario para cocina'}
                                        aria-label={(item.note ?? '').length > 0 ? 'Editar comentario' : 'Agregar comentario para cocina'}
                                        aria-pressed={noteOpen}
                                    >
                                        <StickyNote size={12} />
                                        {(item.note ?? '').length > 0 ? 'Editar comentario' : 'Comentario para cocina'}
                                    </button>

                                    {noteOpen && (
                                        <div className="mt-2">
                                            <textarea
                                                className="w-full rounded-[4px] border border-gc-border bg-gc-card p-2 text-xs text-gc-text placeholder:text-gc-text-muted focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
                                                value={item.note ?? ''}
                                                onChange={(e) => updateItemNote(item.id, e.target.value)}
                                                placeholder="Ej: sin cebolla, salsa aparte. Máx. 140 caracteres."
                                                maxLength={140}
                                                rows={2}
                                                aria-label={`Comentario para ${item.name}`}
                                            />
                                            <span className="mt-1 block text-right text-[10px] text-gc-text-muted">
                                                {(item.note ?? '').length}/140
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Totals */}
            {showTotals && (
                <div className="border-t border-gc-border bg-gc-muted/40 p-4">
                    <div className="space-y-1.5 text-xs text-gc-text-muted">
                        <div className="flex justify-between">
                            <span>Subtotal productos</span>
                            <span className="font-semibold text-gc-text">{formatMoney(itemsSubtotal)}</span>
                        </div>
                        {deliveryFeeAmt > 0 && (
                            <div className="flex justify-between">
                                <span>Envío</span>
                                <span className="font-semibold text-gc-text">{formatMoney(deliveryFeeAmt)}</span>
                            </div>
                        )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gc-border pt-3">
                        <span className="text-xs font-black uppercase tracking-wider text-gc-text-muted">Total</span>
                        <span className="text-lg font-black text-gc-text">{formatMoney(checkoutTotal)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(OrderSummary);
