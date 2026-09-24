import { useEffect, useRef } from 'react';

/**
 * Trae a la vista un bloque que aparece por una acción del cajero (la línea de
 * un método recién elegido, el comprobante): sin esto quedaba bajo el pie fijo
 * y parecía que tocar el método no había hecho nada.
 */
export function useRevealOnMount() {
	const ref = useRef(null);
	useEffect(() => {
		const element = ref.current;
		if (!element?.scrollIntoView) return;
		const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		element.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
	}, []);
	return ref;
}
