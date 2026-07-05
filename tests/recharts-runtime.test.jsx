import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ReportSalesChart from '@/modules/cash/components/charts/ReportSalesChart';
import ReportSparkline from '@/modules/cash/components/charts/ReportSparkline';
import ReportPaymentDonut from '@/modules/cash/components/charts/ReportPaymentDonut';

describe('recharts runtime (no mock)', () => {
	it('ReportSalesChart renders in jsdom', () => {
		const { container } = render(
			<div style={{ width: 800, height: 400 }}>
				<ReportSalesChart
					points={[
						{ key: '2024-01-01', label: '1 ene', sales: 10000 },
						{ key: '2024-01-02', label: '2 ene', sales: 15000 },
					]}
					kind="area"
					currency="CLP"
					height={400}
				/>
			</div>,
		);
		expect(container.querySelector('.recharts-surface')).toBeTruthy();
	});

	it('ReportSparkline renders in jsdom', () => {
		const { container } = render(
			<div style={{ width: 200, height: 40 }}>
				<ReportSparkline values={[1, 2, 3]} trend={5} showTrend height={40} />
			</div>,
		);
		expect(container.querySelector('.recharts-surface')).not.toBeNull();
	});

	it('ReportPaymentDonut renders in jsdom', () => {
		const { container } = render(
			<div style={{ width: 300, height: 208 }}>
				<ReportPaymentDonut
					data={[
						{ label: 'Efectivo', value: 30000 },
						{ label: 'Tarjeta', value: 20000 },
					]}
					currency="CLP"
				/>
			</div>,
		);
		expect(container.innerHTML.length).toBeGreaterThan(0);
	});
});
