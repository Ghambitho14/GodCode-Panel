import React from 'react';
import { Receipt, Banknote, RotateCcw } from 'lucide-react';

function movementLabel(count) {
	const n = Number(count) || 0;
	return n === 1 ? '1 movimiento' : `${n} movimientos`;
}

function SummaryStat({ label, value, icon: Icon, subtext }) {
	return (
		<div className="min-w-0">
			<div className="mb-1 flex items-center gap-1.5">
				{Icon ? (
					<Icon size={14} strokeWidth={2} className="text-emerald-600" aria-hidden />
				) : null}
				<span className="text-sm font-medium text-[#6b7280]">{label}</span>
			</div>
			<p className="text-2xl font-bold tabular-nums tracking-tight text-[#1a1a1a]">{value}</p>
			{subtext != null ? (
				<p className="mt-0.5 text-xs font-medium text-[#9ca3af]">{subtext}</p>
			) : null}
		</div>
	);
}

/**
 * Resumen de KPIs del período para Gastos del local.
 */
export default function LocalExpensesSummaryBar({
	total = 0,
	operating = 0,
	operatingCount = 0,
	withdrawals = 0,
	withdrawalCount = 0,
	refunds = 0,
	refundCount = 0,
	formatMoney,
}) {
	const fmt = typeof formatMoney === 'function' ? formatMoney : (n) => String(n);

	return (
		<div className="rounded-2xl border border-[#ededf0] bg-[#f5f5f7] px-3 py-3 sm:px-4 sm:py-4">
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
				<SummaryStat label="Total período" value={fmt(total)} />
				<SummaryStat
					label="Operativos"
					value={fmt(operating)}
					icon={Receipt}
					subtext={movementLabel(operatingCount)}
				/>
				<SummaryStat
					label="Retiros de caja"
					value={fmt(withdrawals)}
					icon={Banknote}
					subtext={movementLabel(withdrawalCount)}
				/>
				<SummaryStat
					label="Devoluciones"
					value={fmt(refunds)}
					icon={RotateCcw}
					subtext={movementLabel(refundCount)}
				/>
			</div>
		</div>
	);
}
