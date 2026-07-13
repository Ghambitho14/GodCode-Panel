import React, { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Printer, ChefHat, Banknote, Receipt } from 'lucide-react';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import SectionHeader from './SectionHeader';
import CartItemCard from './CartItemCard';
import { spacing, textScale } from './manualOrderStyles';

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
    const { formatMoney, formatOrderAmount } = useOrderMoney();
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

    const summaryHasFewItems = manualOrder.items.length <= 2 && !showCheckoutTotals;

    return (
        <div className={cn(
            'gc-order-summary flex min-h-0 flex-col overflow-hidden rounded-[4px] border border-gc-border bg-gc-page',
            !summaryHasFewItems && 'flex-1',
        )}>
            <div className="flex items-center justify-between border-b border-gc-border px-4 py-3">
                <SectionHeader icon={ShoppingBag} tone="accent">Resumen ({totalQty})</SectionHeader>
                {manualOrder.items.length > 0 && (
                    <div className="relative" ref={printMenuRef}>
                        <Button variant="default"
                            type="button"
                            onClick={() => setPrintMenuOpen((v) => !v)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gc-muted text-gc-text-muted transition-colors hover:bg-gc-accent/10 hover:text-gc-accent"
                            title="Imprimir tickets"
                            aria-expanded={printMenuOpen}
                            aria-haspopup="menu"
                            aria-label="Imprimir tickets"
                        >
                            <Printer size={14} />
                        </Button>
                        {printMenuOpen && (
                            <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-[4px] border border-gc-border bg-gc-card p-1.5 shadow-lg" role="menu">
                                <Button variant="default"
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-[4px] border border-gc-border bg-gc-card px-3 py-2 text-left ${textScale.body} font-bold text-gc-text transition-colors hover:bg-gc-muted`}
                                    role="menuitem"
                                    onClick={() => {
                                        printManualKitchen();
                                        setPrintMenuOpen(false);
                                    }}
                                >
                                    <ChefHat size={14} className="text-gc-accent" />
                                    Ticket cocina
                                </Button>
                                <Button variant="default"
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-[4px] border border-gc-border bg-gc-card px-3 py-2 text-left ${textScale.body} font-bold text-gc-text transition-colors hover:bg-gc-muted`}
                                    role="menuitem"
                                    onClick={() => {
                                        printManualCaja();
                                        setPrintMenuOpen(false);
                                    }}
                                >
                                    <Banknote size={14} className="text-gc-success" />
                                    Ticket caja
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {manualOrder.items.length === 0 ? (
                    <div className={`flex h-full min-h-[140px] flex-col items-center justify-center ${spacing.normal} text-center`}>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gc-muted">
                            <Receipt size={22} className="text-gc-text-muted" />
                        </div>
                        <div>
                            <p className={`${textScale.emphasis} font-semibold text-gc-text`}>Carrito vacío</p>
                            <p className={`mt-0.5 ${textScale.micro} text-gc-text-muted`}>Agregá productos para armar el pedido.</p>
                        </div>
                    </div>
                ) : (
                    <div className={`flex flex-col ${spacing.normal}`}>
                        {manualOrder.items.map(item => (
                            <CartItemCard
                                key={item.id}
                                item={item}
                                updateQuantity={updateQuantity}
                                removeItem={removeItem}
                                updateItemNote={updateItemNote}
                                isItemNoteOpen={isItemNoteOpen}
                                toggleItemNote={toggleItemNote}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Totals */}
            {showTotals && (
                <div className="border-t-2 border-gc-border p-4">
                    <div className={`space-y-1.5 ${textScale.micro} text-gc-text-muted`}>
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
                    <div className="mt-3 flex items-center justify-between pt-1">
                        <span className={`${textScale.micro} font-black uppercase tracking-wider text-gc-text-muted`}>Total</span>
                        <span className={`${textScale.price} font-black text-gc-text`}>
                            {formatOrderAmount({
                                amountUsd: checkoutTotal,
                                paymentMethod: manualOrder.payment_method_specific
                                    ?? (manualOrder.payment_type === 'tienda'
                                        ? 'efectivo'
                                        : manualOrder.payment_type === 'tarjeta'
                                            ? 'tarjeta'
                                            : manualOrder.payment_type === 'online'
                                                ? 'transferencia_bancaria'
                                                : manualOrder.payment_type),
                            })}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(OrderSummary);
