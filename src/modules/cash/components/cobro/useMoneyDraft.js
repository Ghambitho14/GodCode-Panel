import { useState } from 'react';
import { parseMoneyInput } from '@/lib/money/minor-units';
import { minorToInputText } from './cobroPayment';

/**
 * Borrador de un campo de monto cuyo valor vive en unidades mínimas: mientras
 * se escribe se respeta el texto tal cual y al salir se reescribe formateado.
 */
export function useMoneyDraft({ valueMinor, onChangeMinor, currency, fractionDigits, locale }) {
	const [draft, setDraft] = useState(null);
	return {
		value: draft ?? minorToInputText(valueMinor, { currency, fractionDigits, locale }),
		onChange: (raw) => {
			setDraft(raw);
			if (!String(raw ?? '').trim()) {
				onChangeMinor(0);
				return;
			}
			const parsed = parseMoneyInput(raw, { currency, fractionDigits, locale });
			if (parsed.valid) onChangeMinor(parsed.minor);
		},
		onBlur: () => setDraft(null),
	};
}
