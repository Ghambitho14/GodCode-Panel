import { useCallback, useState } from 'react';
import { ADMIN_SHELL_COMPACT_MAX } from '../constants/responsive';

/**
 * Posicion de los popover que cuelgan de la cabecera del panel (campana de
 * notificaciones, control de sonido de pedidos).
 *
 * En pantalla compacta el popover ocupa el ancho disponible con margenes
 * simetricos; en escritorio se ancla al borde derecho del disparador.
 *
 * Estaba duplicada palabra por palabra en AdminNotificationCenter y en
 * OrderNotificationSoundControl.
 *
 * @param {{ current: HTMLElement | null }} triggerRef boton que abre el popover
 * @returns {{ pos: object | null, updatePos: () => void, setPos: Function }}
 */
/**
 * Alto de la barra de estado cuando la app corre instalada con la barra
 * translucida (apple-mobile-web-app-status-bar-style=black-translucent): ahi el
 * contenido empieza debajo del reloj. Se lee de la variable que define
 * pwa-standalone.css; en navegador normal no existe y vale 0.
 */
function safeTopInset() {
	if (typeof window === 'undefined') return 0;
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue('--pwa-safe-top')
		.trim();
	const n = Number.parseFloat(raw);
	return Number.isFinite(n) ? n : 0;
}

export function useHeaderPopoverPosition(triggerRef) {
	const [pos, setPos] = useState(null);

	const updatePos = useCallback(() => {
		if (typeof window === 'undefined') return;
		const trigger = triggerRef.current;
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const vv = window.visualViewport;
		const viewportWidth = vv?.width ?? window.innerWidth;
		const offsetLeft = vv?.offsetLeft ?? 0;

		if (viewportWidth <= ADMIN_SHELL_COMPACT_MAX) {
			setPos({
				// El tope de 54px se medía desde el borde fisico de la pantalla:
				// en la app instalada eso cae sobre la barra de estado.
				top: Math.max(54 + safeTopInset(), r.bottom + 8),
				left: 12,
				right: 12,
				maxWidth: 400,
				width: 'auto',
				margin: '0 auto',
			});
			return;
		}

		setPos({
			top: r.bottom + 10,
			right: Math.max(16, viewportWidth + offsetLeft - r.right),
			left: 'auto',
			width: 380,
			maxWidth: 400,
			margin: 0,
		});
	}, [triggerRef]);

	return { pos, updatePos, setPos };
}
