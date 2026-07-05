import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/shared/utils/money';

const BRAND = '#2563eb';
const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 };
const AXIS_TICK = { fontSize: 11, fill: '#9ca3af' };
const AXIS_LINE = { stroke: '#ededf0' };
const GRID_STROKE = '#f0f0f2';
const BAR_RADIUS = [4, 4, 0, 0];
const DEFAULT_CHART_WIDTH = 800;
const AREA_CURSOR = { stroke: '#ededf0', strokeWidth: 1 };
const BAR_CURSOR = { fill: 'rgba(232,72,62,0.04)' };

function safeSvgId(prefix) {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapChartData(points) {
	return (points || []).map((p, index) => ({
		fecha: String(p.label || p.key || `Día ${index + 1}`),
		ventas: Number.isFinite(Number(p.sales)) ? Math.max(0, Number(p.sales)) : 0,
		key: p.key || `row-${index}`,
	}));
}

function useChartWidth(containerRef) {
	const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);

	useLayoutEffect(() => {
		const node = containerRef.current;
		if (!node) return;

		const update = () => {
			const rect = node.getBoundingClientRect();
			const next = Math.max(0, Math.round(rect.width));
			if (next > 0) {
				setWidth((prev) => (Math.abs(next - prev) > 1 ? next : prev));
			}
		};

		update();

		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(update);
			ro.observe(node);
			return () => ro.disconnect();
		}

		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	}, [containerRef]);

	return width;
}

function SalesTooltipBody({ active, payload }) {
	if (!active || !payload?.length) return null;
	const row = payload[0]?.payload;
	if (!row) return null;
	return (
		<div className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs shadow-lg">
			<p className="mb-1 font-semibold text-white">{row.fecha}</p>
			<p className="font-bold text-white">
				{formatMoney(row.ventas)}
			</p>
		</div>
	);
}

function ReportSalesChart({
	points = [],
	kind = 'area',
	filter = 'all',
	currency = 'CLP',
	height = 400,
	showHeader = false,
}) {
	const containerRef = useRef(null);
	const chartWidth = useChartWidth(containerRef);
	const gradientIdRef = useRef(safeSvgId('ventas'));
	const gradientId = gradientIdRef.current;
	const pointsKey = useMemo(
		() => (points || []).map((p) => `${p.key ?? ''}:${p.sales ?? 0}:${p.label ?? ''}`).join('|'),
		[points],
	);
	const ventasPorDia = useMemo(() => mapChartData(points), [pointsKey]);
	const singlePoint = ventasPorDia.length === 1 ? ventasPorDia[0] : null;
	const chartKind = singlePoint ? 'bar' : kind === 'area' ? 'area' : 'bar';
	const barFill = kind === 'bar-gradient' ? `url(#${gradientId}-bar)` : BRAND;

	const renderTooltip = useCallback((props) => <SalesTooltipBody {...props} />, []);

	const formatYAxis = useCallback((v) => formatMoneyCompact(v), []);

	if (!ventasPorDia.length) return null;

	const filterLabel = filter === 'online' ? 'Online' : filter === 'store' ? 'Tienda' : 'Todos';
	const chartHeight = showHeader ? Math.max(120, height - 22) : height;

	return (
		<div style={{ width: '100%' }} className={showHeader ? 'flex flex-col overflow-hidden' : undefined}>
			{showHeader ? (
				<div className="mb-2 flex shrink-0 items-center justify-between text-[11px] font-semibold text-[#6b7280]">
					<span>{chartKind === 'area' ? 'Ventas' : 'Ventas por período'}</span>
					<span>{filterLabel}</span>
				</div>
			) : null}
			<div ref={containerRef} style={{ width: '100%', height: chartHeight }}>
				{chartWidth > 0 && chartKind === 'area' ? (
					<AreaChart width={chartWidth} height={chartHeight} data={ventasPorDia} margin={CHART_MARGIN}>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor={BRAND} stopOpacity={0.25} />
								<stop offset="100%" stopColor={BRAND} stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
						<XAxis
							dataKey="fecha"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={AXIS_LINE}
							minTickGap={24}
						/>
						<YAxis
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							width={56}
							tickFormatter={formatYAxis}
						/>
						<Tooltip content={renderTooltip} cursor={AREA_CURSOR} />
						<Area
							type="monotone"
							dataKey="ventas"
							stroke={BRAND}
							fill={`url(#${gradientId})`}
							strokeWidth={2.5}
							isAnimationActive={false}
						/>
					</AreaChart>
				) : null}
				{chartWidth > 0 && chartKind === 'bar' ? (
					<BarChart width={chartWidth} height={chartHeight} data={ventasPorDia} margin={CHART_MARGIN}>
						{kind === 'bar-gradient' ? (
							<defs>
								<linearGradient id={`${gradientId}-bar`} x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#f36f65" />
									<stop offset="100%" stopColor={BRAND} />
								</linearGradient>
							</defs>
						) : null}
						<CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
						<XAxis
							dataKey="fecha"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={AXIS_LINE}
							minTickGap={16}
						/>
						<YAxis
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							width={56}
							tickFormatter={formatYAxis}
						/>
						<Tooltip content={renderTooltip} cursor={BAR_CURSOR} />
						<Bar
							dataKey="ventas"
							fill={barFill}
							radius={BAR_RADIUS}
							maxBarSize={singlePoint ? 64 : undefined}
							isAnimationActive={false}
						/>
					</BarChart>
				) : null}
			</div>
		</div>
	);
}

function salesChartPropsAreEqual(prev, next) {
	return (
		prev.kind === next.kind
		&& prev.filter === next.filter
		&& prev.currency === next.currency
		&& prev.height === next.height
		&& prev.showHeader === next.showHeader
		&& (prev.points || []).map((p) => `${p.key ?? ''}:${p.sales ?? 0}:${p.label ?? ''}`).join('|')
			=== (next.points || []).map((p) => `${p.key ?? ''}:${p.sales ?? 0}:${p.label ?? ''}`).join('|')
	);
}

export default memo(ReportSalesChart, salesChartPropsAreEqual);
