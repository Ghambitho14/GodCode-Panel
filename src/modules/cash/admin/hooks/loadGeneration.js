/**
 * Guard de generación para cargas async al cambiar sucursal/empresa.
 * Incrementá `bump()` al cambiar contexto; compará con `isCurrent(gen)` antes de setState.
 */
export function createLoadGenerationRef() {
	return { current: 0 };
}

/** @param {{ current: number }} ref */
export function bumpLoadGeneration(ref) {
	ref.current += 1;
	return ref.current;
}

/** @param {{ current: number }} ref @param {number} generation */
export function isLoadGenerationCurrent(ref, generation) {
	return ref.current === generation;
}
