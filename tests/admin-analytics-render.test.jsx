import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LocationProvider } from '@/modules/cash/context/LocationContext';

vi.mock('@/integrations/supabase', () => ({
	supabase: {
		from: () => ({
			select: () => ({
				eq: () => ({
					order: () => Promise.resolve({ data: [], error: null }),
				}),
			}),
		}),
		channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
		removeChannel: vi.fn(),
	},
	TABLES: { branches: 'branches', orders: 'orders', clients: 'clients' },
	bootstrapSession: vi.fn(),
	logout: vi.fn(),
}));

vi.mock('@/shared/subscribeMonitored', () => ({
	subscribeMonitored: () => ({ unsubscribe: vi.fn() }),
	closeMonitoredChannel: vi.fn(),
}));

vi.mock('@/modules/cash/services/cashService', () => ({
	cashService: {
		getManualExpenseMovementsInRange: vi.fn().mockResolvedValue([]),
		getOrderRefundMovementsInRange: vi.fn().mockResolvedValue([]),
	},
}));

vi.mock('@/modules/cash/services/analyticsService', () => ({
	fetchTopProducts: vi.fn().mockResolvedValue([]),
	fetchAnalyticsSummary: vi.fn().mockResolvedValue({ summary: null, error: null, notGranted: false }),
}));

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({
		cashSystem: { activeShift: null, registerRefund: vi.fn() },
		moveOrder: vi.fn(),
		companyProfile: { currency: 'CLP', country: 'CL' },
	}),
}));

import AdminAnalytics from '@/modules/cash/components/AdminAnalytics';

class ProbeBoundary extends React.Component {
	state = { error: null };
	static getDerivedStateFromError(error) {
		return { error };
	}
	render() {
		if (this.state.error) {
			return <div data-testid="probe-error">{String(this.state.error?.message || this.state.error)}</div>;
		}
		return this.props.children;
	}
}

describe('AdminAnalytics mount probe', () => {
	it('renders Reportes without chart crash', async () => {
		render(
			<MemoryRouter>
				<LocationProvider companyId="c1">
					<ProbeBoundary>
						<AdminAnalytics
							orders={[
								{
									id: 'o1',
									total: 12000,
									status: 'completed',
									created_at: new Date().toISOString(),
									branch_id: 'b1',
								},
							]}
							clients={[]}
							branches={[{ id: 'b1', name: 'Sucursal 1' }]}
							showNotify={vi.fn()}
							companyId="c1"
							selectedBranch={{ id: 'b1', name: 'Sucursal 1', company_id: 'c1' }}
							view="full"
						/>
					</ProbeBoundary>
				</LocationProvider>
			</MemoryRouter>,
		);

		const probe = screen.queryByTestId('probe-error');
		expect(probe).toBeNull();
		expect(screen.getByText('Reportes')).toBeTruthy();
	});
});
