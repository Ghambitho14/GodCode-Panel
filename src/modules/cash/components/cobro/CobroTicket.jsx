import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getOrderItemLineTotal, resolveItemKitchenNote } from '@/shared/utils/orderUtils';

/**
 * Detalle del pedido en el Cobro. En pantallas anchas es la columna izquierda,
 * siempre abierta; en una sola columna se pliega para que mande el cobro.
 */
export default function CobroTicket({
	order,
	itemCount,
	subtotal,
	taxTotal,
	deliveryFee,
	discountTotal,
	paidText,
	totalText,
	formatMoney,
}) {
	const [open, setOpen] = useState(false);
	const bodyId = useId();
	const items = order?.items || [];
	const countLabel = `${itemCount} ${itemCount === 1 ? 'ítem' : 'ítems'}`;

	return (
		<aside className="cobro-ticket" data-open={open ? 'true' : 'false'} aria-label="Detalle del pedido">
			<button
				type="button"
				className="cobro-ticket__toggle"
				aria-expanded={open}
				aria-controls={bodyId}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="cobro-ticket__toggle-label">Detalle del pedido</span>
				<span className="cobro-ticket__toggle-meta">{countLabel}</span>
				<ChevronDown size={18} strokeWidth={2} className="cobro-ticket__chevron" aria-hidden />
			</button>
			<div className="cobro-ticket__heading">
				<h3 className="cobro-ticket__title">Detalle del pedido</h3>
				<span className="cobro-ticket__count">{countLabel}</span>
			</div>
			<div id={bodyId} className="cobro-ticket__body">
				{items.length > 0 ? (
					<ul className="cobro-ticket__items">
						{items.map((item, index) => {
							const note = resolveItemKitchenNote(item, order.note);
							return (
								<li key={`${item.line_id ?? item.id ?? index}-${index}`} className="cobro-ticket__item">
									<span className="cobro-ticket__qty">{item.quantity}×</span>
									<span className="cobro-ticket__name">
										{item.name}
										{note ? <span className="cobro-ticket__note">{note}</span> : null}
									</span>
									<span className="cobro-ticket__price">{formatMoney(getOrderItemLineTotal(item))}</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="cobro-ticket__empty">Este pedido no tiene ítems cargados.</p>
				)}
				<dl className="cobro-ticket__totals">
					<div className="cobro-ticket__row">
						<dt>Subtotal</dt>
						<dd>{formatMoney(subtotal)}</dd>
					</div>
					{taxTotal > 0 ? (
						<div className="cobro-ticket__row">
							<dt>Impuesto</dt>
							<dd>{formatMoney(taxTotal)}</dd>
						</div>
					) : null}
					{deliveryFee > 0 ? (
						<div className="cobro-ticket__row">
							<dt>Envío</dt>
							<dd>{formatMoney(deliveryFee)}</dd>
						</div>
					) : null}
					{discountTotal > 0 ? (
						<div className="cobro-ticket__row cobro-ticket__row--credit">
							<dt>Descuento</dt>
							<dd>−{formatMoney(discountTotal)}</dd>
						</div>
					) : null}
					{paidText ? (
						<div className="cobro-ticket__row cobro-ticket__row--credit">
							<dt>Ya pagado</dt>
							<dd>−{paidText}</dd>
						</div>
					) : null}
					<div className="cobro-ticket__row cobro-ticket__row--total">
						<dt>Total del pedido</dt>
						<dd>{totalText}</dd>
					</div>
				</dl>
			</div>
		</aside>
	);
}
