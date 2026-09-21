import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAnchoredMenuPosition } from '../hooks/useAnchoredMenuPosition';

const PANEL_W = 292;
const PANEL_H = 352;

/*
 * `.admin-layout` cuelga de `.app-wrapper`, que tiene `z-index: 1` y por tanto
 * abre su propio contexto de apilamiento: dentro de el, ningun z-index puede
 * superar al modal de pedido manual, que va en otro portal a 11050. Cuando hay
 * un modal abierto hay que colgar de SU portal.
 */
const PORTAL_SCOPES = ['.manual-order-portal-scope', '.table-session-modal-portal', '.admin-layout'];

const getPortalTarget = () => {
	if (typeof document === 'undefined') return null;
	for (const selector of PORTAL_SCOPES) {
		const el = document.querySelector(selector);
		if (el) return el;
	}
	return document.body;
};

/** `YYYY-MM-DD` sin pasar por UTC: `new Date('2026-09-21')` cae en el día anterior
 *  para husos al oeste de Greenwich, que es donde están todos los locales. */
function parseISO(value) {
	const [y, m, d] = String(value || '').split('-').map(Number);
	if (!y) return new Date();
	return new Date(y, (m || 1) - 1, d || 1);
}

function toISO(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Lunes de la semana en la que cae `date`. */
function startOfWeekMonday(date) {
	const copy = new Date(date);
	const dow = (copy.getDay() + 6) % 7; // domingo 0 -> 6
	copy.setDate(copy.getDate() - dow);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

/**
 * Selector de día con aspecto del panel.
 *
 * El `input[type="date"]` abre el calendario del navegador: un widget del
 * sistema que ninguna hoja de estilos puede tocar, así que en medio de la
 * interfaz aparecía una ventana con otra tipografía, otros colores y sus
 * propios botones «Borrar / Hoy».
 */
export default function DayPickerPopover({ anchorRef, isOpen, onClose, value, onChange, locale }) {
	const panelRef = useRef(null);
	const [viewDate, setViewDate] = useState(() => parseISO(value));
	const pos = useAnchoredMenuPosition(anchorRef, isOpen, {
		menuWidth: PANEL_W,
		menuHeight: PANEL_H,
		align: 'left',
	});

	// Al reabrir, el mes que se ve es el del día elegido.
	useEffect(() => {
		if (isOpen) setViewDate(parseISO(value));
	}, [isOpen, value]);

	useEffect(() => {
		if (!isOpen) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose?.();
			}
		};
		const onOutside = (ev) => {
			const anchor = anchorRef?.current;
			const panel = panelRef.current;
			if (anchor && anchor.contains(ev.target)) return;
			if (panel && panel.contains(ev.target)) return;
			onClose?.();
		};
		const timer = window.setTimeout(() => document.addEventListener('click', onOutside), 0);
		document.addEventListener('keydown', onKey);
		return () => {
			window.clearTimeout(timer);
			document.removeEventListener('click', onOutside);
			document.removeEventListener('keydown', onKey);
		};
	}, [isOpen, onClose, anchorRef]);

	const weekdays = useMemo(() => {
		const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
		const monday = startOfWeekMonday(new Date());
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(monday);
			d.setDate(monday.getDate() + i);
			return fmt.format(d).replace('.', '').slice(0, 2);
		});
	}, [locale]);

	const monthLabel = useMemo(
		() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewDate),
		[locale, viewDate],
	);

	/** Seis semanas fijas: así el panel no cambia de alto al pasar de mes. */
	const days = useMemo(() => {
		const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
		const start = startOfWeekMonday(firstOfMonth);
		return Array.from({ length: 42 }, (_, i) => {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			return d;
		});
	}, [viewDate]);

	const todayISO = toISO(new Date());
	const portalTarget = getPortalTarget();
	if (!isOpen || !pos || !portalTarget) return null;

	const shiftMonth = (delta) =>
		setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

	return createPortal(
		<div
			ref={panelRef}
			className="day-picker"
			style={{ top: pos.top, left: pos.left, width: PANEL_W }}
			role="dialog"
			aria-modal="false"
			aria-label="Elegir día"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="day-picker__head">
				<button
					type="button"
					className="day-picker__nav"
					onClick={() => shiftMonth(-1)}
					aria-label="Mes anterior"
				>
					<ChevronLeft size={16} aria-hidden />
				</button>
				<span className="day-picker__month">{monthLabel}</span>
				<button
					type="button"
					className="day-picker__nav"
					onClick={() => shiftMonth(1)}
					aria-label="Mes siguiente"
				>
					<ChevronRight size={16} aria-hidden />
				</button>
			</div>

			<div className="day-picker__weekdays" aria-hidden>
				{weekdays.map((w, i) => (
					<span key={`${w}-${i}`}>{w}</span>
				))}
			</div>

			<div className="day-picker__grid" role="grid">
				{days.map((d) => {
					const iso = toISO(d);
					const outside = d.getMonth() !== viewDate.getMonth();
					const selected = iso === value;
					const isToday = iso === todayISO;
					return (
						<button
							key={iso}
							type="button"
							role="gridcell"
							aria-selected={selected}
							aria-current={isToday ? 'date' : undefined}
							className={[
								'day-picker__day',
								outside ? 'is-outside' : '',
								selected ? 'is-selected' : '',
								isToday ? 'is-today' : '',
							]
								.filter(Boolean)
								.join(' ')}
							onClick={() => {
								onChange?.(iso);
								onClose?.();
							}}
						>
							{d.getDate()}
						</button>
					);
				})}
			</div>

			<div className="day-picker__foot">
				<button
					type="button"
					className="day-picker__today"
					onClick={() => {
						onChange?.(todayISO);
						onClose?.();
					}}
				>
					Hoy
				</button>
			</div>
		</div>,
		portalTarget,
	);
}
