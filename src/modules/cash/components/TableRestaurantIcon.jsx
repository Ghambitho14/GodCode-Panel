import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

/** Mesa / salón — wrapper de Lucide UtensilsCrossed. */
export default function TableRestaurantIcon({ size = 24, className = '', ...props }) {
	return <UtensilsCrossed size={size} className={className} aria-hidden {...props} />;
}
