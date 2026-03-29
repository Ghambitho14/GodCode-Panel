import type { ReactNode } from "react";

import "../[subdomain]/tenant.css";

export default function TenantAdminRootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return children;
}
