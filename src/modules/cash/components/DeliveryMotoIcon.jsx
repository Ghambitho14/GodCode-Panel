import React from 'react';
import { Bike } from 'lucide-react';

/** Delivery / moto — wrapper de Lucide Bike. */
export default function DeliveryMotoIcon({ size = 24, className = '', ...props }) {
	return <Bike size={size} className={className} aria-hidden {...props} />;
}
