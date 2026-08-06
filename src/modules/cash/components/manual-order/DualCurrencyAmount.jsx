import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { isVenezuelaCountry } from '@/lib/geo/tenant-locale';
import { fetchBcvRate, getCachedBcvRate } from '@/lib/money/bcv-rate';
import { parseExchangeRate, resolveCheckoutDualCurrency } from '@/lib/money/venezuela-payment-copy';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';

function localeLooksVenezuelan(locale) {
	return String(locale ?? '').trim().toLowerCase().startsWith('es-ve');
}

/**
 * Monto contable + equivalente en bolívares (difuminado) para locales VE.
 * Tasa: configurada en sucursal → branchExchangeRate / delivery → fallback BCV (como el menú).
 */
export default function DualCurrencyAmount({
	amount,
	country: countryProp = null,
	exchangeRate: exchangeRateProp = null,
	currency: currencyProp = null,
	locale: localeProp = null,
	formatPrimary = null,
	layout = 'stack',
	size = 'md',
	align = 'end',
	hidePrimary = false,
	hideSecondary = false,
	className,
	primaryClassName,
	secondaryClassName,
}) {
	const orderMoney = useOrderMoney();
	const { branchExchangeRate } = useAdmin();
	const country = countryProp || orderMoney.country;
	const currency = String(currencyProp || orderMoney.currency || 'USD').trim().toUpperCase() || 'USD';
	const formatPrimaryFn = formatPrimary || orderMoney.formatMoney;

	// En este panel, contabilidad USD implica flujo VE (precios en $ + equivalente Bs.).
	const looksVenezuelan = Boolean(
		orderMoney.isVenezuela
		|| isVenezuelaCountry(country)
		|| localeLooksVenezuelan(localeProp)
		|| currency === 'USD',
	);

	const configuredRate = parseExchangeRate(exchangeRateProp)
		?? parseExchangeRate(branchExchangeRate)
		?? parseExchangeRate(orderMoney.exchangeRate);

	const [bcvRate, setBcvRate] = useState(() => getCachedBcvRate());

	useEffect(() => {
		if (configuredRate != null || !looksVenezuelan) return undefined;
		let cancelled = false;
		void fetchBcvRate().then((rate) => {
			if (!cancelled && rate != null) setBcvRate(rate);
		});
		return () => {
			cancelled = true;
		};
	}, [configuredRate, looksVenezuelan]);

	const exchangeRate = configuredRate ?? (looksVenezuelan ? parseExchangeRate(bcvRate) : null);

	const { primary, secondary } = useMemo(
		() => resolveCheckoutDualCurrency({
			amount,
			country,
			exchangeRate,
			currency,
			formatPrimary: formatPrimaryFn,
			forceVenezuela: looksVenezuelan || currency === 'USD',
		}),
		[amount, country, exchangeRate, currency, formatPrimaryFn, looksVenezuelan],
	);

	const primarySize =
		size === 'lg' ? 'text-xl font-black' :
		size === 'sm' ? 'text-sm font-bold' :
		'text-base font-bold';

	const secondarySize =
		size === 'lg' ? 'text-[12px] font-semibold' :
		size === 'sm' ? 'text-[10px] font-medium' :
		'text-[11px] font-semibold';

	if (hidePrimary && !secondary) return null;

	return (
		<span
			className={cn(
				'gc-dual-money inline-flex tabular-nums',
				layout === 'inline' ? 'items-baseline gap-1.5' : 'flex-col gap-0.5',
				align === 'end' ? 'items-end text-right' : 'items-start text-left',
				layout === 'inline' && align === 'end' && 'justify-end',
				hidePrimary && 'gap-0',
				className,
			)}
			title={secondary ? `${primary} ≈ ${secondary}` : primary}
		>
			{!hidePrimary ? (
				<span className={cn(primarySize, 'leading-tight text-gc-text', primaryClassName)}>
					{primary}
				</span>
			) : null}
			{secondary && !hideSecondary ? (
				<span
					className={cn(
						secondarySize,
						'leading-tight text-gc-text-muted/75',
						layout === 'inline' && !hidePrimary && 'before:mr-0.5 before:content-["≈"]',
						secondaryClassName,
					)}
				>
					{layout === 'stack' || hidePrimary ? `≈ ${secondary}` : secondary}
				</span>
			) : null}
		</span>
	);
}
