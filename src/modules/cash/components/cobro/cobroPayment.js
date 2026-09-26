import { ArrowLeftRight, Banknote, CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';
import { isoFractionDigits, majorToMinor, minorToMajor } from '@/lib/money/minor-units';
import { toAmountInputValue } from '@/shared/utils/money';
import { settlementToAccountingMinor } from '../../domain/payment-methods';

const METHOD_ICON_BY_ID = {
	pago_movil: Smartphone,
	bank_transfer: Landmark,
	zelle: ArrowLeftRight,
	paypal: Wallet,
};

const METHOD_ICON_BY_RAIL = {
	cash: Banknote,
	card: CreditCard,
	online: Wallet,
};

/** Icono de un método configurado: primero por id conocido, luego por riel. */
export function methodIcon(method) {
	return METHOD_ICON_BY_ID[method?.id] ?? METHOD_ICON_BY_RAIL[method?.rail] ?? Wallet;
}

/**
 * Separa "USD 24,00" en código y cifra para poder darles pesos distintos sin
 * volver a formatear: el orden lo decide el locale, no la interfaz.
 * @param {string} text
 * @param {string} currency
 * @returns {{ code: string | null, value: string, codeFirst: boolean }}
 */
export function splitMoneyText(text, currency) {
	const source = String(text ?? '');
	const code = String(currency ?? '').toUpperCase();
	const index = code ? source.indexOf(code) : -1;
	if (index < 0) return { code: null, value: source, codeFirst: true };
	// trim() también quita los espacios duros (U+00A0, U+202F) que mete Intl.
	const value = `${source.slice(0, index)}${source.slice(index + code.length)}`.trim();
	return { code, value, codeFirst: index === 0 };
}

/** Texto editable para un monto guardado en unidades mínimas ("24,00" en es-VE). */
export function minorToInputText(minor, { currency, fractionDigits, locale }) {
	const value = Number(minor);
	if (!(value > 0)) return '';
	return toAmountInputValue(minorToMajor(value, currency, fractionDigits), { locale, fractionDigits });
}

/**
 * Lo que el cliente suele entregar para un monto: el siguiente múltiplo de cada
 * billete configurado. Para 24 con billetes de 1/5/10/20/50/100 da 25, 30, 40,
 * 50 y 100; el exacto va aparte.
 * @param {number} dueMinor
 * @param {number[]} denominations Billetes en unidades mayores.
 * @param {{ currency: string, fractionDigits?: number }} options
 * @returns {number[]}
 */
export function suggestTenderMinors(dueMinor, denominations, { currency, fractionDigits }) {
	if (!(Number(dueMinor) > 0) || !Array.isArray(denominations)) return [];
	const seen = new Set([Number(dueMinor)]);
	const suggestions = [];
	for (const bill of denominations) {
		let billMinor;
		try {
			billMinor = majorToMinor(Number(bill), currency, fractionDigits);
		} catch {
			continue;
		}
		if (!(billMinor > 0)) continue;
		const next = Math.ceil(dueMinor / billMinor) * billMinor;
		if (seen.has(next)) continue;
		seen.add(next);
		suggestions.push(next);
	}
	return suggestions.sort((a, b) => a - b).slice(0, 5);
}

/**
 * Monto en la moneda del método que, convertido con la tasa configurada, da
 * exactamente `targetAccountingMinor`. Devuelve null si la tasa no sirve o si
 * ningún candidato cercano cuadra (redondeos con tasas menores que 1).
 */
export function settlementMinorFor(targetAccountingMinor, { accountingCurrency, settlementCurrency, exchangeRate }) {
	const rate = Number(exchangeRate);
	if (!(targetAccountingMinor > 0) || !Number.isFinite(rate) || rate <= 0) return null;
	let accountingDigits;
	let settlementDigits;
	try {
		accountingDigits = isoFractionDigits(accountingCurrency);
		settlementDigits = isoFractionDigits(settlementCurrency);
	} catch {
		return null;
	}
	const guess = Math.round(targetAccountingMinor * rate * 10 ** (settlementDigits - accountingDigits));
	for (const candidate of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
		if (!(candidate > 0)) continue;
		try {
			if (settlementToAccountingMinor(candidate, settlementCurrency, accountingCurrency, exchangeRate) === targetAccountingMinor) {
				return candidate;
			}
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Estado del cobro con líneas de pago (Pedidos V2).
 *
 * `message` va junto al total (qué pasa con el saldo) y `hint` sobre el botón
 * (qué falta para poder registrar). Tonos: idle, progress, ready, error.
 */
export function summarizeLinesPayment({ pl, dueMinor, formatAccounting, formatIn, requiresEvidence, hasEvidence }) {
	const { lines, methods, validation, remainingMinor, currency } = pl;
	const methodById = new Map(methods.map((method) => [method.id, method]));
	const segments = lines
		.map((line) => ({
			key: line.id,
			minor: Math.max(0, Number(line.amountMinor) || 0),
			label: methodById.get(line.methodId)?.label ?? '',
		}))
		.filter((segment) => segment.minor > 0);

	if (methods.length === 0) {
		return {
			tone: 'error',
			message: 'Sin métodos de pago',
			hint: 'No hay métodos de pago habilitados para esta sucursal. Configúralos desde el SaaS antes de registrar el cobro.',
			segments,
		};
	}
	if (lines.length === 0) {
		return {
			tone: 'idle',
			message: `Falta ${formatAccounting(dueMinor)}`,
			hint: 'Elige un método de pago para continuar.',
			segments,
		};
	}

	const lineError = validation.errors.find((error) => error.code !== 'total_mismatch');
	if (lineError) {
		const line = lines.find((candidate) => candidate.id === lineError.lineId);
		const method = methodById.get(line?.methodId ?? lineError.methodId);
		const label = method?.label ?? 'este método';
		switch (lineError.code) {
			case 'invalid_amount':
				return {
					tone: 'progress',
					message: remainingMinor > 0 ? `Falta ${formatAccounting(remainingMinor)}` : `Sin monto en ${label}`,
					hint: `Indica cuánto se cobra con ${label} o quítalo.`,
					segments,
				};
			case 'insufficient_tender':
				return {
					tone: 'progress',
					message: 'El efectivo recibido no alcanza',
					hint: 'Indica cuánto entregó el cliente: debe cubrir lo que paga en efectivo.',
					segments,
				};
			case 'exchange_rate_required':
				return {
					tone: 'error',
					message: `Falta la tasa ${method?.currency ?? ''}/${currency}`.trim(),
					hint: `Configura la tasa de cambio de la sucursal para cobrar con ${label}.`,
					segments,
				};
			case 'conversion_mismatch':
				return {
					tone: 'progress',
					message: `Revisa el monto de ${label}`,
					hint: 'El monto no coincide con la tasa configurada.',
					segments,
				};
			case 'mixed_payment_not_allowed':
				return {
					tone: 'error',
					message: `${label} no admite pago combinado`,
					hint: `Cobra todo con ${label} o quita los otros métodos.`,
					segments,
				};
			default:
				return {
					tone: 'error',
					message: 'Método no disponible',
					hint: 'Quita el método que ya no está habilitado en la sucursal.',
					segments,
				};
		}
	}

	if (!validation.valid) {
		return remainingMinor > 0
			? {
				tone: 'progress',
				message: `Falta ${formatAccounting(remainingMinor)}`,
				hint: `Los montos deben sumar ${formatAccounting(dueMinor)}.`,
				segments,
			}
			: {
				tone: 'error',
				message: `Sobra ${formatAccounting(Math.abs(remainingMinor))}`,
				hint: `Los montos deben sumar ${formatAccounting(dueMinor)}.`,
				segments,
			};
	}

	const withChange = validation.lines.find((line) => Number(line.changeAmountMinor) > 0);
	return {
		tone: 'ready',
		message: 'Cuadra exacto',
		detail: withChange ? `Vuelto ${formatIn(withChange.changeAmountMinor, withChange.tenderedCurrency)}` : null,
		hint: requiresEvidence && !hasEvidence ? 'Adjunta el comprobante para registrar el pago.' : null,
		segments,
	};
}

/**
 * Estado del cobro clásico (pedidos sin líneas V2): un método, o efectivo +
 * tarjeta repartidos a mano.
 */
export function summarizeLegacyPayment({ form, dueMinor, toMinor, formatAccounting, requiresEvidence, hasEvidence }) {
	const mixed = form.payment_mode === 'mixed';
	const type = String(form.payment_type ?? '').toLowerCase();
	const cashMinor = toMinor(form.cash_amount);
	const cardMinor = toMinor(form.card_amount);
	const tenderedMinor = toMinor(form.cash_tendered);

	if (!mixed && !['tienda', 'tarjeta', 'online'].includes(type)) {
		return {
			tone: 'idle',
			message: `Falta ${formatAccounting(dueMinor)}`,
			hint: 'Elige un método de pago para continuar.',
			segments: [],
		};
	}

	if (mixed) {
		const segments = [
			{ key: 'cash', minor: cashMinor, label: 'Efectivo' },
			{ key: 'card', minor: cardMinor, label: 'Tarjeta' },
		].filter((segment) => segment.minor > 0);
		const diff = dueMinor - cashMinor - cardMinor;
		if (diff > 0) {
			return {
				tone: 'progress',
				message: `Falta ${formatAccounting(diff)}`,
				hint: `Efectivo y tarjeta deben sumar ${formatAccounting(dueMinor)}.`,
				segments,
			};
		}
		if (diff < 0) {
			return {
				tone: 'error',
				message: `Sobra ${formatAccounting(-diff)}`,
				hint: `Efectivo y tarjeta deben sumar ${formatAccounting(dueMinor)}.`,
				segments,
			};
		}
		if (cashMinor > 0 && tenderedMinor < cashMinor) {
			return {
				tone: 'progress',
				message: 'Falta confirmar el efectivo',
				hint: 'Indica cuánto entregó el cliente en efectivo.',
				segments,
			};
		}
		const change = cashMinor > 0 ? tenderedMinor - cashMinor : 0;
		return {
			tone: 'ready',
			message: 'Cuadra exacto',
			detail: change > 0 ? `Vuelto ${formatAccounting(change)}` : null,
			hint: null,
			segments,
		};
	}

	const segments = [{ key: type, minor: dueMinor, label: type }];
	if (type === 'tienda') {
		if (tenderedMinor < dueMinor) {
			return {
				tone: 'progress',
				message: 'Falta confirmar el efectivo',
				hint: 'Indica cuánto entregó el cliente: debe cubrir el total.',
				segments,
			};
		}
		const change = tenderedMinor - dueMinor;
		return {
			tone: 'ready',
			message: 'Cuadra exacto',
			detail: change > 0 ? `Vuelto ${formatAccounting(change)}` : null,
			hint: null,
			segments,
		};
	}
	return {
		tone: 'ready',
		message: 'Cuadra exacto',
		detail: null,
		hint: requiresEvidence && !hasEvidence ? 'Adjunta el comprobante para registrar el pago.' : null,
		segments,
	};
}
