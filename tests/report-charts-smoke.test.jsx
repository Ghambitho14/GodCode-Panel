import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('recharts', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		ResponsiveContainer: ({ children }) => (
			<actual.ResponsiveContainer width={800} height={400}>
				{children}
			</actual.ResponsiveContainer>
		),
	};
});

import ReportSalesChart from '@/modules/cash/components/charts/ReportSalesChart';
import ReportPaymentDonut from '@/modules/cash/components/charts/ReportPaymentDonut';
import ReportSparkline from '@/modules/cash/components/charts/ReportSparkline';
import ReportTopProductsChart from '@/modules/cash/components/charts/ReportTopProductsChart';

describe('report charts smoke test', () => {
	it('renders ReportSalesChart area with Recharts', () => {
		const { container } = render(
			<div style={{ width: 800, height: 400 }}>
				<ReportSalesChart
					points={[
						{ key: '2024-01-01', label: '1 ene', sales: 10000, expenses: 1000 },
						{ key: '2024-01-02', label: '2 ene', sales: 15000, expenses: 2000 },
					]}
					kind="area"
					currency="CLP"
					height={400}
				/>
			</div>,
		);
		expect(container.querySelector('.recharts-surface')).not.toBeNull();
		expect(screen.getByText('1 ene')).toBeTruthy();
		expect(screen.getByText('2 ene')).toBeTruthy();
	});

	it('renders ReportPaymentDonut with Recharts', () => {
		const { container } = render(
			<ReportPaymentDonut
				data={[
					{ label: 'Efectivo', value: 30000 },
					{ label: 'Tarjeta', value: 20000 },
					{ label: 'Transferencia', value: 10000 },
				]}
				currency="CLP"
			/>,
		);
		expect(container.querySelector('.recharts-surface')).not.toBeNull();
		expect(screen.getByText(/Efectivo/)).toBeTruthy();
	});

	it('renders ReportSparkline with positive trend color', () => {
		const { container } = render(
			<div style={{ width: 200, height: 40 }}>
				<ReportSparkline values={[1, 2, 3, 4, 5]} trend={12} showTrend height={40} />
			</div>,
		);
		expect(container.querySelector('.recharts-surface')).not.toBeNull();
		const stroke = container.querySelector('.recharts-line path, .recharts-line .recharts-curve')?.getAttribute('stroke');
		expect(stroke).toBe('#16a34a');
	});

	it('renders ReportSparkline with negative trend color', () => {
		const { container } = render(
			<div style={{ width: 200, height: 40 }}>
				<ReportSparkline values={[5, 4, 3]} trend={-8} showTrend height={40} />
			</div>,
		);
		const stroke = container.querySelector('.recharts-line path, .recharts-line .recharts-curve')?.getAttribute('stroke');
		expect(stroke).toBe('#dc2626');
	});

	it('renders ReportSparkline single value as dot', () => {
		const { container } = render(
			<div style={{ width: 200, height: 40 }}>
				<ReportSparkline values={[5]} trend={0} showTrend height={40} />
			</div>,
		);
		expect(container.querySelector('.recharts-surface')).toBeNull();
		expect(container.querySelector('[style*="border-radius: 9999px"]') || container.querySelector('[style*="border-radius"]')).not.toBeNull();
	});

	it('renders ReportTopProductsChart', () => {
		render(
			<ReportTopProductsChart
				products={[
					{ name: 'Producto A', qty: 100, revenue: 50000 },
					{ name: 'Producto B', qty: 60, revenue: 30000 },
				]}
				currency="CLP"
				height={200}
			/>,
		);
		expect(screen.getByText('Producto A')).toBeTruthy();
	});
});
