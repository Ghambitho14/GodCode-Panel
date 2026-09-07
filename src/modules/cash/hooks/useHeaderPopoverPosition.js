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
				top: Math.max(54, r.bottom + 8),
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
