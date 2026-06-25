import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import PaymentDetails from "@/modules/cash/components/manual-order/PaymentDetails";

const baseOrder = {
	order_type: "pickup",
	total: 5000,
	items: [{ id: "1", name: "Pizza", quantity: 1, price: 5000 }],
	payment_mode: "single",
	payment_type: "tarjeta",
	cash_amount: 0,
	card_amount: 0,
	cash_tendered: "",
	coupon_code: "",
	delivery_fee: 0,
};

function PaymentDetailsHarness({ initialOrder = baseOrder, extraProps = {} }) {
	const [manualOrder, setManualOrder] = useState(initialOrder);

	return (
		<PaymentDetails
			manualOrder={manualOrder}
			branch={{ id: "b1", currency: "CLP" }}
			updateCouponCode={vi.fn()}
			couponPreview={null}
			updatePaymentType={(type) => setManualOrder((prev) => ({ ...prev, payment_type: type }))}
			updatePaymentMode={(mode) => setManualOrder((prev) => ({
				...prev,
				payment_mode: mode,
				...(mode === "mixed" ? { payment_type: "tienda" } : {}),
			}))}
			updateCashAmount={vi.fn()}
			updateCardAmount={vi.fn()}
			updateCashTendered={vi.fn()}
			receiptFile={null}
			receiptPreview={null}
			handleFileChange={vi.fn()}
			removeReceipt={vi.fn()}
			submitOrder={vi.fn()}
			loading={false}
			isFormValid={() => false}
			goPrevStep={null}
			hideCheckoutActions
			{...extraProps}
		/>
	);
}

describe("PaymentDetails", () => {
	let scrollIntoViewMock;

	beforeEach(() => {
		scrollIntoViewMock = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoViewMock;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("scrolls to cash tender section when EFECTIVO is selected", async () => {
		const user = userEvent.setup();
		render(<PaymentDetailsHarness />);

		await user.click(screen.getByRole("button", { name: /^EFECTIVO$/i }));

		await waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalled();
		});
	});

	it("scrolls when pago mixto is activated", async () => {
		const user = userEvent.setup();
		render(<PaymentDetailsHarness />);

		await user.click(screen.getByRole("button", { name: /Pago mixto \(efectivo \+ tarjeta\)/i }));

		await waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalled();
		});
	});
});
