import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';

const BRANCHES = [
	{ id: 'b1', name: 'Centro', company_id: 'co1', currency: 'CLP' },
	{ id: 'b2', name: 'Norte', company_id: 'co1', currency: 'ARS' },
];

const fetchBranchesMock = vi.fn();

vi.mock('@/integrations/supabase', () => {
	const order = () => Promise.resolve({ data: fetchBranchesMock(), error: null });
	const eq = () => ({ order });
	const select = () => ({ eq });
	const from = () => ({ select });
	const channel = () => {
		const ch = { on: () => ch, subscribe: () => ch };
		return ch;
	};
	return {
		supabase: { from, channel, removeChannel: () => {} },
		TABLES: { branches: 'branches' },
	};
});

import { LocationProvider } from '@/modules/cash/context/LocationContext';
import { useLocation } from '@/modules/cash/context/useLocation';

function Consumer() {
	const { selectedBranch, allBranches, loadingBranches, selectBranch, refetchBranches } = useLocation();
	return (
		<div>
			<span data-testid="selected">{selectedBranch?.id ?? 'none'}</span>
			<span data-testid="currency">{selectedBranch?.currency ?? 'none'}</span>
			<span data-testid="count">{allBranches.length}</span>
			<span data-testid="loading">{String(loadingBranches)}</span>
			<button type="button" onClick={() => selectBranch(BRANCHES[1])}>pick-norte</button>
			<button type="button" onClick={() => void refetchBranches()}>refetch</button>
		</div>
	);
}

describe('LocationContext (fuente única de sucursal)', () => {
	beforeEach(() => {
		window.localStorage.clear();
		fetchBranchesMock.mockReset();
		fetchBranchesMock.mockReturnValue(BRANCHES);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('selectBranch persiste la sucursal slim bajo la key unificada y no toca la legacy', async () => {
		render(
			<LocationProvider companyId="co1">
				<Consumer />
			</LocationProvider>,
		);

		await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

		await act(async () => {
			screen.getByText('pick-norte').click();
		});

		expect(screen.getByTestId('selected').textContent).toBe('b2');
		expect(screen.getByTestId('currency').textContent).toBe('ARS');

		const stored = JSON.parse(window.localStorage.getItem('godcode-selectedBranch:co1'));
		expect(stored.id).toBe('b2');
		// La key legacy del panel ya no se escribe desde el contexto unificado.
		expect(window.localStorage.getItem('godcode-panel:co1:branchId')).toBeNull();
	});

	it('hidrata la sucursal inicial desde la key unificada', async () => {
		window.localStorage.setItem(
			'godcode-selectedBranch:co1',
			JSON.stringify({ id: 'b1', name: 'Centro', company_id: 'co1', currency: 'CLP' }),
		);

		render(
			<LocationProvider companyId="co1">
				<Consumer />
			</LocationProvider>,
		);

		expect(screen.getByTestId('selected').textContent).toBe('b1');
		await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
	});

	it('refetchBranches vuelve a consultar las sucursales', async () => {
		render(
			<LocationProvider companyId="co1">
				<Consumer />
			</LocationProvider>,
		);

		await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
		expect(fetchBranchesMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			screen.getByText('refetch').click();
		});

		await waitFor(() => expect(fetchBranchesMock).toHaveBeenCalledTimes(2));
	});
});
