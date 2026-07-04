import React, { memo, useMemo, useRef } from 'react';
import { Line, LineChart, XAxis, YAxis } from 'recharts';

const TREND_UP = '#16a34a';
const TREND_DOWN = '#dc2626';
const TREND_NEUTRAL = '#6b7280';
const SPARK_MARGIN = { top: 4, right: 0, left: 0, bottom: 0 };
const Y_DOMAIN = ['dataMin', 'dataMax'];
const SPARK_WIDTH = 160;

function resolveTrendStroke(trend, showTrend) {
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

function ReportSparkline({
	values = [],
	trend = null,
	showTrend = false,
	height = 40,
}) {
	const renderCountRef = useRef(0);
	renderCountRef.current += 1;
	console.log(
		'[ReportSparkline] render #%s values.length=%s trend=%s',
		renderCountRef.current,
		values?.length,
		trend,
	);
	const stroke = resolveTrendStroke(trend, showTrend);
	const key = valuesKey(values);
	const data = useMemo(() => buildSparkData(values), [key]);

	return (
		<div style={{ width: '100%', height, minHeight: height, overflow: 'hidden' }}>
			<LineChart width={SPARK_WIDTH} height={height} data={data} margin={SPARK_MARGIN}>
				<XAxis dataKey="i" hide />
				<YAxis hide domain={Y_DOMAIN} width={0} />
				<Line
					type="monotone"
					dataKey="valor"
					stroke={stroke}
					strokeWidth={2}
					dot={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</div>
	);
}

export default memo(ReportSparkline);
