import React from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

/**
 * Select del modal de cupones: portal Radix (no nativo), ancho del trigger, z-index sobre el modal.
 */
export default function CouponFormSelect({
	id,
	value,
	onValueChange,
	disabled = false,
	placeholder = "Elegir…",
	options = [],
	"aria-label": ariaLabel,
}) {
	const safeValue = value == null || value === "" ? undefined : String(value);

	return (
		<Select
			value={safeValue}
			onValueChange={onValueChange}
			disabled={disabled}
		>
			<SelectTrigger
				id={id}
				aria-label={ariaLabel}
				className="coupon-form-modal__select-trigger"
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent
				className="coupon-form-modal__select-content"
				position="popper"
				sideOffset={6}
				collisionPadding={12}
			>
				{options.map((opt) => (
					<SelectItem
						key={String(opt.value)}
						value={String(opt.value)}
						disabled={opt.disabled}
					>
						{opt.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
