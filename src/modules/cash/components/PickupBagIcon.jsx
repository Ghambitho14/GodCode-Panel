import React from 'react';
import { ShoppingBag } from 'lucide-react';

/** Bolsa de retiro / ya pagado — wrapper de Lucide ShoppingBag. */
export default function PickupBagIcon({ size = 24, className = '', ...props }) {
	return <ShoppingBag size={size} className={className} aria-hidden={props['aria-label'] ? undefined : true} {...props} />;
}
