import React from 'react';

/** Ícono bolsa (retiro / ya pagado). Basado en public/bag-svgrepo-com.svg */
export default function PickupBagIcon({ className, size = 24, ...props }) {
	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden={props['aria-label'] ? undefined : true}
			{...props}
		>
			<path
				d="M17.92,21H6.08a1,1,0,0,1-1-1.08l.85-11a1,1,0,0,1,1-.92H17.07a1,1,0,0,1,1,.92l.85,11A1,1,0,0,1,17.92,21Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9,11V6a3,3,0,0,1,3-3h0a3,3,0,0,1,3,3v5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
