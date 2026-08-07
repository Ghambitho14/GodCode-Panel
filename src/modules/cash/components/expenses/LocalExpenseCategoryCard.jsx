import React, { useMemo, useState } from 'react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import ReportSalesChart from '../charts/ReportSalesChart';

/**
 * Card de categoría: cabecera tipada + chart + tabla de períodos.
 */
export default function LocalExpenseCategoryCard({
	title,
	icon: Icon,
	accent = '#2563eb',
	total = 0,
	count = 0,
	points = [],
	buckets = [],
	periodTotal = 0,
	fmt,
	currency = 'CLP',
	loading = false,
	emptyLabel = 'Sin movimientos en este período.',
	highlightBucketKey = null,
	chartTitle = null,
}) {
	const [bucketFilter, setBucketFilter] = useState('all');
	const formatMoney = typeof fmt === 'function' ? fmt : (n) => String(n);

	const visibleBuckets = useMemo(() => {
		const rows = buckets || [];
		if (bucketFilter === 'nonzero') {
			return rows.filter((row) => Number(row.total) > 0);
		}
		return rows;
	}, [buckets, bucketFilter]);

	const resolvedChartTitle = chartTitle || `${title} por período (${currency})`;
	const accentSoft = `${accent}14`;

	return (
		<div className="overflow-hidden rounded-2xl border border-[#ededf0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ededf0] px-4 py-3 sm:px-5">
				<div className="flex min-w-0 items-center gap-2.5">
					<span
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
						style={{ backgroundColor: accentSoft, color: accent }}
						aria-hidden
					>
						{Icon ? <Icon size={18} strokeWidth={2} /> : null}
					</span>
					<h4 className="truncate text-sm font-bold text-[#1a1a1a] sm:text-base">{title}</h4>
				</div>
				<div className="flex flex-wrap items-center gap-2 sm:gap-3">
					<span className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
						Total: {formatMoney(total)} ({count})
					</span>
					<Select value={bucketFilter} onValueChange={setBucketFilter}>
						<SelectTrigger className="h-9 w-[148px]" aria-label={`Filtro de períodos — ${title}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value="nonzero">Con movimiento</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="grid lg:grid-cols-2">
				<div className="min-h-[220px] p-4 sm:p-5 lg:border-r lg:border-[#ededf0]">
					{points?.length ? (
						<ReportSalesChart
							points={points}
							kind="bar-solid"
							currency={currency}
							height={220}
							showHeader
							color={accent}
							title={resolvedChartTitle}
							subtitle={bucketFilter === 'nonzero' ? 'Con movimiento' : 'Todos'}
						/>
					) : (
						<div className="flex h-full min-h-[180px] items-center justify-center text-sm text-[#6b7280]">
							{loading ? 'Cargando…' : emptyLabel}
						</div>
					)}
				</div>

				<div className="max-h-[280px] overflow-auto border-t border-[#ededf0] lg:border-t-0">
					<table className="w-full text-sm">
						<thead className="sticky top-0 bg-[#f5f5f7]">
							<tr>
								<th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[#6b7280]">
									Período
								</th>
								<th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-[#6b7280]">
									Total
								</th>
							</tr>
						</thead>
						<tbody>
							{visibleBuckets.length === 0 ? (
								<tr>
									<td colSpan={2} className="px-4 py-6 text-center text-sm text-[#6b7280]">
										{loading ? 'Cargando…' : 'Sin períodos para mostrar.'}
									</td>
								</tr>
							) : (
								visibleBuckets.map((row) => (
									<tr
										key={row.key}
										className={
											highlightBucketKey && row.key === highlightBucketKey
												? 'bg-[#f5f5f7]'
												: undefined
										}
									>
										<td className="px-4 py-2 text-[#1a1a1a]">{row.label}</td>
										<td className="px-4 py-2 text-right font-bold tabular-nums text-[#1a1a1a]">
											{formatMoney(row.total)}
										</td>
									</tr>
								))
							)}
							<tr className="border-t border-[#e5e5ea] bg-[#f5f5f7] font-bold">
								<td className="px-4 py-2 text-[#1a1a1a]">Total</td>
								<td className="px-4 py-2 text-right tabular-nums" style={{ color: accent }}>
									{formatMoney(periodTotal)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
