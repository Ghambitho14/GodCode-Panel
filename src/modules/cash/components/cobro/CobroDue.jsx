import React from 'react';
import { AlertCircle, CheckCircle2, CircleDashed } from 'lucide-react';
import { splitMoneyText } from './cobroPayment';

const STATUS_ICON = {
	idle: CircleDashed,
	progress: CircleDashed,
	ready: CheckCircle2,
	error: AlertCircle,
};

/**
 * Anchos de la barra de saldo. Cada tramo es un método; si lo asignado se pasa
 * del total se reescala para que la barra no se salga del carril.
 */
function meterWidths(segments, dueMinor) {
	const assigned = segments.reduce((sum, segment) => sum + segment.minor, 0);
	const base = Math.max(Number(dueMinor) || 0, assigned, 1);
	return segments.map((segment) => ({ ...segment, percent: (segment.minor / base) * 100 }));
}

/** Total a cobrar, cuánto queda asignado y qué falta para cuadrar. */
export default function CobroDue({ label, amountText, currency, secondary = null, dueMinor, summary }) {
	const { code, value, codeFirst } = splitMoneyText(amountText, currency);
	const StatusIcon = STATUS_ICON[summary.tone] ?? CircleDashed;
	const segments = meterWidths(summary.segments ?? [], dueMinor);

	return (
		<section className="cobro-due" data-tone={summary.tone} aria-label={label}>
			<div className="cobro-due__top">
				<span className="cobro-due__label">{label}</span>
				{secondary ? <span className="cobro-due__alt">{secondary}</span> : null}
			</div>
			<p className="cobro-due__amount">
				{code && codeFirst ? <span className="cobro-due__code">{code}</span> : null}
				<span className="cobro-due__value">{value}</span>
				{code && !codeFirst ? <span className="cobro-due__code">{code}</span> : null}
			</p>
			<div className="cobro-meter" aria-hidden>
				{segments.map((segment) => (
					<span
						key={segment.key}
						className="cobro-meter__seg"
						style={{ flexBasis: `${segment.percent}%` }}
						title={segment.label || undefined}
					/>
				))}
			</div>
			<p className="cobro-due__status" role="status" aria-live="polite">
				<StatusIcon size={16} strokeWidth={2.25} className="cobro-due__status-icon" aria-hidden />
				<span>{summary.message}</span>
				{summary.detail ? <span className="cobro-due__detail">{summary.detail}</span> : null}
			</p>
		</section>
	);
}
