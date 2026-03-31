import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { PwaServiceWorkerRegister } from "../components/PwaServiceWorkerRegister";

import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "Panel del negocio",
	description: "Administracion de pedidos y operacion",
	applicationName: "Panel del negocio",
	appleWebApp: {
		capable: true,
		title: "Panel del negocio",
		statusBarStyle: "black-translucent",
	},
	icons: {
		icon: [
			{ url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
		],
		apple: "/pwa-icon-192.png",
	},
};

export const viewport: Viewport = {
	themeColor: "#0a0a0a",
	colorScheme: "dark",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="es" suppressHydrationWarning>
			<head>
				<link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
				{process.env.NEXT_PUBLIC_SUPABASE_URL ? (
					<link
						rel="preconnect"
						href={process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}
						crossOrigin="anonymous"
					/>
				) : null}
				<link rel="preload" href="/fonts/outfit.css" as="style" />
				<link rel="preload" href="/fonts/Outfit-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/Outfit-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased transition-colors duration-200`}
			>
				<PwaServiceWorkerRegister />
				{children}
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
	);
}
