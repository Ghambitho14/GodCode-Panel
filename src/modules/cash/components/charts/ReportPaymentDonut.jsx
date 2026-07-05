import React, { memo, useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/shared/utils/money';

const PAYMENT_COLORS = {
	Efectivo: '#16a34a',
	Tarjeta: '#2563eb',
	Transferencia: '#7c3aed',
};

function buildDonutData(data) {
	return (data || [])
		.filter((d) => d && d.value > 0)
		.map((d) => ({
			...d,
			color: PAYMENT_COLORS[d.label] || '#6b7280',
		}));
}

function donutDataKey(data) {
	return (data || []).map((d) => `${d?.label ?? ''}:${d?.value ?? 0}`).join('|');
}

function ReportPaymentDonut({ data = [], currency = 'CLP' }) {
	const dataKey = donutDataKey(data);
	const chartData = useMemo(() => buildDonutData(data), [dataKey]);

	const total = useMemo(
		() => chartData.reduce((acc, curr) => acc + (curr.value || 0), 0),
		[chartData],
	);

	if (total === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-[#6b7280]">
				Sin datos de pagos
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-[#e5e5ea] bg-white p-0">
			<div className="relative h-44 w-full max-w-[280px]">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={chartData}
							cx="50%"
							cy="50%"
							innerRadius="55%"
							outerRadius="82%"
							dataKey="value"
							nameKey="label"
							isAnimationActive={false}
						>
							{chartData.map((entry) => (
								<Cell key={entry.label} fill={entry.color} />
							))}
						</Pie>
					</PieChart>
				</ResponsiveContainer>
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
					<span className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">Total</span>
					<span className="text-base font-black text-[#1a1a1a]">{formatMoney(total, { currency })}</span>
				</div>
			</div>
			<div className="flex w-full flex-wrap items-center justify-center gap-2 text-[10px] font-semibold text-[#6b7280]">
				{chartData.map((segment) => {
					const pct = Math.round((segment.value / total) * 100);
					return (
						<span key={segment.label} className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] px-2 py-1">
							<span className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
							{segment.label} {pct}%
						</span>
					);
				})}
			</div>
		</div>
	);
}

function donutPropsAreEqual(prev, next) {
	return prev.currency === next.currency
		&& donutDataKey(prev.data) === donutDataKey(next.data);
}

export default memo(ReportPaymentDonut, donutPropsAreEqual);
