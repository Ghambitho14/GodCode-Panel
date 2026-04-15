"use client";

import "./kit/admin/styles/AdminContextualHelp.css";
import { AdminPage } from "./kit/admin/pages/Admin";
import { AdminProvider } from "./kit/admin/pages/AdminProvider";
import { LocationProvider } from "./kit/context/LocationContext";
import { CashProvider } from "./kit/context/CashContext";
import { BusinessProvider } from "./kit/context/BusinessContext";

interface AdminAppProps {
	companyId: string;
	companyName: string;
	logoUrl?: string | null;
	userEmail?: string | null;
	/** Rol ya resuelto en el servidor (evita flash de permisos de cajero antes de verifyAdminAccess). */
	initialUserRole?: string | null;
	panelAccess?: string[] | null;
	dynamicModules?: {
		id: string;
		tabId: string;
		label: string;
		description: string;
		navGroup: "root" | "sales" | "menu";
		navOrder: number;
		allowedRoles: string[];
		isActive: boolean;
	}[];
	primaryColor?: string;
	/** URL absoluta al menú público en el monolito (slug.dominio/menu). */
	storefrontMenuUrl?: string | null;
	/** Labels por id de pestaña (base + theme_config.tabLabels). */
	resolvedTabLabels?: Record<string, string>;
	adminShortcutsEnabled?: boolean;
}

export function AdminApp({
	companyId,
	companyName,
	logoUrl,
	userEmail,
	initialUserRole = null,
	panelAccess,
	dynamicModules = [],
	primaryColor,
	storefrontMenuUrl = null,
	resolvedTabLabels = {},
	adminShortcutsEnabled = true,
}: AdminAppProps) {
	return (
		<LocationProvider>
			<CashProvider>
				<BusinessProvider>
					<AdminProvider
						companyId={companyId}
						initialUserRole={initialUserRole}
						panelAccess={panelAccess}
						dynamicModules={dynamicModules}
						resolvedTabLabels={resolvedTabLabels}
						adminShortcutsEnabled={adminShortcutsEnabled}
					>
						<AdminPage
							companyName={companyName}
							logoUrl={logoUrl}
							userEmail={userEmail}
							primaryColor={primaryColor}
							storefrontMenuUrl={storefrontMenuUrl}
						/>
					</AdminProvider>
				</BusinessProvider>
			</CashProvider>
		</LocationProvider>
	);
}
