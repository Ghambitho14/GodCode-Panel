import React, { useId, useMemo } from 'react';
import { area, curveMonotoneX, line, scaleLinear, max } from 'd3';

const RPT_ACCENT = '#e8483e';

/**
 * Micro-sparkline para tarjetas KPI del panel de reportes.
 * @param {{ values?: number[], height?: number, color?: string }} props
 */
export default function RPTKpiSparkline({ values = [], height = 28, color = RPT_ACCENT }) {
	const gradId = useId();
	const data = useMemo(
		() => (values || []).map((v, i) => ({ i, v: Math.max(0, Number(v) || 0) })),
		[values],
	);

	const path = useMemo(() => {
		if (data.length < 2) return null;
		const w = 100;
		const h = height;
		const x = scaleLinear().domain([0, data.length - 1]).range([0, w]);
		const yMax = max(data, (d) => d.v) || 1;
		const y = scaleLinear().domain([0, yMax]).range([h - 2, 2]);
		const areaGen = area()
			.x((d) => x(d.i))
			.y0(h)
			.y1((d) => y(d.v))
			.curve(curveMonotoneX);
		const lineGen = line()
			.x((d) => x(d.i))
			.y((d) => y(d.v))
			.curve(curveMonotoneX);
		return {
			area: areaGen(data),
			line: lineGen(data),
		};
	}, [data, height]);

	if (!path) {
		return <div className="rpt-kpi-sparkline rpt-kpi-sparkline--flat" style={{ height }} aria-hidden />;
	}

	return (
		<svg
			className="rpt-kpi-sparkline"
			viewBox={`0 0 100 ${height}`}
			preserveAspectRatio="none"
			role="img"
			aria-hidden
		>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.35" />
					<stop offset="100%" stopColor={color} stopOpacity="0.02" />
				</linearGradient>
			</defs>
			<path d={path.area} fill={`url(#${gradId})`} />
			<path d={path.line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
		</svg>
	);
}
