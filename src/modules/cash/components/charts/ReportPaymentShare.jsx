import React, { memo, useMemo, useState } from 'react';
import { formatMoney } from '@/shared/utils/money';

/**
 * Reparto de cobros por método como barra apilada al 100 %.
 *
 * Sustituye a la dona: con tres categorías y una que suele ser del 2 %, la dona
 * no dejaba leer nada (el total no cabía en el hueco y la porción pequeña era
 * una astilla). Una barra apilada muestra la proporción de un vistazo y deja el
 * total como cifra, no como texto encajado en un círculo.
 *
 * Colores: uno por método, fijos (el color sigue a la entidad, no a su
 * tamaño). Validados en modo claro con el comprobador de paletas del skill de
 * dataviz: verde/azul/naranja separan también en deutan/protan; el violeta
 * anterior era indistinguible del azul para deutan (ΔE 0,4).
 */
const PAYMENT_COLORS = {
	Efectivo: '#16a34a',
	Tarjeta: '#2563eb',
	Transferencia: '#ea580c',
};

function shareDataKey(data) {
	return (data || []).map((d) => `${d?.label ?? ''}:${d?.value ?? 0}`).join('|');
}

function buildShareData(data) {
	return (data || [])
		.filter((d) => d && Number(d.value) > 0)
		.map((d) => ({
			label: String(d.label),
			value: Number(d.value),
			color: d.color || PAYMENT_COLORS[d.label] || '#64748b',
		}));
}

function ReportPaymentShare({ data = [], currency = 'CLP', totalLabel = 'Total cobrado', formatValue = null }) {
	// El formateador de la sucursal manda (locale y moneda del local); formatMoney
	// a secas solo es el respaldo cuando el componente se usa suelto.
	const fmt = typeof formatValue === 'function' ? formatValue : (v) => formatMoney(v, { currency });
	const key = shareDataKey(data);
	const segments = useMemo(() => buildShareData(data), [key]);
	const total = useMemo(() => segments.reduce((acc, s) => acc + s.value, 0), [segments]);
	const [active, setActive] = useState(null);

	if (total <= 0) {
		return (
			<div className="flex h-24 items-center justify-center text-sm text-[var(--admin-text-muted,#64748b)]">
				Sin datos de pagos
			</div>
		);
	}

	const summary = segments
		.map((s) => `${s.label} ${Math.round((s.value / total) * 100)} %`)
		.join(', ');

	return (
		<div className="w-full min-w-0">
			<p className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">{totalLabel}</p>
			<p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight text-[#14161a]">
				{fmt(total)}
			</p>

			<div className="relative mt-4">
				{active != null && segments[active] ? (
					<div
						role="status"
						className="pointer-events-none absolute -top-9 left-0 z-10 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
					>
						{segments[active].label} · {fmt(segments[active].value)} ·{' '}
						{Math.round((segments[active].value / total) * 100)} %
					</div>
				) : null}
				<div
					role="img"
					aria-label={`Reparto de cobros: ${summary}`}
					className="flex h-5 w-full overflow-hidden rounded-[4px]"
					style={{ gap: 2 }}
					onMouseLeave={() => setActive(null)}
				>
					{segments.map((s, i) => (
						<div
							key={s.label}
							className="h-full transition-opacity duration-150"
							style={{
								flex: `${s.value} 1 0%`,
								minWidth: 3,
								background: s.color,
								opacity: active == null || active === i ? 1 : 0.45,
							}}
							onMouseEnter={() => setActive(i)}
							onFocus={() => setActive(i)}
							onBlur={() => setActive(null)}
							tabIndex={0}
							aria-label={`${s.label}: ${fmt(s.value)}`}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function sharePropsAreEqual(prev, next) {
	return prev.currency === next.currency
		&& prev.formatValue === next.formatValue
		&& prev.totalLabel === next.totalLabel
		&& shareDataKey(prev.data) === shareDataKey(next.data);
}

export default memo(ReportPaymentShare, sharePropsAreEqual);
