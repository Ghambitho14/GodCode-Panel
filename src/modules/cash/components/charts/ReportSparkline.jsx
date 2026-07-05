import React, {
	memo,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

const TREND_UP = '#16a34a';
const TREND_DOWN = '#dc2626';
const TREND_NEUTRAL = '#6b7280';
const ACCENT_BLUE = '#2563eb';
const SPARK_MARGIN = { top: 4, right: 0, left: 0, bottom: 4 };
const Y_DOMAIN = ['dataMin', 'dataMax'];
const DEFAULT_WIDTH = 160;

function resolveTrendStroke(trend, showTrend, overrideColor) {
	if (overrideColor) return overrideColor;
	if (!showTrend || trend == null || !Number.isFinite(trend)) return TREND_NEUTRAL;
	return trend < 0 ? TREND_DOWN : TREND_UP;
}

function buildSparkData(values) {
	const vals = (values || []).map((v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0));
	if (vals.length === 0) {
		return [
			{ i: 0, valor: 0 },
			{ i: 1, valor: 0 },
		];
	}
	if (vals.length === 1) {
		return [
			{ i: 0, valor: vals[0] },
			{ i: 1, valor: vals[0] },
		];
	}
	return vals.map((valor, i) => ({ i, valor }));
}

function valuesKey(values) {
	return (values || []).join('\u0001');
}

function SparkTooltipBody({ active, payload, valueFormatter }) {
	if (!active || !payload?.length) return null;
	const value = payload[0]?.value;
	if (!Number.isFinite(Number(value))) return null;
	return (
		<div className="rounded-lg bg-[#1a1a1a] px-2 py-1 text-xs font-semibold text-white shadow-lg">
			{valueFormatter ? valueFormatter(value) : value}
		</div>
	);
}

function useContainerWidth(containerRef) {
	const [width, setWidth] = useState(DEFAULT_WIDTH);

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

function ReportSparkline({
	values = [],
	trend = null,
	showTrend = false,
	height = 40,
	showDots = false,
	color = null,
	valueFormatter = null,
}) {
	const containerRef = useRef(null);
	const chartWidth = useContainerWidth(containerRef);
	const stroke = resolveTrendStroke(trend, showTrend, color);
	const key = valuesKey(values);
	const data = useMemo(() => buildSparkData(values), [key]);

	const singleValue = (values || []).length === 1;
	const singleValueLabel = singleValue && Number.isFinite(Number(data[0]?.valor))
		? (valueFormatter ? valueFormatter(data[0].valor) : data[0].valor)
		: '';
	const dotProps = singleValue
		? { r: 3.5, fill: stroke, stroke: '#fff', strokeWidth: 2 }
		: showDots
			? { r: 2.5, fill: '#fff', stroke, strokeWidth: 1.5 }
			: false;

	return (
		<div ref={containerRef} style={{ width: '100%', height, minHeight: height, overflow: 'hidden' }}>
			{chartWidth > 0 && singleValue ? (
				<div className="flex h-full w-full items-center justify-center" title={singleValueLabel}>
					<div
						style={{
							width: 10,
							height: 10,
							borderRadius: '9999px',
							background: stroke,
							boxShadow: `0 0 0 4px ${stroke}22`,
						}}
					/>
				</div>
			) : (
				<LineChart width={chartWidth} height={height} data={data} margin={SPARK_MARGIN}>
					<XAxis dataKey="i" hide />
					<YAxis hide domain={Y_DOMAIN} width={0} />
					<Tooltip
						content={(props) => <SparkTooltipBody {...props} valueFormatter={valueFormatter} />}
						cursor={{ stroke: 'rgba(37, 99, 235, 0.25)', strokeWidth: 1 }}
					/>
					<Line
						type="monotone"
						dataKey="valor"
						stroke={stroke}
						strokeWidth={2}
						dot={dotProps}
						isAnimationActive={false}
					/>
				</LineChart>
			)}
		</div>
	);
}

export default memo(ReportSparkline);
