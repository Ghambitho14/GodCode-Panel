import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTHS = [
	"Enero",
	"Febrero",
	"Marzo",
	"Abril",
	"Mayo",
	"Junio",
	"Julio",
	"Agosto",
	"Septiembre",
	"Octubre",
	"Noviembre",
	"Diciembre",
];

const POPOVER_MIN_W = 280;
const GAP = 8;
const PAD = 10;

function pad2(n) {
	return String(n).padStart(2, "0");
}

/** @returns {{ y: number, m: number, d: number, h: number, min: number } | null} */
export function parseDatetimeLocal(value) {
	const t = String(value ?? "").trim();
	if (!t) return null;
	const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
	if (!m) return null;
	return {
		y: Number(m[1]),
		m: Number(m[2]),
		d: Number(m[3]),
		h: Number(m[4] ?? 0),
		min: Number(m[5] ?? 0),
	};
}

export function toDatetimeLocalString(parts) {
	if (!parts) return "";
	return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}T${pad2(parts.h)}:${pad2(parts.min)}`;
}

function formatDisplay(value) {
	const p = parseDatetimeLocal(value);
	if (!p) return "";
	try {
		const dt = new Date(p.y, p.m - 1, p.d, p.h, p.min);
		return dt.toLocaleString("es-CL", {
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return String(value);
	}
}

function daysInMonth(year, month1) {
	return new Date(year, month1, 0).getDate();
}

function buildMonthCells(year, month1) {
	const first = new Date(year, month1 - 1, 1);
	const startPad = (first.getDay() + 6) % 7;
	const dim = daysInMonth(year, month1);
	const cells = [];
	for (let i = 0; i < startPad; i++) cells.push(null);
	for (let d = 1; d <= dim; d++) cells.push(d);
	while (cells.length % 7 !== 0) cells.push(null);
	return cells;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS = Array.from({ length: 12 }, (_, i) => i * 5);

function minuteOptions(currentMin) {
	const set = new Set(MINS);
	if (Number.isFinite(currentMin)) set.add(currentMin);
	return [...set].sort((a, b) => a - b);
}

/**
 * Ancla el popover al trigger en coordenadas de viewport (portal a body).
 * Prioriza abajo; si no cabe, arriba; siempre dentro del viewport.
 */
function placePopover(triggerEl, popoverEl) {
	const rect = triggerEl.getBoundingClientRect();
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const width = Math.min(Math.max(POPOVER_MIN_W, rect.width), vw - PAD * 2);
	const popH = Math.min(popoverEl?.offsetHeight || 360, vh - PAD * 2);
	const below = rect.bottom + GAP;
	const above = rect.top - GAP - popH;
	const fitsBelow = below + popH <= vh - PAD;
	const fitsAbove = above >= PAD;
	let top = fitsBelow ? below : fitsAbove ? above : Math.max(PAD, (vh - popH) / 2);
	let left = rect.left;
	if (left + width > vw - PAD) left = vw - PAD - width;
	if (left < PAD) left = PAD;
	return { top, left, width, maxHeight: vh - PAD * 2 };
}

/**
 * Calendario + hora. Popover SIEMPRE en document.body (evita overflow del modal).
 */
export default function CouponDateTimeField({
	id,
	label,
	value,
	onChange,
	disabled = false,
	defaultTime = "00:00",
	placeholder = "Elegir fecha y hora",
}) {
	const autoId = useId();
	const fieldId = id || autoId;
	const rootRef = useRef(null);
	const triggerRef = useRef(null);
	const popoverRef = useRef(null);
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState({ top: 0, left: 0, width: POPOVER_MIN_W, maxHeight: 400 });

	const parsed = useMemo(() => parseDatetimeLocal(value), [value]);
	const [defH, defMin] = useMemo(() => {
		const [h, m] = String(defaultTime).split(":").map(Number);
		return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
	}, [defaultTime]);

	const now = new Date();
	const [viewY, setViewY] = useState(parsed?.y ?? now.getFullYear());
	const [viewM, setViewM] = useState(parsed?.m ?? now.getMonth() + 1);
	const [draftH, setDraftH] = useState(parsed?.h ?? defH);
	const [draftMin, setDraftMin] = useState(parsed?.min ?? defMin);

	useEffect(() => {
		if (!open) return;
		const p = parseDatetimeLocal(value);
		const base = new Date();
		setViewY(p?.y ?? base.getFullYear());
		setViewM(p?.m ?? base.getMonth() + 1);
		setDraftH(p?.h ?? defH);
		setDraftMin(p?.min ?? defMin);
	}, [open, value, defH, defMin]);

	useEffect(() => {
		if (!open) return undefined;

		const sync = () => {
			if (!triggerRef.current) return;
			setPos(placePopover(triggerRef.current, popoverRef.current));
		};

		sync();
		const raf = requestAnimationFrame(sync);
		const t = window.setTimeout(sync, 0);

		window.addEventListener("resize", sync);
		window.addEventListener("scroll", sync, true);

		return () => {
			cancelAnimationFrame(raf);
			window.clearTimeout(t);
			window.removeEventListener("resize", sync);
			window.removeEventListener("scroll", sync, true);
		};
	}, [open, viewY, viewM]);

	useEffect(() => {
		if (!open) return undefined;
		const onDoc = (e) => {
			const t = e.target;
			if (rootRef.current?.contains(t)) return;
			if (popoverRef.current?.contains(t)) return;
			setOpen(false);
		};
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onDoc);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [open]);

	const cells = useMemo(() => buildMonthCells(viewY, viewM), [viewY, viewM]);
	const today = now;
	const display = formatDisplay(value);
	const mins = minuteOptions(draftMin);

	const shiftMonth = (delta) => {
		let m = viewM + delta;
		let y = viewY;
		if (m < 1) {
			m = 12;
			y -= 1;
		} else if (m > 12) {
			m = 1;
			y += 1;
		}
		setViewY(y);
		setViewM(m);
	};

	const pickDay = (day) => {
		if (!day) return;
		onChange?.(
			toDatetimeLocalString({
				y: viewY,
				m: viewM,
				d: day,
				h: draftH,
				min: draftMin,
			}),
		);
	};

	const applyTime = (h, min) => {
		setDraftH(h);
		setDraftMin(min);
		const p = parseDatetimeLocal(value);
		if (!p) return;
		onChange?.(
			toDatetimeLocalString({
				y: p.y,
				m: p.m,
				d: p.d,
				h,
				min,
			}),
		);
	};

	const clear = () => {
		onChange?.("");
		setOpen(false);
	};

	const popover =
		open && typeof document !== "undefined"
			? createPortal(
					<div
						ref={popoverRef}
						className="coupon-dt__popover coupon-dt__popover--portal"
						role="dialog"
						aria-label={label || "Calendario"}
						style={{
							top: pos.top,
							left: pos.left,
							width: pos.width,
							maxHeight: pos.maxHeight,
						}}
					>
						<div className="coupon-dt__nav">
							<button
								type="button"
								className="coupon-dt__nav-btn"
								onClick={() => shiftMonth(-1)}
								aria-label="Mes anterior"
							>
								<ChevronLeft size={16} />
							</button>
							<span className="coupon-dt__nav-label">
								{MONTHS[viewM - 1]} {viewY}
							</span>
							<button
								type="button"
								className="coupon-dt__nav-btn"
								onClick={() => shiftMonth(1)}
								aria-label="Mes siguiente"
							>
								<ChevronRight size={16} />
							</button>
						</div>

						<div className="coupon-dt__weekdays" aria-hidden>
							{WEEKDAYS.map((w) => (
								<span key={w}>{w}</span>
							))}
						</div>

						<div className="coupon-dt__grid">
							{cells.map((day, idx) => {
								if (!day) {
									return (
										<span key={`e-${idx}`} className="coupon-dt__day coupon-dt__day--empty" />
									);
								}
								const selected =
									parsed && parsed.y === viewY && parsed.m === viewM && parsed.d === day;
								const isToday =
									today.getFullYear() === viewY &&
									today.getMonth() + 1 === viewM &&
									today.getDate() === day;
								return (
									<button
										key={`${viewY}-${viewM}-${day}`}
										type="button"
										className={`coupon-dt__day${selected ? " coupon-dt__day--selected" : ""}${
											isToday ? " coupon-dt__day--today" : ""
										}`}
										onClick={() => pickDay(day)}
									>
										{day}
									</button>
								);
							})}
						</div>

						<div className="coupon-dt__time">
							<span className="coupon-dt__time-label">
								<Clock size={14} aria-hidden />
								Hora
							</span>
							<div className="coupon-dt__time-selects">
								<select
									aria-label="Hora"
									value={draftH}
									onChange={(e) => applyTime(Number(e.target.value), draftMin)}
								>
									{HOURS.map((h) => (
										<option key={h} value={h}>
											{pad2(h)}
										</option>
									))}
								</select>
								<span className="coupon-dt__time-sep" aria-hidden>
									:
								</span>
								<select
									aria-label="Minutos"
									value={draftMin}
									onChange={(e) => applyTime(draftH, Number(e.target.value))}
								>
									{mins.map((m) => (
										<option key={m} value={m}>
											{pad2(m)}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="coupon-dt__footer">
							<button type="button" className="coupon-dt__footer-btn" onClick={clear}>
								Limpiar
							</button>
							<button
								type="button"
								className="coupon-dt__footer-btn coupon-dt__footer-btn--primary"
								onClick={() => setOpen(false)}
							>
								Listo
							</button>
						</div>
					</div>,
					document.body,
				)
			: null;

	return (
		<div className={`coupon-dt${open ? " coupon-dt--open" : ""}`} ref={rootRef}>
			{label ? (
				<label className="coupon-dt__label" htmlFor={fieldId}>
					{label}
				</label>
			) : null}
			<button
				ref={triggerRef}
				id={fieldId}
				type="button"
				className={`coupon-dt__trigger${value ? "" : " coupon-dt__trigger--empty"}`}
				disabled={disabled}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => {
					if (!disabled) setOpen((o) => !o);
				}}
			>
				<span className="coupon-dt__trigger-icon" aria-hidden>
					<Calendar size={15} strokeWidth={1.75} />
				</span>
				<span className="coupon-dt__trigger-text">{display || placeholder}</span>
			</button>
			{popover}
		</div>
	);
}
