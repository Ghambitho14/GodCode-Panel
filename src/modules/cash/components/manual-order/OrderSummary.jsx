import React, { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Printer, ChefHat, Banknote, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import CartItemCard from './CartItemCard';
import DualCurrencyAmount from './DualCurrencyAmount';
import { spacing, textScale } from './manualOrderStyles';
import { formatMinor, majorToMinor } from '@/lib/money/minor-units';

/**
 * Resumen del carrito de compras con estilos Tailwind.
 * @param {'default' | 'sheet' | 'compact'} [variant]
 */
const OrderSummary = ({
    manualOrder,
    updateQuantity,
    removeItem,
    updateItemNote,
    printManualKitchen,
    printManualCaja,
    showCheckoutTotals = false,
	variant = 'default',
	exchangeRate = null,
}) => {
	const isSheet = variant === 'sheet';
	const isCompact = variant === 'compact';
	const accountingCurrency = manualOrder.currency || 'CLP';
	const accountingDigits = manualOrder.fractionDigits;
	const formatAccountingMoney = (amount) => formatMinor(
		majorToMinor(amount, accountingCurrency, accountingDigits),
		{ currency: accountingCurrency, locale: manualOrder.locale, fractionDigits: accountingDigits },
	);
    const [printMenuOpen, setPrintMenuOpen] = useState(false);
    const [openNoteIds, setOpenNoteIds] = useState(() => new Set());
	const [compactExpanded, setCompactExpanded] = useState(false);
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
			: itemsSubtotal + deliveryFeeAmt;
    const showTotals =
        showCheckoutTotals &&
        manualOrder.items.length > 0 &&
        (manualOrder.order_type === 'delivery' || deliveryFeeAmt > 0);
	// Subtotal dual en sheet y en sidebar desktop (misma familia visual).
	const showCartSubtotal = !isCompact && !showTotals && manualOrder.items.length > 0;

    const summaryHasFewItems = manualOrder.items.length <= 2 && !showCheckoutTotals && !isSheet && !isCompact;

	const printMenu = manualOrder.items.length > 0
		&& typeof printManualKitchen === 'function'
		&& typeof printManualCaja === 'function' ? (
		<div className="relative" ref={printMenuRef}>
			<Button
				variant="outline"
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setPrintMenuOpen((v) => !v);
				}}
				className="flex h-8 w-8 items-center justify-center rounded-full border border-gc-border bg-gc-card p-0 text-gc-text-muted shadow-none transition-colors hover:border-gc-accent/30 hover:bg-gc-accent/10 hover:text-gc-accent"
				title="Imprimir tickets"
				aria-expanded={printMenuOpen}
				aria-haspopup="menu"
				aria-label="Imprimir tickets"
			>
				<Printer size={14} />
			</Button>
			{printMenuOpen && (
				<div
					className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-gc-border bg-gc-card p-1.5 shadow-lg"
					role="menu"
				>
					<Button
						variant="ghost"
						type="button"
						className={`flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left ${textScale.body} font-bold text-gc-text shadow-none transition-colors hover:bg-gc-muted`}
						role="menuitem"
						onClick={() => {
							printManualKitchen();
							setPrintMenuOpen(false);
						}}
					>
						<ChefHat size={14} className="text-gc-accent" />
						Ticket cocina
					</Button>
					<Button
						variant="ghost"
						type="button"
						className={`flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left ${textScale.body} font-bold text-gc-text shadow-none transition-colors hover:bg-gc-muted`}
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
	) : null;

	if (isCompact) {
		const headerId = 'manual-order-compact-summary-toggle';
		const panelId = 'manual-order-compact-summary-panel';
		return (
			<div className="gc-order-summary gc-order-summary--compact flex shrink-0 flex-col overflow-hidden rounded-[18px] border border-gc-border bg-gc-card shadow-sm">
				<div className="flex items-center gap-2 border-b border-gc-border/80 px-3 py-2.5">
					<button
						type="button"
						id={headerId}
						className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] bg-transparent p-0.5 text-left transition-colors hover:bg-gc-muted/60"
						aria-expanded={compactExpanded}
						aria-controls={panelId}
						onClick={() => setCompactExpanded((v) => !v)}
					>
						<span
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gc-accent/10 text-gc-accent"
							aria-hidden
						>
							<ShoppingBag size={16} strokeWidth={2.25} />
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex min-w-0 items-center gap-2">
								<p className={cn(textScale.emphasis, 'truncate font-bold leading-snug text-gc-text')}>
									Tu pedido
								</p>
								{manualOrder.items.length > 0 ? (
									<span
										className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gc-accent px-1.5 text-[10px] font-bold tabular-nums leading-none text-white"
										aria-label={`${totalQty} ${totalQty === 1 ? 'ítem' : 'ítems'}`}
									>
										{totalQty}
									</span>
								) : null}
							</div>
							{manualOrder.items.length > 0 ? (
								<DualCurrencyAmount
									amount={checkoutTotal}
									currency={accountingCurrency}
									exchangeRate={exchangeRate}
									locale={manualOrder.locale}
									formatPrimary={formatAccountingMoney}
									layout="inline"
									size="sm"
									align="start"
									className="mt-0.5"
									primaryClassName="text-gc-text"
									secondaryClassName="text-gc-text-muted/80"
								/>
							) : (
								<p className={cn(textScale.micro, 'mt-0.5 text-gc-text-muted')}>Sin productos</p>
							)}
						</div>
						<ChevronDown
							size={18}
							className={cn(
								'shrink-0 text-gc-text-muted transition-transform duration-200',
								compactExpanded && 'rotate-180',
							)}
							aria-hidden
						/>
					</button>
					{printMenu}
				</div>

				{compactExpanded ? (
					<div
						id={panelId}
						role="region"
						aria-labelledby={headerId}
						className="gc-order-summary__compact-body max-h-[min(32vh,280px)] overflow-y-auto overscroll-contain px-3 py-1"
					>
						{manualOrder.items.length === 0 ? (
							<p className={cn(textScale.micro, 'py-4 text-center text-gc-text-muted')}>
								Carrito vacío
							</p>
						) : (
							<div className="flex flex-col">
								{manualOrder.items.map((item) => (
									<CartItemCard
										key={item.id}
										item={item}
										formatMoney={formatAccountingMoney}
										compact
										readOnly
									/>
								))}
							</div>
						)}
					</div>
				) : null}
			</div>
		);
	}

    return (
        <div className={cn(
            'gc-order-summary flex min-h-0 flex-col',
			isSheet
				? 'gc-order-summary--sheet overflow-visible rounded-none border-0 bg-transparent shadow-none'
				: 'overflow-hidden rounded-[18px] border border-gc-border bg-gc-card shadow-sm',
            !summaryHasFewItems && 'flex-1',
        )}>
            <div className={cn(
				'gc-order-summary__header flex items-center justify-between gap-3',
				isSheet ? 'px-3.5 pb-3 pt-1' : 'border-b border-gc-border px-4 py-3.5',
			)}>
				<div className="flex min-w-0 items-center gap-3">
					<span
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gc-accent/10 text-gc-accent"
						aria-hidden
					>
						<ShoppingBag size={16} strokeWidth={2.25} />
					</span>
					<div className="min-w-0">
						<p className={cn(textScale.emphasis, 'truncate font-bold leading-snug text-gc-text')}>
							Tu pedido
						</p>
					</div>
					{manualOrder.items.length > 0 ? (
						<span
							className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-gc-accent px-2 text-[11px] font-bold tabular-nums leading-none text-white"
							aria-label={`${totalQty} ${totalQty === 1 ? 'ítem' : 'ítems'}`}
						>
							{totalQty}
						</span>
					) : null}
				</div>
				{printMenu}
            </div>

			{isSheet ? <div className="mx-3.5 border-t border-gc-border/70" aria-hidden /> : null}

            <div className={cn(
				'gc-order-summary__body flex-1 overflow-y-auto',
				isSheet ? 'px-3.5 py-1' : 'p-3',
			)}>
                {manualOrder.items.length === 0 ? (
                    <div className={`flex h-full min-h-[140px] flex-col items-center justify-center ${spacing.normal} text-center`}>
                        <div>
                            <p className={`${textScale.emphasis} font-semibold text-gc-text`}>Carrito vacío</p>
                            <p className={`mt-0.5 ${textScale.micro} text-gc-text-muted`}>Agregá productos para armar el pedido.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {manualOrder.items.map(item => (
                            <CartItemCard
                                key={item.id}
                                item={item}
                                updateQuantity={updateQuantity}
                                removeItem={removeItem}
                                updateItemNote={updateItemNote}
                                isItemNoteOpen={isItemNoteOpen}
                                toggleItemNote={toggleItemNote}
								formatMoney={formatAccountingMoney}
								compact={isSheet}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showTotals && (
                <div className={cn('border-t border-gc-border', isSheet ? 'px-3.5 py-3' : 'border-t-2 p-4')}>
                    <div className={`space-y-1.5 ${textScale.micro} text-gc-text-muted`}>
                        <div className="flex justify-between">
                            <span>Subtotal productos</span>
							<span className="font-semibold text-gc-text">{formatAccountingMoney(itemsSubtotal)}</span>
                        </div>
                        {deliveryFeeAmt > 0 && (
                            <div className="flex justify-between">
                                <span>Envío</span>
								<span className="font-semibold text-gc-text">{formatAccountingMoney(deliveryFeeAmt)}</span>
                            </div>
                        )}
                    </div>
					<div className="mt-3 flex items-center justify-between pt-1">
                        <span className={`${textScale.micro} font-black uppercase tracking-wider text-gc-text-muted`}>Total</span>
						<DualCurrencyAmount
							amount={checkoutTotal}
							currency={accountingCurrency}
							exchangeRate={exchangeRate}
							locale={manualOrder.locale}
							formatPrimary={formatAccountingMoney}
							layout="stack"
							size="lg"
							align="end"
						/>
                    </div>
                </div>
            )}

			{showCartSubtotal ? (
				<div
					className={cn(
						'gc-order-summary__cart-total flex items-start justify-between gap-3 border-t border-gc-border/80',
						isSheet ? 'gc-order-summary__sheet-total px-3.5 py-3.5' : 'px-4 py-3.5',
					)}
				>
					<div className="min-w-0 pt-0.5">
						<span className={cn(textScale.micro, 'block font-semibold uppercase tracking-wide text-gc-text-muted')}>
							Subtotal
						</span>
					</div>
					<DualCurrencyAmount
						amount={itemsSubtotal}
						currency={accountingCurrency}
						exchangeRate={exchangeRate}
						locale={manualOrder.locale}
						formatPrimary={formatAccountingMoney}
						layout="stack"
						size="md"
						align="end"
					/>
				</div>
			) : null}
        </div>
    );
};

export default React.memo(OrderSummary);
