import { describe, expect, it } from 'vitest';
import {
	bumpLoadGeneration,
	createLoadGenerationRef,
	isLoadGenerationCurrent,
} from '@/modules/cash/admin/hooks/loadGeneration';

describe('loadGeneration', () => {
	it('bump incrementa y isLoadGenerationCurrent valida la generación vigente', () => {
		const ref = createLoadGenerationRef();
		expect(ref.current).toBe(0);

		const gen1 = bumpLoadGeneration(ref);
		expect(gen1).toBe(1);
		expect(isLoadGenerationCurrent(ref, gen1)).toBe(true);

		bumpLoadGeneration(ref);
		expect(isLoadGenerationCurrent(ref, gen1)).toBe(false);
		expect(isLoadGenerationCurrent(ref, ref.current)).toBe(true);
	});

	it('cambio rápido de sucursal invalida respuestas de generación anterior', async () => {
		const ref = createLoadGenerationRef();
		const genA = bumpLoadGeneration(ref);
		bumpLoadGeneration(ref);
		const genB = ref.current;

		const staleResult = isLoadGenerationCurrent(ref, genA);
		const freshResult = isLoadGenerationCurrent(ref, genB);

		expect(staleResult).toBe(false);
		expect(freshResult).toBe(true);
	});
});
