import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHistoryBack } from '@/modules/cash/hooks/useHistoryBack';

function Ventana({ open, onBack }) {
	useHistoryBack(open, onBack);
	return open ? <div>abierta</div> : null;
}

/** jsdom recorre el historial en una tarea aparte y tarda: esperar a que se note. */
const settled = (check) => vi.waitFor(check, { timeout: 3000, interval: 20 });

describe('useHistoryBack', () => {
	afterEach(async () => {
		cleanup();
		// Que la entrada de la prueba anterior ya se haya quitado antes de la siguiente
		await settled(() => expect(window.history.state?.gcModal).toBeFalsy());
	});

	it('al abrir mete una entrada y el gesto atrás cierra la ventana', async () => {
		const onBack = vi.fn();
		render(<Ventana open onBack={onBack} />);
		const token = window.history.state?.gcModal;
		expect(token).toBeTruthy();

		await act(async () => {
			window.history.back();
			await settled(() => expect(onBack).toHaveBeenCalledTimes(1));
		});
		// La entrada se vuelve a poner por si la ventana no se cierra (p. ej. pregunta primero)
		expect(window.history.state?.gcModal).toBe(token);
	});

	it('si se cierra desde la ventana, quita su entrada sin volver a llamar', async () => {
		const onBack = vi.fn();
		const { rerender } = render(<Ventana open onBack={onBack} />);
		const token = window.history.state?.gcModal;
		expect(token).toBeTruthy();

		await act(async () => {
			rerender(<Ventana open={false} onBack={onBack} />);
		});
		await settled(() => expect(window.history.state?.gcModal).toBeFalsy());
		expect(onBack).not.toHaveBeenCalled();
	});

	it('cerrada no toca el historial', () => {
		const before = window.history.length;
		render(<Ventana open={false} onBack={() => {}} />);
		expect(window.history.length).toBe(before);
		expect(window.history.state?.gcModal).toBeFalsy();
	});
});
