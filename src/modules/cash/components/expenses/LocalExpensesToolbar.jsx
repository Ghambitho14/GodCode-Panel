import React from 'react';
import {
	Wallet, Calendar, BarChart3, Tag, Plus, Download, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import ReportPeriodSelect from '../ReportPeriodSelect';
import { getReportPeriodOptions } from '../../utils/reportPeriodRange';

function ToolbarDivider() {
	return <div className="mb-1.5 hidden h-8 w-px shrink-0 bg-[#e5e5ea] 2xl:block" aria-hidden />;
}

function FilterField({ label, children }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="text-xs font-medium text-[#6b7280]">{label}</span>
			{children}
		</div>
	);
}

/**
 * Barra unificada: título + filtros (selects) + acciones para Gastos del local.
 */
export default function LocalExpensesToolbar({
	filterPeriod,
	onFilterPeriodChange,
	expenseAgg,
	onExpenseAggChange,
	aggOptions = [],
	expenseKindFilter,
	onExpenseKindFilterChange,
	kindOptions = [],
	expenseReferenceYear = null,
	onRegisterClick,
	onExportClick,
	exportLoading = false,
	exportDisabled = false,
}) {
	const selectedKind = kindOptions.find((o) => String(o.value) === String(expenseKindFilter));
	const kindTriggerLabel = selectedKind
		? selectedKind.count > 0
			? `${selectedKind.label} (${selectedKind.count})`
			: selectedKind.label
		: 'Todos';

	return (
		<div className="flex flex-col gap-3 2xl:flex-row 2xl:flex-wrap 2xl:items-end 2xl:gap-4">
			<div className="mb-1 flex w-full min-w-0 items-center gap-2.5 2xl:w-auto">
				<span
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
					aria-hidden
				>
					<Wallet size={18} strokeWidth={2} />
				</span>
				<h2 className="truncate text-base font-bold text-[#1a1a1a] sm:text-lg">Gastos del local</h2>
			</div>

			<ToolbarDivider />

			<div className="grid w-full grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end 2xl:min-w-0 2xl:flex-1">
				<FilterField label="Período">
					<div className="flex flex-wrap items-center gap-2">
						<ReportPeriodSelect
							className="rpt-period-select--compact w-full sm:min-w-[148px] sm:max-w-[200px]"
							value={filterPeriod}
							onChange={onFilterPeriodChange}
							options={getReportPeriodOptions()}
							aria-label="Período"
							icon={<Calendar size={16} strokeWidth={1.65} className="text-[#6b7280]" />}
						/>
						{expenseAgg === 'month' && expenseReferenceYear != null ? (
							<span className="text-xs font-bold text-[#1a1a1a]">Año {expenseReferenceYear}</span>
						) : null}
					</div>
				</FilterField>

				<div className="mb-1.5 hidden h-8 w-px shrink-0 self-end bg-[#e5e5ea] sm:block" aria-hidden />

				<FilterField label="Agrupar por">
					<Select value={String(expenseAgg)} onValueChange={onExpenseAggChange}>
						<SelectTrigger className="h-10 w-full gap-2 sm:w-auto sm:min-w-[120px]" aria-label="Agrupar por">
							<span className="flex min-w-0 items-center gap-2">
								<BarChart3 size={16} strokeWidth={1.65} className="shrink-0 text-[#6b7280]" aria-hidden />
								<SelectValue />
							</span>
						</SelectTrigger>
						<SelectContent>
							{aggOptions.map(({ value, label }) => (
								<SelectItem key={value} value={String(value)}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FilterField>

				<div className="mb-1.5 hidden h-8 w-px shrink-0 self-end bg-[#e5e5ea] sm:block" aria-hidden />

				<FilterField label="Tipo">
					<Select value={String(expenseKindFilter)} onValueChange={onExpenseKindFilterChange}>
						<SelectTrigger className="h-10 w-full gap-2 sm:w-auto sm:min-w-[148px] sm:max-w-[220px]" aria-label="Tipo">
							<span className="flex min-w-0 items-center gap-2">
								<Tag size={16} strokeWidth={1.65} className="shrink-0 text-[#6b7280]" aria-hidden />
								<span className="truncate">{kindTriggerLabel}</span>
							</span>
						</SelectTrigger>
						<SelectContent>
							{kindOptions.map(({ value, label, count }) => (
								<SelectItem key={value} value={String(value)}>
									{count > 0 ? `${label} (${count})` : label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FilterField>
			</div>

			<ToolbarDivider />

			<div className="mb-0.5 flex w-full items-center gap-2 2xl:ml-auto 2xl:w-auto 2xl:flex-wrap">
				<Button
					variant="default"
					type="button"
					onClick={onRegisterClick}
					className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto sm:flex-none"
				>
					<Plus size={17} strokeWidth={2.25} aria-hidden />
					Registrar movimiento
				</Button>
				<Button
					variant="outline"
					type="button"
					size="icon"
					onClick={onExportClick}
					disabled={exportDisabled || exportLoading}
					aria-label="Exportar Excel (vista)"
					title="Exportar Excel (vista)"
					className="h-10 w-10 shrink-0 rounded-xl"
				>
					{exportLoading ? (
						<Loader2 size={16} className="animate-spin" aria-hidden />
					) : (
						<Download size={16} aria-hidden />
					)}
				</Button>
			</div>
		</div>
	);
}
