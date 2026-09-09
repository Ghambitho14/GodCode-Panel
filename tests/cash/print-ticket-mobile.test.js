import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printOrderTicket } from '@/modules/cash/admin/printing/printOrderTicket';

const order = {
	id: 1,
	order_number: 1,
	items: [{ name: 'Pizza', quantity: 1, price: 10 }],
	total: 10,
	currency: 'USD',
	created_at: '2026-01-01T12:00:00Z',
};

/** matchMedia no existe en jsdom: se declara por consulta. */
const stubMatchMedia = (matches) => {
	window.matchMedia = vi.fn().mockImplementation((query) => ({
		matches: Boolean(matches[query]),
		media: query,
		addEventListener() {},
		removeEventListener() {},
	}));
};

const iframes = () => document.querySelectorAll('iframe[title="Ticket"]');

describe('impresion de comandas', () => {
	let openSpy;

	beforeEach(() => {
		document.body.innerHTML = '';
		openSpy = vi.spyOn(window, 'open');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	/**
	 * En movil `print()` no bloquea, asi que el `close()` que iba detras del
	 * `window.open` mataba la ventana antes de que saliera el dialogo nativo.
	 * Ademas la PWA instalada bloquea las ventanas emergentes.
	 */
	it('con puntero grueso imprime por iframe y no abre ventana', () => {
		stubMatchMedia({ '(pointer: coarse)': true });
		const ok = printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		expect(ok).toBe(true);
		expect(openSpy).not.toHaveBeenCalled();
		expect(iframes()).toHaveLength(1);
	});

	it('en la PWA instalada tambien va por iframe', () => {
		stubMatchMedia({ '(display-mode: standalone)': true });
		printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		expect(openSpy).not.toHaveBeenCalled();
		expect(iframes()).toHaveLength(1);
	});

	it('en escritorio usa la ventana de vista previa', () => {
		stubMatchMedia({});
		const fakeWin = {
			document: { open() {}, write() {}, close() {}, querySelector: () => null },
			print() {},
			close() {},
		};
		openSpy.mockReturnValue(fakeWin);
		printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		expect(openSpy).toHaveBeenCalledTimes(1);
		expect(iframes()).toHaveLength(0);
	});

	/** Antes devolvia false y solo pedia "permite ventanas emergentes". */
	it('si bloquean la ventana cae al iframe en vez de fallar', () => {
		stubMatchMedia({});
		openSpy.mockReturnValue(null);
		const ok = printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		expect(ok).toBe(true);
		expect(iframes()).toHaveLength(1);
	});
});
