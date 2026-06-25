import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProductCard from "@/modules/cash/components/manual-order/ProductCard";

vi.mock("@/modules/cash/hooks/useBranchMoney", () => ({
	useBranchMoney: () => ({
		formatMoney: (n) => `$${Number(n).toLocaleString("es-CL")}`,
		currency: "CLP",
		locale: "es-CL",
	}),
}));

const product = {
	id: "p1",
	name: "Pizza",
	price: 5000,
	has_discount: false,
	description: "Deliciosa",
};

describe("ProductCard", () => {
	it("calls addItem when plus clicked", async () => {
		const user = userEvent.setup();
		const addItem = vi.fn();
		render(
			<ProductCard
				product={product}
				quantity={0}
				addItem={addItem}
				updateQuantity={vi.fn()}
				removeItem={vi.fn()}
				showProductImages={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Agregar Pizza/i }));
		expect(addItem).toHaveBeenCalledWith(product);
	});

	it("shows strikethrough price and discount price when product has discount", () => {
		render(
			<ProductCard
				product={{ ...product, has_discount: true, discount_price: 4000 }}
				quantity={1}
				addItem={vi.fn()}
				updateQuantity={vi.fn()}
				removeItem={vi.fn()}
				showProductImages={false}
			/>,
		);
		expect(screen.getByText("$5.000")).toHaveClass("line-through");
		expect(screen.getByText("$4.000")).toBeInTheDocument();
		expect(screen.queryByText("Oferta")).not.toBeInTheDocument();
	});
});
