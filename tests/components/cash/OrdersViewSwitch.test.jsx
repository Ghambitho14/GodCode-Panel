import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrdersViewSwitch from "@/modules/cash/components/OrdersViewSwitch";

describe("OrdersViewSwitch", () => {
	it("renders mesas and pedido options", () => {
		render(<OrdersViewSwitch value="mesas" onChange={() => {}} />);
		expect(screen.getByRole("group", { name: "Vista de pedidos" })).toBeTruthy();
		expect(screen.getByRole("button", { name: /mesas/i })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: /pedido/i })).toHaveAttribute("aria-pressed", "false");
	});

	it("calls onChange when switching view", () => {
		const onChange = vi.fn();
		render(<OrdersViewSwitch value="mesas" onChange={onChange} />);
		fireEvent.click(screen.getByRole("button", { name: /pedido/i }));
		expect(onChange).toHaveBeenCalledWith("pedido");
	});
});
