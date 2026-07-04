import React, { useId, useMemo, useState } from 'react';
import { area, curveMonotoneX, line, scaleLinear, scalePoint, max } from 'd3';
import { formatMoney } from '@/shared/utils/money';

const RPT_ACCENT = '#e8483e';
const RPT_ACCENT_LIGHT = '#ff5879';

/**
 * Gráfica de área — ventas por día con gradiente coral y tooltip al hover.
 * @param {{ points: { key: string, label: string, sales: number, expenses?: number }[], height?: number, currency?: string }} props
 */
export default function RPTSalesAreaChart({
	points = [],
	height = 280,
	currency = 'CLP',
}) {
	const gradId = useId();
	const [hoverIdx, setHoverIdx] = useState(null);

	const data = useMemo(
		() => (points || []).filter((p) => p && p.key),
		[points],
	);

	const chart = useMemo(() => {
		if (!data.length) return null;
		const w = 100;
		const h = 100;
		const x = scalePoint()
			.domain(data.map((d) => d.key))
			.range([2, w - 2])
			.padding(0.08);
		const yMax = max(data, (d) => Math.max(Number(d.sales) || 0, Number(d.expenses) || 0)) || 1;
		const y = scaleLinear().domain([0, yMax]).nice().range([h - 4, 4]);
		const areaGen = area()
			.x((d) => x(d.key))
			.y0(h)
			.y1((d) => y(Math.max(0, Number(d.sales) || 0)))
			.curve(curveMonotoneX);
		const lineGen = line()
			.x((d) => x(d.key))
			.y((d) => y(Math.max(0, Number(d.sales) || 0)))
			.curve(curveMonotoneX);
		const ticks = y.ticks(5);
		return { x, y, areaPath: areaGen(data), linePath: lineGen(data), ticks, yMax };
	}, [data]);

	const fmt = (n) => {
		try {
			return formatMoney(n, { currency });
		} catch {
			return `$${Number(n || 0).toLocaleString('es-CL')}`;
		}
	};

	if (!data.length || !chart) return null;

	const hovered = hoverIdx != null ? data[hoverIdx] : null;
	const hoverX = hovered ? chart.x(hovered.key) : null;

	return (
		<div className="rpt-sales-area" style={{ height }} role="img" aria-label="Ventas por día">
			<div className="rpt-sales-area__axis">
				{chart.ticks.map((t) => (
					<span key={t} className="rpt-sales-area__tick" style={{ top: `${chart.y(t)}%` }}>
						{fmt(t)}
					</span>
				))}
			</div>
			<div className="rpt-sales-area__plot">
				<svg className="rpt-sales-area__grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
					{chart.ticks.map((t) => (
						<line
							key={t}
							x1={0}
							x2={100}
							y1={chart.y(t)}
							y2={chart.y(t)}
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>
				<svg className="rpt-sales-area__chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
					<defs>
						<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={RPT_ACCENT} stopOpacity="0.42" />
							<stop offset="55%" stopColor={RPT_ACCENT_LIGHT} stopOpacity="0.14" />
							<stop offset="100%" stopColor={RPT_ACCENT} stopOpacity="0.02" />
						</linearGradient>
					</defs>
					<path d={chart.areaPath} fill={`url(#${gradId})`} />
					<path
						d={chart.linePath}
						fill="none"
						stroke={RPT_ACCENT}
						strokeWidth="2"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<div className="rpt-sales-area__hits">
					{data.map((d, i) => (
						<button
							key={d.key}
							type="button"
							className={`rpt-sales-area__hit${hoverIdx === i ? ' is-active' : ''}`}
							style={{ left: `${chart.x(d.key)}%` }}
							onMouseEnter={() => setHoverIdx(i)}
							onMouseLeave={() => setHoverIdx(null)}
							onFocus={() => setHoverIdx(i)}
							onBlur={() => setHoverIdx(null)}
							aria-label={`${d.label}: ${fmt(d.sales)}`}
						/>
					))}
				</div>
				<div className="rpt-sales-area__labels">
					{data.map((d, i) => {
						const step = data.length > 20 ? Math.ceil(data.length / 8) : data.length > 12 ? 2 : 1;
						if (i % step !== 0 && i !== data.length - 1) return null;
						return (
							<span
								key={d.key}
								className="rpt-sales-area__x-label"
								style={{ left: `${chart.x(d.key)}%` }}
							>
								{d.label}
							</span>
						);
					})}
				</div>
				{hovered && hoverX != null ? (
					<div className="rpt-sales-area__tooltip" style={{ left: `${hoverX}%` }}>
						<div className="rpt-sales-area__tooltip-date">{hovered.label}</div>
						<div className="rpt-sales-area__tooltip-row">
							<span className="rpt-sales-area__swatch" />
							Ventas: <strong>{fmt(hovered.sales)}</strong>
						</div>
						{Number(hovered.expenses) > 0 ? (
							<div className="rpt-sales-area__tooltip-row rpt-sales-area__tooltip-row--muted">
								Gastos: {fmt(hovered.expenses)}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}
