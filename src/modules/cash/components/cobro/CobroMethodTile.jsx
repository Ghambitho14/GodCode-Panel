import React from 'react';
import { Check, Info } from 'lucide-react';

/**
 * Método de pago como botón conmutable. Si no se puede usar, el motivo va
 * escrito en la propia tarjeta: en una tablet no hay hover para leer un title.
 */
export default function CobroMethodTile({ Icon, label, meta, selected = false, disabledReason = null, onClick }) {
	const disabled = Boolean(disabledReason);
	return (
		<button
			type="button"
			className="cobro-method"
			aria-pressed={selected}
			disabled={disabled}
			onClick={onClick}
		>
			<span className="cobro-method__icon" aria-hidden>
				<Icon size={20} strokeWidth={2} />
				<span className="cobro-method__check">
					<Check size={11} strokeWidth={3.25} />
				</span>
			</span>
			<span className="cobro-method__body">
				<span className="cobro-method__label">{label}</span>
				<span className={`cobro-method__meta${disabled ? ' cobro-method__meta--blocked' : ''}`}>
					{disabled ? (
						<>
							<Info size={13} strokeWidth={2.25} aria-hidden />
							{disabledReason}
						</>
					) : meta}
				</span>
			</span>
		</button>
	);
}
