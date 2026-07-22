import { getOrderPaymentBreakdown } from '@/shared/utils/orderUtils';
import { fractionDigitsForCurrency, normalizeCurrencyCode } from '@/shared/utils/money';
import { majorToMinor, minorToMajor } from '@/lib/money/minor-units';

const METHODS = ['cash', 'card', 'online'];
const AMOUNT_TOLERANCE_MINOR = 1;

function orderMoney(order) {
	const currency = normalizeCurrencyCode(order?.currency);
	return { currency, digits: fractionDigitsForCurrency(currency) };
}

function movementMinor(movement, money) {
	if (Number.isSafeInteger(Number(movement?.amount_minor))) return Number(movement.amount_minor);
	return majorToMinor(movement?.amount, money.currency, money.digits);
}

function desiredMinor(order) {
	const money = orderMoney(order);
	if (Array.isArray(order?.payment_lines) && order.payment_lines.length > 0) {
		const totals = { cash: 0, card: 0, online: 0 };
		for (const line of order.payment_lines) {
			if (METHODS.includes(line?.rail)) totals[line.rail] += Number(line.amountMinor ?? line.amount_minor) || 0;
		}
		return { totals, money };
	}
	const legacy = getOrderPaymentBreakdown(order);
	return {
		totals: Object.fromEntries(METHODS.map((method) => [method, majorToMinor(legacy[method], money.currency, money.digits)])),
		money,
	};
}

function sumByType(movements, type, money) {
	return (movements || []).reduce((sum, movement) => movement?.type === type ? sum + movementMinor(movement, money) : sum, 0);
}

function sumByMethod(movements, type, money) {
	const totals = { cash: 0, card: 0, online: 0 };
	for (const movement of movements || []) {
		if (movement?.type === type && METHODS.includes(movement.payment_method)) {
			totals[movement.payment_method] += movementMinor(movement, money);
		}
	}
	return totals;
}

function toMovement(type, amountMinor, method, money) {
	return {
		type,
		amount_minor: amountMinor,
		amount: minorToMajor(amountMinor, money.currency, money.digits),
		currency: money.currency,
		payment_method: method,
	};
}

function hasRegisteredSale(movements, method, expectedMinor, money) {
	const registered = (movements || [])
		.filter((movement) => movement?.type === 'sale' && movement.payment_method === method)
		.reduce((sum, movement) => sum + movementMinor(movement, money), 0);
	return registered > 0 && Math.abs(registered - expectedMinor) <= AMOUNT_TOLERANCE_MINOR;
}

export function planSaleMovements(order, existingMovements = []) {
	const { totals, money } = desiredMinor(order);
	const active = METHODS.filter((method) => totals[method] > 0);
	if (!active.length) return [];
	if (active.length === 1) {
		const method = active[0];
		const expected = Number.isSafeInteger(Number(order?.total_minor)) ? Number(order.total_minor) : totals[method];
		if (expected <= 0 || hasRegisteredSale(existingMovements, method, expected, money)) return [];
		const net = sumByType(existingMovements, 'sale', money) - sumByType(existingMovements, 'expense', money);
		return Math.abs(net - expected) <= AMOUNT_TOLERANCE_MINOR ? [] : [toMovement('sale', expected, method, money)];
	}
	return active
		.filter((method) => !hasRegisteredSale(existingMovements, method, totals[method], money))
		.map((method) => toMovement('sale', totals[method], method, money));
}

export function planSaleResyncMovements(order, existingMovements = []) {
	const { totals: desired, money } = desiredMinor(order);
	const sales = sumByMethod(existingMovements, 'sale', money);
	const refunds = sumByMethod(existingMovements, 'expense', money);
	const movements = [];
	for (const method of METHODS) {
		const current = sales[method] - refunds[method];
		const delta = desired[method] - current;
		if (delta > AMOUNT_TOLERANCE_MINOR) movements.push(toMovement('sale', delta, method, money));
		else if (delta < -AMOUNT_TOLERANCE_MINOR) movements.push(toMovement('expense', -delta, method, money));
	}
	return movements;
}

export function planRefundMovements(order, existingMovements = []) {
	const money = orderMoney(order);
	const sales = sumByMethod(existingMovements, 'sale', money);
	const refunds = sumByMethod(existingMovements, 'expense', money);
	return METHODS
		.map((method) => ({ method, amountMinor: sales[method] - refunds[method] }))
		.filter(({ amountMinor }) => amountMinor > AMOUNT_TOLERANCE_MINOR)
		.map(({ method, amountMinor }) => toMovement('expense', amountMinor, method, money));
}
