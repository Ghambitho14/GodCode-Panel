import React from 'react';
import AdminMenuSelect from './AdminMenuSelect';
import {
	CUSTOM_DAY_MENU_VALUE,
	formatReportPeriodLabel,
	getReportPeriodOptions,
	isCustomDayPeriod,
	parseCustomDay,
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
	const showDayInput = isCustomDayPeriod(value);
	const customDay = parseCustomDay(value) ?? ymdLocal(new Date());

	const handleMenuChange = (next) => {
		if (next === CUSTOM_DAY_MENU_VALUE) {
			onChange(`day:${ymdLocal(new Date())}`);
			return;
		}
		onChange(next);
	};

	const handleDayChange = (e) => {
		const ymd = e.target.value;
		if (ymd) onChange(`day:${ymd}`);
	};

	return (
		<div className={`rpt-period-select${showDayInput ? ' rpt-period-select--with-day' : ''}`}>
			<AdminMenuSelect
				className={className}
				value={isCustomDayPeriod(value) ? CUSTOM_DAY_MENU_VALUE : value}
				onChange={handleMenuChange}
				options={options}
				displayLabel={displayLabelProp ?? formatReportPeriodLabel(value, options)}
				isOptionActive={(optValue) => {
					if (optValue === CUSTOM_DAY_MENU_VALUE) return isCustomDayPeriod(value);
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
		</div>
	);
}
