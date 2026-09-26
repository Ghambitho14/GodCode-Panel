import React from 'react';
import { Banknote, CreditCard, Landmark, Split } from 'lucide-react';
import CobroMethodTile from './CobroMethodTile';
import { CobroFieldAction, CobroLine, CobroMoneyField, CobroTender } from './CobroFields';
import { useMoneyDraft } from './useMoneyDraft';

const LEGACY_METHODS = [
	{ type: 'tienda', label: 'Efectivo', Icon: Banknote, evidence: false },
	{ type: 'tarjeta', label: 'Tarjeta', Icon: CreditCard, evidence: false },
	{ type: 'online', label: 'Transferencia', Icon: Landmark, evidence: true },
];

/**
 * Cobro clásico, para pedidos sin líneas de pago V2 (p. ej. los del menú web):
 * un solo método, o efectivo + tarjeta repartidos a mano.
 */
export default function CobroLegacyPanel({
	form,
	dueMinor,
	currency,
	fractionDigits,
	locale,
	cashDenominations,
	toMinor,
	fromMinor,
	formatAccounting,
	formatIn,
	onSelectType,
	onToggleMixed,
	onCashAmount,
	onCardAmount,
	onTendered,
}) {
	const mixed = form.payment_mode === 'mixed';
	const cashMinor = toMinor(form.cash_amount);
	const cardMinor = toMinor(form.card_amount);
	const tenderedMinor = toMinor(form.cash_tendered);
	const moneyOptions = { currency, fractionDigits, locale };

	const cashField = useMoneyDraft({ ...moneyOptions, valueMinor: cashMinor, onChangeMinor: (minor) => onCashAmount(fromMinor(minor)) });
	const cardField = useMoneyDraft({ ...moneyOptions, valueMinor: cardMinor, onChangeMinor: (minor) => onCardAmount(fromMinor(minor)) });
	const tenderField = useMoneyDraft({ ...moneyOptions, valueMinor: tenderedMinor, onChangeMinor: (minor) => onTendered(fromMinor(minor)) });

	const cashDue = mixed ? cashMinor : dueMinor;
	const showTender = mixed ? cashMinor > 0 : form.payment_type === 'tienda';
	const restFor = (otherMinor) => Math.max(0, dueMinor - otherMinor);

	return (
		<>
			<div className="cobro-methods" role="group" aria-label="Métodos de pago">
				{LEGACY_METHODS.map((method) => {
					const selected = !mixed && form.payment_type === method.type;
					return (
						<CobroMethodTile
							key={method.type}
							Icon={method.Icon}
							label={method.label}
							meta={selected ? formatAccounting(dueMinor) : `${currency}${method.evidence ? ' · con comprobante' : ''}`}
							selected={selected}
							onClick={() => onSelectType(selected ? '' : method.type)}
						/>
					);
				})}
				<CobroMethodTile
					Icon={Split}
					label="Dividir pago"
					meta="Efectivo + tarjeta"
					selected={mixed}
					onClick={onToggleMixed}
				/>
			</div>

			{mixed ? (
				<CobroLine>
					<div className="cobro-line__head">
						<span className="cobro-line__icon" aria-hidden><Split size={16} strokeWidth={2} /></span>
						<span className="cobro-line__name">Reparto del pago</span>
						<span className="cobro-line__amount">{formatAccounting(cashMinor + cardMinor)}</span>
					</div>
					<div className="cobro-line__split">
						<CobroMoneyField
							label="Efectivo"
							currency={currency}
							value={cashField.value}
							placeholder="0"
							onChange={cashField.onChange}
							onBlur={cashField.onBlur}
							action={cardMinor > 0 && restFor(cardMinor) !== cashMinor ? (
								<CobroFieldAction
									label="Resto"
									amount={formatAccounting(restFor(cardMinor))}
									onClick={() => onCashAmount(fromMinor(restFor(cardMinor)))}
								/>
							) : null}
						/>
						<CobroMoneyField
							label="Tarjeta"
							currency={currency}
							value={cardField.value}
							placeholder="0"
							onChange={cardField.onChange}
							onBlur={cardField.onBlur}
							action={cashMinor > 0 && restFor(cashMinor) !== cardMinor ? (
								<CobroFieldAction
									label="Resto"
									amount={formatAccounting(restFor(cashMinor))}
									onClick={() => onCardAmount(fromMinor(restFor(cashMinor)))}
								/>
							) : null}
						/>
					</div>
				</CobroLine>
			) : null}

			{showTender ? (
				<CobroLine>
					<div className="cobro-line__head">
						<span className="cobro-line__icon" aria-hidden><Banknote size={16} strokeWidth={2} /></span>
						<span className="cobro-line__name">Efectivo</span>
						<span className="cobro-line__amount">{formatAccounting(cashDue)}</span>
					</div>
					<CobroTender
						dueMinor={cashDue}
						tenderedMinor={tenderedMinor > 0 ? tenderedMinor : null}
						currency={currency}
						fractionDigits={fractionDigits}
						locale={locale}
						denominations={cashDenominations?.[currency]}
						formatIn={formatIn}
						field={tenderField}
						onPick={(minor) => onTendered(fromMinor(minor))}
					/>
				</CobroLine>
			) : null}
		</>
	);
}
