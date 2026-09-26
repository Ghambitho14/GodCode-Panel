import { useState } from 'react';
import { parseMoneyInput, minorToMajor } from '@/lib/money/minor-units';
import { settlementToAccountingMinor, validatePaymentLines } from '../../domain/payment-methods';

function omitKey(record, key) {
	if (!(key in record)) return record;
	const next = { ...record };
	delete next[key];
	return next;
}

/**
 * Estado y acciones de las líneas de pago de Pedidos V2.
 *
 * Lo usan el paso Pago del pedido manual y el modal de Cobro. Cada uno pinta su
 * propia interfaz, pero repartir el monto entre métodos, convertir a la moneda
 * contable y registrar el efectivo recibido tiene que comportarse igual en los
 * dos: con la lógica duplicada, un arreglo en uno dejaba al otro cobrando
 * distinto.
 *
 * @param {{
 *   manualOrder: Record<string, any>,
 *   updatePaymentLines: (lines: Array<Record<string, any>>) => void,
 *   branchDeliveryCfg?: { exchangeRate?: unknown } | null,
 * }} params
 */
export function usePaymentLines({ manualOrder, updatePaymentLines, branchDeliveryCfg }) {
	const methods = manualOrder.paymentMethods ?? [];
	const lines = manualOrder.payment_lines ?? [];
	const quote = manualOrder.quote;
	const currency = manualOrder.currency;
	const fractionDigits = manualOrder.fractionDigits;
	const locale = manualOrder.locale;
	const exchangeRate = String(branchDeliveryCfg?.exchangeRate ?? '');
	const validation = quote
		? validatePaymentLines(lines, quote, methods)
		: { valid: false, paidMinor: 0, errors: [], lines: [] };
	const remainingMinor = quote ? Number(quote.totalMinor) - Number(validation.paidMinor || 0) : 0;
	const [amountDrafts, setAmountDrafts] = useState({});
	const [tenderedDrafts, setTenderedDrafts] = useState({});

	const clearAmountDraft = (lineId) => setAmountDrafts((prev) => omitKey(prev, lineId));
	const clearTenderedDraft = (lineId) => setTenderedDrafts((prev) => omitKey(prev, lineId));

	const updateLine = (id, patch) => updatePaymentLines(lines.map((line) => line.id === id ? { ...line, ...patch } : line));

	const toggleMethod = (method) => {
		const existing = lines.find((line) => line.methodId === method.id);
		if (existing) {
			clearAmountDraft(existing.id);
			clearTenderedDraft(existing.id);
			updatePaymentLines(lines.filter((line) => line.id !== existing.id));
			return;
		}
		const sameCurrency = method.currency === currency;
		const allocatedMinor = sameCurrency ? Math.max(0, remainingMinor) : 0;
		updatePaymentLines([...lines, {
			id: crypto.randomUUID(), methodId: method.id, rail: method.rail,
			amountMinor: allocatedMinor,
			currency,
			evidencePolicy: method.evidencePolicy,
			settlementTrigger: method.settlementTrigger,
			...(method.rail === 'cash' && sameCurrency ? { tenderedCurrency: currency } : {}),
			...(sameCurrency ? {} : { settlementAmountMinor: 0, settlementCurrency: method.currency, exchangeRate }),
		}]);
	};

	/* Al subir el monto de una línea de efectivo por encima de lo recibido, lo
	   recibido sube con él: nadie entrega menos de lo que se le cobra. */
	const accountingPatch = (line, minor) => ({
		amountMinor: minor,
		...(line.rail === 'cash' && Number(line.tenderedAmountMinor || 0) < minor ? { tenderedAmountMinor: minor } : {}),
	});

	const settlementPatch = (line, method, minor) => {
		try {
			return {
				settlementAmountMinor: minor,
				settlementCurrency: method.currency,
				exchangeRate,
				amountMinor: settlementToAccountingMinor(minor, method.currency, currency, exchangeRate),
				...(line.rail === 'cash' && Number(line.tenderedAmountMinor || 0) < minor ? { tenderedAmountMinor: minor, tenderedCurrency: method.currency } : {}),
			};
		} catch {
			return { settlementAmountMinor: minor, amountMinor: 0, exchangeRate: '' };
		}
	};

	const updateAccountingAmount = (line, raw) => {
		setAmountDrafts((prev) => ({ ...prev, [line.id]: raw }));
		if (String(raw ?? '').trim() === '') {
			updateLine(line.id, {
				amountMinor: 0,
				...(line.rail === 'cash' ? { tenderedAmountMinor: 0 } : {}),
			});
			return;
		}
		const parsed = parseMoneyInput(raw, { currency, fractionDigits, locale });
		if (parsed.valid) updateLine(line.id, accountingPatch(line, parsed.minor));
	};

	const updateSettlementAmount = (line, method, raw) => {
		setAmountDrafts((prev) => ({ ...prev, [line.id]: raw }));
		if (String(raw ?? '').trim() === '') {
			updateLine(line.id, {
				settlementAmountMinor: 0,
				amountMinor: 0,
				...(line.rail === 'cash' ? { tenderedAmountMinor: 0 } : {}),
			});
			return;
		}
		const parsed = parseMoneyInput(raw, { currency: method.currency, locale });
		if (!parsed.valid) return;
		updateLine(line.id, settlementPatch(line, method, parsed.minor));
	};

	const updateTenderedAmount = (line, method, raw) => {
		const tenderCurrency = method.currency;
		setTenderedDrafts((prev) => ({ ...prev, [line.id]: raw }));
		if (String(raw ?? '').trim() === '') {
			updateLine(line.id, { tenderedAmountMinor: 0, tenderedCurrency: tenderCurrency });
			return;
		}
		const parsed = parseMoneyInput(raw, { currency: tenderCurrency, locale });
		if (parsed.valid) updateLine(line.id, { tenderedAmountMinor: parsed.minor, tenderedCurrency: tenderCurrency });
	};

	/** Atajo de billete: el valor llega en unidades mayores de la moneda del método. */
	const applyTenderedAmount = (line, method, amount) => {
		const foreign = method.currency !== currency;
		const parsed = parseMoneyInput(String(amount), {
			currency: method.currency,
			locale,
			fractionDigits: foreign ? undefined : fractionDigits,
		});
		if (!parsed.valid) return;
		updateLine(line.id, { tenderedAmountMinor: parsed.minor, tenderedCurrency: method.currency });
		clearTenderedDraft(line.id);
	};

	/* Variantes en unidades mínimas para los botones que ya conocen la cifra
	   exacta (resto, exacto, sugeridos): no pasan por texto localizado. */
	const setAccountingMinor = (line, minor) => {
		clearAmountDraft(line.id);
		updateLine(line.id, accountingPatch(line, minor));
	};

	const setSettlementMinor = (line, method, minor) => {
		clearAmountDraft(line.id);
		updateLine(line.id, settlementPatch(line, method, minor));
	};

	const setTenderedMinor = (line, method, minor) => {
		clearTenderedDraft(line.id);
		updateLine(line.id, { tenderedAmountMinor: minor, tenderedCurrency: method.currency });
	};

	const amountDisplayValue = (line, method, foreign) => {
		if (line.id in amountDrafts) return amountDrafts[line.id];
		if (foreign) {
			const major = minorToMajor(line.settlementAmountMinor || 0, method.currency);
			return major === 0 ? '' : String(major);
		}
		const major = minorToMajor(line.amountMinor || 0, currency, fractionDigits);
		return major === 0 ? '' : String(major);
	};

	const tenderedDisplayValue = (line, method) => {
		if (line.id in tenderedDrafts) return tenderedDrafts[line.id];
		if (line.tenderedAmountMinor == null) return '';
		const major = minorToMajor(line.tenderedAmountMinor, method.currency);
		return major === 0 ? '' : String(major);
	};

	return {
		methods,
		lines,
		quote,
		currency,
		fractionDigits,
		locale,
		exchangeRate,
		validation,
		remainingMinor,
		amountDrafts,
		tenderedDrafts,
		toggleMethod,
		updateLine,
		updateAccountingAmount,
		updateSettlementAmount,
		updateTenderedAmount,
		applyTenderedAmount,
		setAccountingMinor,
		setSettlementMinor,
		setTenderedMinor,
		clearAmountDraft,
		clearTenderedDraft,
		amountDisplayValue,
		tenderedDisplayValue,
	};
}
