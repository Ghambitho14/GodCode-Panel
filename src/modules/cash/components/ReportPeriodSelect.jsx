import React from 'react';
import AdminMenuSelect from './AdminMenuSelect';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import {
	CUSTOM_DAY_MENU_VALUE,
	CUSTOM_RANGE_MENU_VALUE,
	addLocalDays,
	buildCustomRangeValue,
	formatReportPeriodLabel,
	getReportPeriodOptions,
	isCustomDayPeriod,
	isCustomRangePeriod,
	parseCustomDay,
	parseCustomRange,
	ymdLocal,
} from '../utils/reportPeriodRange';

export default function ReportPeriodSelect({
	value,
	onChange,
	icon = null,
	disabled = false,
	className = '',
	options = getReportPeriodOptions(),
	displayLabel: displayLabelProp = null,
	dateInputAriaLabel = 'Fecha del informe',
	'aria-label': ariaLabel,
}) {
	const { locale } = useBranchMoney();
	const showDayInput = isCustomDayPeriod(value);
	const showRangeInputs = isCustomRangePeriod(value);
	const customDay = parseCustomDay(value) ?? ymdLocal(new Date());
	const customRange = parseCustomRange(value) ?? {
		from: ymdLocal(addLocalDays(new Date(), -6)),
		to: ymdLocal(new Date()),
	};

	const handleMenuChange = (next) => {
		if (next === CUSTOM_DAY_MENU_VALUE) {
			onChange(`day:${ymdLocal(new Date())}`);
			return;
		}
		if (next === CUSTOM_RANGE_MENU_VALUE) {
			onChange(buildCustomRangeValue(customRange.from, customRange.to));
			return;
		}
		onChange(next);
	};

	const handleRangeChange = (edge) => (e) => {
		const ymd = e.target.value;
		if (!ymd) return;
		const next = { ...customRange, [edge]: ymd };
		onChange(buildCustomRangeValue(next.from, next.to));
	};

	const handleDayChange = (e) => {
		const ymd = e.target.value;
		if (ymd) onChange(`day:${ymd}`);
	};

	return (
		<div className={`rpt-period-select${showDayInput ? ' rpt-period-select--with-day' : ''}${showRangeInputs ? ' rpt-period-select--with-range' : ''}`}>
			<AdminMenuSelect
				className={className}
				value={isCustomDayPeriod(value) ? CUSTOM_DAY_MENU_VALUE : isCustomRangePeriod(value) ? CUSTOM_RANGE_MENU_VALUE : value}
				onChange={handleMenuChange}
				options={options}
				displayLabel={displayLabelProp ?? formatReportPeriodLabel(value, options, locale)}
				isOptionActive={(optValue) => {
					if (optValue === CUSTOM_DAY_MENU_VALUE) return isCustomDayPeriod(value);
					if (optValue === CUSTOM_RANGE_MENU_VALUE) return isCustomRangePeriod(value);
					return String(optValue) === String(value);
				}}
				disabled={disabled}
				aria-label={ariaLabel}
				icon={icon}
			/>
			{showDayInput ? (
				<input
					type="date"
					className="rpt-month-input rpt-period-day-input"
					value={customDay}
					onChange={handleDayChange}
					aria-label={dateInputAriaLabel}
				/>
			) : null}
			{showRangeInputs ? (
				<div className="rpt-period-range-inputs">
					<input
						type="date"
						className="rpt-month-input rpt-period-day-input"
						value={customRange.from}
						max={customRange.to}
						onChange={handleRangeChange('from')}
						aria-label="Desde"
					/>
					<span className="rpt-period-range-sep" aria-hidden>–</span>
					<input
						type="date"
						className="rpt-month-input rpt-period-day-input"
						value={customRange.to}
						min={customRange.from}
						onChange={handleRangeChange('to')}
						aria-label="Hasta"
					/>
				</div>
			) : null}
		</div>
	);
}
