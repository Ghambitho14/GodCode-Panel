import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_TOUR_EVENT, startAdminTour } from "../admin/tour/start";
import { tourFor, type TourStep } from "../admin/tour/steps";
import "../styles/AdminTour.css";

const SEEN_KEY = "gcode-tours-seen";
const PAD = 8;
/** Mientras haya algo de esto en pantalla, la guía automática espera. */
const BUSY_SELECTOR = [
	".admin-tab-skeleton",
	// Pestañas con su propio "cargando"
	".cash-loading",
	".inventory-loading",
	".admin-menu-options-cart-loading",
	".menu-carousel-loading",
	".admin-coupons__loading",
	".admin-addons__loading",
	// Ventanas abiertas
	'[class*="modal-overlay"]',
	".manual-order-overlay",
	".admin-panel-overlay",
	".order-detail-overlay",
	".menu-carousel-editor-overlay",
	'[aria-modal="true"]',
	"dialog[open]",
].join(", ");

/** Las pestañas cuya guía ya vio esta cuenta en este navegador. */
function seenKey(account: string | null | undefined): string {
	return account ? `${SEEN_KEY}:${account}` : SEEN_KEY;
}

function seen(key: string): string[] {
	try {
		const list = JSON.parse(localStorage.getItem(key) || "[]");
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

function markSeen(key: string, id: string) {
	try {
		localStorage.setItem(key, JSON.stringify([...new Set([...seen(key), id])]));
	} catch {}
}

/** El primer elemento visible que coincida (el teléfono y la PC tienen versiones distintas). */
function findTarget(selector: string): HTMLElement | null {
	for (const el of document.querySelectorAll<HTMLElement>(selector)) {
		const r = el.getBoundingClientRect();
		if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
	}
	return null;
}

type Rect = { top: number; left: number; width: number; height: number };

interface AdminTourProps {
	activeTab: string;
	/** Falso mientras el panel carga o no hay pestañas que mostrar. */
	ready: boolean;
	/** La cuenta con sesión: cada una ve las guías una vez en cada navegador. */
	account?: string | null;
}

/**
 * Visita guiada por pestaña: oscurece el panel, ilumina una parte y explica en
 * una frase para qué sirve. Se abre sola la primera vez que cada cuenta entra
 * a cada pestaña en este navegador (la primera de todas suma una bienvenida);
 * después, solo con el botón "Guía".
 */
export function AdminTour({ activeTab, ready, account = null }: AdminTourProps) {
	const key = seenKey(account);
	const [tour, setTour] = useState<{ id: string; tab: string; steps: TourStep[] } | null>(null);
	const [index, setIndex] = useState(0);
	const [rect, setRect] = useState<Rect | null>(null);
	const [viewport, setViewport] = useState({ w: 0, h: 0 });

	const start = useCallback(() => {
		const found = tourFor(activeTab, { firstTime: seen(key).length === 0 });
		if (!found) return;
		// Solo los pasos cuyo elemento está en pantalla (rol, plan y dispositivo cambian lo que se ve)
		const steps = found.steps.filter((s) => !s.target || findTarget(s.target));
		if (steps.length === 0) return;
		setTour({ id: found.id, tab: activeTab, steps });
		setIndex(0);
	}, [activeTab, key]);

	const close = useCallback(() => {
		if (tour) markSeen(key, tour.id);
		setTour(null);
		setRect(null);
	}, [tour, key]);

	useEffect(() => {
		window.addEventListener(ADMIN_TOUR_EVENT, start);
		return () => window.removeEventListener(ADMIN_TOUR_EVENT, start);
	}, [start]);

	// La primera vez en cada pestaña se abre sola, cuando ya cargó y no hay ventanas abiertas
	useEffect(() => {
		if (!ready) return;
		const found = tourFor(activeTab);
		if (!found || seen(key).includes(found.id)) return;
		let tries = 0;
		let timer = 0;
		const attempt = () => {
			if (document.querySelector(BUSY_SELECTOR)) {
				tries += 1;
				if (tries < 40) timer = window.setTimeout(attempt, 750);
				return;
			}
			start();
		};
		timer = window.setTimeout(attempt, 900);
		return () => window.clearTimeout(timer);
	}, [activeTab, ready, start, key]);

	// Si cambia de pestaña, la guía de la anterior ya no se muestra
	const step = tour?.tab === activeTab ? tour.steps[index] : undefined;

	const measure = useCallback(() => {
		setViewport({ w: window.innerWidth, h: window.innerHeight });
		const el = step?.target ? findTarget(step.target) : null;
		if (!el) return setRect(null);
		const r = el.getBoundingClientRect();
		setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
	}, [step]);

	useLayoutEffect(() => {
		if (!step) return;
		const el = step.target ? findTarget(step.target) : null;
		el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
		const frame = requestAnimationFrame(measure);
		const late = window.setTimeout(measure, 450);
		// En captura: el panel desplaza contenedores internos, no solo la ventana
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, { passive: true, capture: true });
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(late);
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, { capture: true });
		};
	}, [step, measure]);

	useEffect(() => {
		if (!tour || tour.tab !== activeTab) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
			if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, tour.steps.length - 1));
			if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [tour, close, activeTab]);

	if (!tour || !step) return null;
	const last = index === tour.steps.length - 1;

	// La tarjeta va donde haya más espacio: debajo o encima de lo iluminado
	const narrow = viewport.w < 640;
	const cardWidth = Math.min(360, viewport.w - 32);
	let style: CSSProperties;
	if (!rect) {
		style = { left: (viewport.w - cardWidth) / 2, top: "50%", translate: "0 -50%", width: cardWidth };
	} else {
		const below = viewport.h - (rect.top + rect.height);
		const above = rect.top;
		const right = viewport.w - (rect.left + rect.width);
		const left = narrow
			? 16
			: Math.min(Math.max(16, rect.left + rect.width / 2 - cardWidth / 2), viewport.w - cardWidth - 16);
		const sideTop = Math.min(Math.max(16, rect.top + 24), viewport.h - 240);
		if (Math.max(below, above) < 220) {
			// Lo iluminado es alto (la barra lateral): la tarjeta va al lado si cabe;
			// si no, flota abajo, sobre la barra del teléfono
			if (!narrow && right >= cardWidth + 28) style = { left: rect.left + rect.width + 12, top: sideTop, width: cardWidth };
			else if (!narrow && rect.left >= cardWidth + 28) style = { left: rect.left - cardWidth - 12, top: sideTop, width: cardWidth };
			else style = { left, bottom: 96, width: cardWidth };
		} else if (below >= above) style = { left, top: rect.top + rect.height + 12, width: cardWidth };
		else style = { left, bottom: viewport.h - rect.top + 12, width: cardWidth };
	}

	return (
		<div className="admin-tour" role="dialog" aria-modal="true" aria-label={`Guía: ${step.title}`}>
			{/* Lo iluminado: un hueco en la sombra que se mueve de paso en paso */}
			<div
				aria-hidden
				className={`admin-tour__spot${rect ? "" : " admin-tour__spot--none"}`}
				style={rect ?? undefined}
			/>
			<div className="admin-tour__backdrop" onClick={close} aria-hidden />

			<section key={`${tour.id}-${index}`} className="admin-tour__card" style={style}>
				<div className="admin-tour__head">
					<span className="admin-tour__avatar" aria-hidden>
						<img src="/favicon.png" alt="" width={44} height={44} />
					</span>
					<div className="admin-tour__text">
						<p className="admin-tour__title">{step.title}</p>
						<p className="admin-tour__body">{step.body}</p>
					</div>
					<button type="button" onClick={close} className="admin-tour__close" aria-label="Cerrar guía">
						<X size={16} strokeWidth={2} aria-hidden />
					</button>
				</div>
				<div className="admin-tour__foot">
					<div className="admin-tour__dots" aria-label={`Paso ${index + 1} de ${tour.steps.length}`}>
						{tour.steps.map((_, i) => (
							<span key={i} className={`admin-tour__dot${i === index ? " is-active" : ""}`} />
						))}
					</div>
					<div className="admin-tour__actions">
						{index > 0 && (
							<button type="button" className="admin-tour__back" onClick={() => setIndex(index - 1)}>
								Atrás
							</button>
						)}
						<button
							type="button"
							className="admin-tour__next"
							onClick={() => (last ? close() : setIndex(index + 1))}
							autoFocus
						>
							{last ? "¡Entendido!" : "Siguiente"}
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}

/** El botón "Guía" de la barra superior; no aparece en pestañas sin guía. */
export function AdminGuideButton({ activeTab }: { activeTab: string }) {
	if (!tourFor(activeTab)) return null;
	return (
		<Button
			variant="default"
			type="button"
			className="btn-icon-refresh header-action-guide"
			onClick={startAdminTour}
			data-tour="guia"
			title="Guía de esta pantalla"
			aria-label="Ver la guía de esta pantalla"
		>
			<Compass size={24} strokeWidth={1.65} aria-hidden />
		</Button>
	);
}
