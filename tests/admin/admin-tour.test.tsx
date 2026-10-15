import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminGuideButton, AdminTour } from "@/modules/cash/components/AdminTour";
import { startAdminTour } from "@/modules/cash/admin/tour/start";
import { GUIDE_BUTTON_STEP, TOURS, WELCOME_STEPS, tourFor } from "@/modules/cash/admin/tour/steps";
import { ADMIN_PANEL_TAB_IDS } from "@/shared/constants/admin-panel-tabs";

describe("tourFor", () => {
	it("cada pestaña del panel tiene su guía, también Addons y Soporte", () => {
		for (const id of [...ADMIN_PANEL_TAB_IDS, "module:addons", "module:tickets"]) {
			expect(tourFor(id)?.id).toBe(id);
		}
	});

	it("las pantallas de un extra y las pestañas desconocidas no tienen guía", () => {
		expect(tourFor("module:addon-libro-caja")).toBeNull();
		expect(tourFor("nada")).toBeNull();
		expect(tourFor(null)).toBeNull();
	});

	it("la primera guía suma la bienvenida y termina en el botón Guía", () => {
		const steps = tourFor("orders", { firstTime: true })!.steps;
		expect(steps.slice(0, WELCOME_STEPS.length)).toEqual(WELCOME_STEPS);
		expect(steps.at(-1)).toEqual(GUIDE_BUTTON_STEP);
	});

	it("la bienvenida no repite un paso de la pestaña (la sucursal en Reportes)", () => {
		const targets = tourFor("analytics", { firstTime: true })!.steps.map((s) => s.target).filter(Boolean);
		expect(new Set(targets).size).toBe(targets.length);
	});

	it("cada paso es corto", () => {
		const all = [...WELCOME_STEPS, GUIDE_BUTTON_STEP, ...TOURS.flatMap((t) => t.steps)];
		for (const s of all) {
			expect(s.title.length).toBeLessThanOrEqual(40);
			expect(s.body.length).toBeLessThanOrEqual(110);
		}
	});
});

/** jsdom no maqueta: lo marcado con data-oculto mide cero, el resto tiene tamaño. */
function mockLayout() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
		const size = this.hasAttribute("data-oculto") ? 0 : 100;
		return { top: 200, left: 40, width: size, height: size / 2, right: 40 + size, bottom: 200 + size / 2, x: 40, y: 200, toJSON() {} } as DOMRect;
	});
}

function Pantalla({ tab = "caja", ready = true, account = "dueno" }: { tab?: string; ready?: boolean; account?: string }) {
	return (
		<div>
			<section className="cash-hero">turno</section>
			<div className="cash-kpi-grid" data-oculto="">sin turno abierto</div>
			<section className="cash-section">historial</section>
			<AdminTour activeTab={tab} ready={ready} account={account} />
		</div>
	);
}

describe("AdminTour", () => {
	beforeEach(() => {
		localStorage.clear();
		// Que no sea la primera guía: así se ven solo los pasos de la pestaña
		localStorage.setItem("gcode-tours-seen:dueno", JSON.stringify(["orders"]));
		mockLayout();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("el botón Guía abre la guía y se salta lo que no está en pantalla", () => {
		render(<Pantalla ready={false} />);
		expect(screen.queryByRole("dialog")).toBeNull();

		act(() => startAdminTour());
		expect(screen.getByText("Tu turno de caja")).toBeTruthy();
		// Turno + historial: los KPI miden cero y el paso de acciones no tiene elemento
		expect(screen.getByLabelText("Paso 1 de 2")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
		expect(screen.getByText("Turnos anteriores")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
		expect(screen.getByText("Tu turno de caja")).toBeTruthy();
	});

	it("al terminar o cerrar con Esc queda vista y no vuelve a abrirse sola", () => {
		render(<Pantalla ready={false} />);
		act(() => startAdminTour());
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(JSON.parse(localStorage.getItem("gcode-tours-seen:dueno")!)).toContain("caja");
	});

	it("se abre sola la primera vez en la pestaña, cuando terminó de cargar", () => {
		vi.useFakeTimers();
		const Panel = ({ loading }: { loading: boolean }) => (
			<>
				{loading ? <div className="admin-tab-skeleton">cargando</div> : null}
				<Pantalla />
			</>
		);
		const { rerender } = render(<Panel loading />);
		act(() => vi.advanceTimersByTime(2000));
		// Con la pestaña cargando espera
		expect(screen.queryByRole("dialog")).toBeNull();

		rerender(<Panel loading={false} />);
		act(() => vi.advanceTimersByTime(1000));
		expect(screen.getByRole("dialog", { name: "Guía: Tu turno de caja" })).toBeTruthy();
	});

	it("no se abre sola en una pestaña ya vista", () => {
		vi.useFakeTimers();
		localStorage.setItem("gcode-tours-seen:dueno", JSON.stringify(["caja"]));
		render(<Pantalla />);
		act(() => vi.advanceTimersByTime(3000));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("en el mismo navegador, otra cuenta la ve igual (y con su bienvenida)", () => {
		vi.useFakeTimers();
		localStorage.setItem("gcode-tours-seen:dueno", JSON.stringify(["orders", "caja"]));
		render(<Pantalla account="cajero" />);
		act(() => vi.advanceTimersByTime(1000));
		expect(screen.getByText("¡Hola! Te muestro tu panel")).toBeTruthy();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(JSON.parse(localStorage.getItem("gcode-tours-seen:cajero")!)).toEqual(["caja"]);
		expect(JSON.parse(localStorage.getItem("gcode-tours-seen:dueno")!)).toEqual(["orders", "caja"]);
	});

	it("cada pestaña se marca por separado", () => {
		vi.useFakeTimers();
		localStorage.setItem("gcode-tours-seen:dueno", JSON.stringify(["caja"]));
		render(<Pantalla tab="analytics" />);
		act(() => vi.advanceTimersByTime(1000));
		// En Reportes no hay nada de esta pantalla de prueba: sin pasos no se abre ni se marca
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(JSON.parse(localStorage.getItem("gcode-tours-seen:dueno")!)).toEqual(["caja"]);
	});

	it("la primera guía de todas empieza con la bienvenida", () => {
		localStorage.clear();
		render(<Pantalla ready={false} />);
		act(() => startAdminTour());
		expect(screen.getByText("¡Hola! Te muestro tu panel")).toBeTruthy();
	});

	it("el botón Guía no aparece en pestañas sin guía", () => {
		const { rerender } = render(<AdminGuideButton activeTab="caja" />);
		expect(screen.getByRole("button", { name: "Ver la guía de esta pantalla" })).toBeTruthy();
		rerender(<AdminGuideButton activeTab="module:addon-libro-caja" />);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
