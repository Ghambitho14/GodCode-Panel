import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AddonFrame from "@/addons/AddonFrame";

describe("marco de un extra abierto", () => {
	afterEach(cleanup);

	it("muestra el nombre y vuelve a Addons con la flecha", () => {
		const onBack = vi.fn();
		render(
			<AddonFrame title="Libro de caja" onBack={onBack}>
				<p>pantalla del extra</p>
			</AddonFrame>,
		);
		expect(screen.getByText("Libro de caja")).toBeTruthy();
		expect(screen.getByText("pantalla del extra")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /addons/i }));
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it("sin acceso a Addons no muestra la flecha", () => {
		render(
			<AddonFrame title="Libro de caja">
				<p>pantalla</p>
			</AddonFrame>,
		);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
