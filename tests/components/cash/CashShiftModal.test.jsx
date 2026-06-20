import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CashShiftModal from "@/modules/cash/components/caja/CashShiftModal";

vi.mock("@/modules/cash/hooks/useBranchMoney", () => ({
	useBranchMoney: () => ({
		formatMoney: (n) => `$${Number(n).toLocaleString("es-CL")}`,
		currency: "CLP",
		locale: "es-CL",
	}),
}));

const activeShift = {
	id: "shift-1",
	opened_at: new Date().toISOString(),
	opening_balance: 10000,
	expected_balance: 25000,
};

const getTotals = () => ({ cash: 15000, card: 5000, online: 0, income: 20000 });

describe("CashShiftModal", () => {
	it("renders close shift form without crashing", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		const onClose = vi.fn();

		render(
			<CashShiftModal
				isOpen
				type="close"
				activeShift={activeShift}
				movements={[]}
				getTotals={getTotals}
				onConfirm={onConfirm}
				onClose={onClose}
			/>,
		);

		expect(screen.getByText("Cierre de caja")).toBeInTheDocument();
		expect(screen.getByText("Cuadre por método")).toBeInTheDocument();

		const cashInput = document.getElementById("counted-cash");
		expect(cashInput).toBeTruthy();
		await user.type(cashInput, "25000");
		expect(screen.getByText("Cuadrado")).toBeInTheDocument();
	});
});
