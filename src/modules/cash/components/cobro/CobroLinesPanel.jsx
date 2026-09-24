import React from 'react';
import { isoFractionDigits } from '@/lib/money/minor-units';
import CobroMethodTile from './CobroMethodTile';
import { CobroFieldAction, CobroLine, CobroMoneyField, CobroTender } from './CobroFields';
import { methodIcon, minorToInputText, settlementMinorFor } from './cobroPayment';

function formatRate(rate, locale) {
	const value = Number(rate);
	if (!Number.isFinite(value) || value <= 0) return String(rate ?? '');
	return value.toLocaleString(locale, { maximumFractionDigits: 6 });
}

function LineEditor({ line, method, Icon, pl, split, cashDenominations, formatIn, formatAccounting }) {
	const foreign = method.currency !== pl.currency;
	const isCash = method.rail === 'cash';
	const showAmount = split || foreign;
	if (!showAmount && !isCash) return null;

	const methodDigits = foreign ? isoFractionDigits(method.currency) : pl.fractionDigits;
	const moneyOptions = { currency: method.currency, fractionDigits: methodDigits, locale: pl.locale };
	const methodAmountMinor = foreign ? Number(line.settlementAmountMinor) || 0 : Number(line.amountMinor) || 0;

	/* Solo la línea que sigue en cero ofrece completar con lo que falta: en una
	   línea que ya tiene monto, "resto" no dice de qué parte del pago. */
	let fillAction = null;
	if (methodAmountMinor <= 0 && pl.remainingMinor > 0) {
		if (foreign) {
			const settlement = settlementMinorFor(pl.remainingMinor, {
				accountingCurrency: pl.currency,
				settlementCurrency: method.currency,
				exchangeRate: pl.exchangeRate,
			});
			if (settlement) {
				fillAction = (
					<CobroFieldAction
						label={split ? 'Resto' : 'Total'}
						amount={formatIn(settlement, method.currency)}
						onClick={() => pl.setSettlementMinor(line, method, settlement)}
					/>
				);
			}
		} else {
			fillAction = (
				<CobroFieldAction
					label="Resto"
					amount={formatAccounting(pl.remainingMinor)}
					onClick={() => pl.setAccountingMinor(line, pl.remainingMinor)}
				/>
			);
		}
	}

	const amountValue = line.id in pl.amountDrafts
		? pl.amountDrafts[line.id]
		: minorToInputText(methodAmountMinor, moneyOptions);
	const tenderedValue = line.id in pl.tenderedDrafts
		? pl.tenderedDrafts[line.id]
		: minorToInputText(line.tenderedAmountMinor, moneyOptions);

	return (
		<CobroLine>
			<div className="cobro-line__head">
				<span className="cobro-line__icon" aria-hidden><Icon size={16} strokeWidth={2} /></span>
				<span className="cobro-line__name">{method.label}</span>
				<span className="cobro-line__amount">{formatAccounting(Number(line.amountMinor) || 0)}</span>
			</div>
			{showAmount ? (
				<CobroMoneyField
					label={foreign ? `Monto en ${method.currency}` : 'Monto'}
					currency={method.currency}
					value={amountValue}
					placeholder="0"
					action={fillAction}
					onChange={(raw) => (foreign
						? pl.updateSettlementAmount(line, method, raw)
						: pl.updateAccountingAmount(line, raw))}
					onBlur={() => pl.clearAmountDraft(line.id)}
				/>
			) : null}
			{foreign ? (
				<p className="cobro-line__note">
					Tasa {formatRate(pl.exchangeRate, pl.locale)} {method.currency} por {pl.currency}
				</p>
			) : null}
			{isCash ? (
				<CobroTender
					dueMinor={methodAmountMinor}
					tenderedMinor={line.tenderedAmountMinor ?? null}
					currency={method.currency}
					fractionDigits={methodDigits}
					locale={pl.locale}
					denominations={cashDenominations?.[method.currency]}
					formatIn={formatIn}
					field={{
						value: tenderedValue,
						onChange: (raw) => pl.updateTenderedAmount(line, method, raw),
						onBlur: () => pl.clearTenderedDraft(line.id),
					}}
					onPick={(minor) => pl.setTenderedMinor(line, method, minor)}
				/>
			) : null}
		</CobroLine>
	);
}

/**
 * Cobro con los métodos configurados en la sucursal (Pedidos V2). Tocar varios
 * métodos reparte el pago; el primero se lleva el saldo completo.
 */
export default function CobroLinesPanel({ pl, cashDenominations, formatIn, formatAccounting }) {
	const { methods, lines, currency, exchangeRate, quote } = pl;
	const split = lines.length > 1;

	return (
		<>
			<div className="cobro-methods" role="group" aria-label="Métodos de pago">
				{methods.map((method) => {
					const line = lines.find((candidate) => candidate.methodId === method.id);
					const selected = Boolean(line);
					const conversionMissing = method.currency !== currency && !exchangeRate;
					const disabledReason = !quote
						? 'Sin cotización'
						: conversionMissing
							? `Falta la tasa ${method.currency}/${currency}`
							: null;
					const evidence = method.evidencePolicy === 'required' ? ' · con comprobante' : '';
					const meta = selected
						? (Number(line.amountMinor) > 0 ? formatAccounting(Number(line.amountMinor)) : 'Indica el monto')
						: `${method.currency}${evidence}`;
					return (
						<CobroMethodTile
							key={method.id}
							Icon={methodIcon(method)}
							label={method.label}
							meta={meta}
							selected={selected}
							disabledReason={selected ? null : disabledReason}
							onClick={() => pl.toggleMethod(method)}
						/>
					);
				})}
			</div>
			{lines.map((line) => {
				const method = methods.find((candidate) => candidate.id === line.methodId);
				if (!method) return null;
				return (
					<LineEditor
						key={line.id}
						line={line}
						method={method}
						Icon={methodIcon(method)}
						pl={pl}
						split={split}
						cashDenominations={cashDenominations}
						formatIn={formatIn}
						formatAccounting={formatAccounting}
					/>
				);
			})}
		</>
	);
}
