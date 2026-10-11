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
		delete window.godcodeDesktop;
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

describe('impresion en la app de escritorio', () => {
	let openSpy;

	/** Lo que expone `desktop/preload.cjs`. */
	const stubDesktop = (printResult = { ok: true }) => {
		const printTicket = vi.fn().mockResolvedValue(printResult);
		window.godcodeDesktop = {
			version: '1.0.0',
			listPrinters: vi.fn().mockResolvedValue([]),
			getConfig: vi.fn().mockResolvedValue({ cashierPrinter: '', kitchenPrinter: null, autoPrint: true }),
			setConfig: vi.fn(),
			printTicket,
		};
		return printTicket;
	};

	beforeEach(() => {
		document.body.innerHTML = '';
		stubMatchMedia({});
		openSpy = vi.spyOn(window, 'open');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete window.godcodeDesktop;
		document.body.innerHTML = '';
	});

	it('manda el ticket a la app: sin ventana de vista previa ni iframe', async () => {
		const printTicket = stubDesktop();
		const ok = printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		expect(ok).toBe(true);
		await vi.waitFor(() => expect(printTicket).toHaveBeenCalledTimes(1));
		expect(printTicket).toHaveBeenCalledWith(expect.objectContaining({ variant: 'kitchen', auto: false }));
		expect(printTicket.mock.calls[0][0].html).toContain('PIZZA');
		expect(openSpy).not.toHaveBeenCalled();
		expect(iframes()).toHaveLength(0);
	});

	it('la impresion automatica de un pedido nuevo llega marcada como auto', async () => {
		const printTicket = stubDesktop();
		printOrderTicket(order, 'Local', null, { variant: 'cashier', auto: true });
		await vi.waitFor(() => expect(printTicket).toHaveBeenCalledTimes(1));
		expect(printTicket).toHaveBeenCalledWith(expect.objectContaining({ variant: 'cashier', auto: true }));
	});

	it('si la impresora no esta, cae al dialogo de siempre', async () => {
		stubDesktop({ ok: false, reason: 'printer-not-found' });
		printOrderTicket(order, 'Local', null, { variant: 'kitchen' });
		await vi.waitFor(() => expect(iframes()).toHaveLength(1));
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('si este equipo no imprime los pedidos nuevos, no muestra el dialogo', async () => {
		const printTicket = stubDesktop({ ok: true, skipped: true });
		printOrderTicket(order, 'Local', null, { variant: 'cashier', auto: true });
		await vi.waitFor(() => expect(printTicket).toHaveBeenCalledTimes(1));
		await Promise.resolve();
		expect(iframes()).toHaveLength(0);
	});
});
