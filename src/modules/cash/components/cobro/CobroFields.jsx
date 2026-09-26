import React, { useId } from 'react';
import { minorToInputText, suggestTenderMinors } from './cobroPayment';
import { useRevealOnMount } from './useRevealOnMount';

/** Bloque de un método elegido; se trae a la vista al aparecer. */
export function CobroLine({ children }) {
	const ref = useRevealOnMount();
	return <div ref={ref} className="cobro-line">{children}</div>;
}

/** Campo de monto: código de moneda fijo a la izquierda y la cifra a la derecha. */
export function CobroMoneyField({ label, currency, value, placeholder, onChange, onBlur, action, invalid = false }) {
	const id = useId();
	return (
		<div className="cobro-field">
			<div className="cobro-field__top">
				<label className="cobro-field__label" htmlFor={id}>
					{label}
					<span className="sr-only"> en {currency}</span>
				</label>
				{action}
			</div>
			<div className="cobro-field__control" data-invalid={invalid ? 'true' : undefined}>
				<span className="cobro-field__prefix" aria-hidden>{currency}</span>
				<input
					id={id}
					className="cobro-field__input"
					type="text"
					inputMode="decimal"
					autoComplete="off"
					spellCheck={false}
					value={value}
					placeholder={placeholder}
					aria-invalid={invalid || undefined}
					onChange={(event) => onChange(event.target.value)}
					onBlur={onBlur}
				/>
			</div>
		</div>
	);
}

/** Botón secundario dentro de la cabecera de un campo ("Resto USD 14,00"). */
export function CobroFieldAction({ label, amount, onClick }) {
	return (
		<button type="button" className="cobro-field__action" onClick={onClick}>
			{label} <span className="cobro-field__action-amount">{amount}</span>
		</button>
	);
}

/**
 * Efectivo recibido: campo, atajos (exacto y redondeos a billetes) y vuelto.
 * `tenderedMinor` null significa "sin confirmar"; el dominio lo toma como exacto.
 */
export function CobroTender({
	dueMinor,
	tenderedMinor,
	currency,
	fractionDigits,
	locale,
	denominations,
	formatIn,
	field,
	onPick,
}) {
	const suggestions = suggestTenderMinors(dueMinor, denominations, { currency, fractionDigits });
	const tendered = tenderedMinor == null ? null : Number(tenderedMinor);
	const change = tendered != null ? tendered - dueMinor : 0;
	const short = tendered != null && tendered > 0 && tendered < dueMinor;
	const chips = [{ key: 'exact', minor: dueMinor, label: 'Exacto' }, ...suggestions.map((minor) => ({
		key: String(minor),
		minor,
		label: formatIn(minor, currency),
	}))];

	return (
		<div className="cobro-tender">
			<CobroMoneyField
				label="Recibido"
				currency={currency}
				value={field.value}
				placeholder={dueMinor > 0 ? minorToInputText(dueMinor, { currency, fractionDigits, locale }) : '0'}
				onChange={field.onChange}
				onBlur={field.onBlur}
				invalid={short}
			/>
			{dueMinor > 0 ? (
				<div className="cobro-chips" role="group" aria-label="Montos recibidos frecuentes">
					{chips.map((chip) => (
						<button
							key={chip.key}
							type="button"
							className="cobro-chip"
							aria-pressed={tendered === chip.minor}
							onClick={() => onPick(chip.minor)}
						>
							{chip.label}
						</button>
					))}
				</div>
			) : null}
			{change > 0 ? (
				<div className="cobro-change" role="status">
					<span className="cobro-change__label">Vuelto</span>
					<span className="cobro-change__amount">{formatIn(change, currency)}</span>
				</div>
			) : short ? (
				<div className="cobro-change cobro-change--short" role="status">
					<span className="cobro-change__label">Faltan por recibir</span>
					<span className="cobro-change__amount">{formatIn(dueMinor - tendered, currency)}</span>
				</div>
			) : null}
		</div>
	);
}
