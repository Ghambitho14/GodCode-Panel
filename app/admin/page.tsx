"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { AdminApp } from "../../components/tenant/admin/admin-app";
import { TenantShell } from "../../components/tenant/tenant-shell";
import { buildTenantThemeCss } from "../../lib/panel-theme-css";
import { createSupabaseBrowserClient } from "../../utils/supabase/client";
import {
	buildResolvedTabLabels,
	normalizeTenantPanelUserRole,
} from "../../lib/tenant-admin-tabs";
import {
	filterDynamicAdminModules,
	parseAdminPanelThemeExtensions,
} from "../../lib/admin-theme-config";
import type { DatabaseCompanyTheme } from "../../lib/company-theme-types";

function normalizePanelAccess(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const tabs = raw
		.filter((tab): tab is string => typeof tab === "string")
		.map((tab) => tab.trim())
		.filter((tab) => tab.length > 0);

	if (tabs.length === 0) return null;
	return [...new Set(tabs)];
}

function deriveCompanyPanelAccess(themeConfig: DatabaseCompanyTheme | null | undefined): string[] | null {
	const fromPanelAccess = normalizePanelAccess(themeConfig?.panelAccess);
	if (fromPanelAccess) return fromPanelAccess;

	const roleNavPermissions = themeConfig?.roleNavPermissions;
	if (!roleNavPermissions || typeof roleNavPermissions !== "object") return null;

	const flattened = Object.values(roleNavPermissions as Record<string, unknown[]>).flat();
	return normalizePanelAccess(flattened);
}

interface DynamicAdminModule {
	id: string;
	tab_id: string;
	label: string;
	description: string | null;
	nav_group: "root" | "sales" | "menu";
	nav_order: number;
	allowed_roles: string[] | null;
	is_active: boolean;
}

interface AdminData {
	companyId: string;
	companyName: string;
	logoUrl: string | null;
	userEmail: string;
	initialUserRole: string | null;
	panelAccess: string[] | null;
	dynamicModules: {
		id: string;
		tabId: string;
		label: string;
		description: string;
		navGroup: "root" | "sales" | "menu";
		navOrder: number;
		allowedRoles: string[];
		isActive: boolean;
	}[];
	resolvedTabLabels: Record<string, string>;
	adminShortcutsEnabled: boolean;
	company: { id: string; name: string | null; theme_config: unknown; public_slug: string | null };
}

export default function TenantAdminPage() {
	const router = useRouter();
	const [adminData, setAdminData] = useState<AdminData | null>(null);
	const [loading, setLoading] = useState(true);

	const loadAdminData = useCallback(async () => {
		const supabase = createSupabaseBrowserClient("tenant");
		const {
			data: { user },
		} = await supabase.auth.getUser();

		if (!user?.email) {
			router.replace("/");
			return;
		}

		const allowedRoles = new Set(["owner", "admin", "ceo", "cashier"]);

		const { data: byAuth } = await supabase
			.from("users")
			.select("id,role,company_id")
			.eq("auth_user_id", user.id)
			.maybeSingle();

		let staffRow =
			byAuth && allowedRoles.has(String(byAuth.role ?? "").toLowerCase())
				? byAuth
				: null;

		if (!staffRow) {
			const { data: byEmail } = await supabase
				.from("users")
				.select("id,role,company_id")
				.ilike("email", user.email.trim())
				.limit(10);

			const candidateRows = (byEmail ?? []).filter((row) =>
				allowedRoles.has(String(row.role ?? "").toLowerCase()),
			);
			const candidateCompanyIds = [
				...new Set(candidateRows.map((row) => row.company_id).filter(Boolean)),
			];

			if (candidateCompanyIds.length === 1) {
				staffRow =
					candidateRows.find((row) => row.company_id === candidateCompanyIds[0]) ?? null;
			}
		}

		if (!staffRow?.company_id) {
			router.replace("/");
			return;
		}

		const { data: company } = await supabase
			.from("companies")
			.select("id,name,theme_config,public_slug")
			.eq("id", staffRow.company_id)
			.maybeSingle();

		if (!company) {
			router.replace("/");
			return;
		}

		const name =
			(company.theme_config as { displayName?: string } | null)?.displayName ??
			company.name ??
			"GodCode";
		const logoUrl =
			(company.theme_config as { logoUrl?: string | null } | null)?.logoUrl ?? null;
		const themeConfig = company.theme_config as DatabaseCompanyTheme | null | undefined;
		const panelAccess = deriveCompanyPanelAccess(themeConfig);

		const adminThemeExt = parseAdminPanelThemeExtensions(themeConfig ?? null);
		const resolvedTabLabels = buildResolvedTabLabels(adminThemeExt.tabLabels ?? null);

		const { data: dynamicModulesData } = await supabase
			.from("saas_admin_modules")
			.select("id,tab_id,label,description,nav_group,nav_order,allowed_roles,is_active")
			.eq("is_active", true)
			.order("nav_group", { ascending: true })
			.order("nav_order", { ascending: true })
			.order("label", { ascending: true });

		let dynamicModules = ((dynamicModulesData ?? []) as DynamicAdminModule[]).map(
			(module) => ({
				id: module.id,
				tabId: module.tab_id,
				label: module.label,
				description: module.description ?? "",
				navGroup: module.nav_group,
				navOrder: module.nav_order,
				allowedRoles: Array.isArray(module.allowed_roles)
					? module.allowed_roles
					: ["admin", "ceo"],
				isActive: module.is_active,
			}),
		);

		dynamicModules = filterDynamicAdminModules(
			dynamicModules,
			adminThemeExt.enabledAdminModuleTabIds ?? null,
		);

		if (
			!dynamicModules.some((m) => m.tabId === "module:tickets") &&
			adminThemeExt.injectTicketsModuleIfMissing !== false
		) {
			dynamicModules.push({
				id: "system-module-tickets",
				tabId: "module:tickets",
				label: "Soporte",
				description: "Crea y da seguimiento a tickets de soporte.",
				navGroup: "root",
				navOrder: 85,
				allowedRoles: ["admin", "ceo", "cashier"],
				isActive: true,
			});
		}

		setAdminData({
			companyId: company.id,
			companyName: name,
			logoUrl,
			userEmail: user.email,
			initialUserRole: normalizeTenantPanelUserRole(staffRow.role),
			panelAccess,
			dynamicModules,
			resolvedTabLabels,
			adminShortcutsEnabled: adminThemeExt.adminShortcutsEnabled,
			company,
		});
		setLoading(false);
	}, [router]);

	useEffect(() => {
		loadAdminData().catch(() => router.replace("/"));
	}, [loadAdminData, router]);

	if (loading) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					background: "#0a0a0a",
					color: "#fff",
					fontSize: "1rem",
					gap: "0.75rem",
				}}
			>
				<span
					style={{
						display: "inline-block",
						width: 20,
						height: 20,
						border: "2px solid #fff",
						borderTopColor: "transparent",
						borderRadius: "50%",
						animation: "spin 0.7s linear infinite",
					}}
				/>
				<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
				Cargando panel...
			</div>
		);
	}

	if (!adminData) return null;

	return (
		<>
			<style>{buildTenantThemeCss(adminData.company)}</style>
			<div className="tenant-theme-vars">
				<TenantShell>
					<AdminApp
						companyId={adminData.companyId}
						companyName={adminData.companyName}
						logoUrl={adminData.logoUrl}
						userEmail={adminData.userEmail}
						initialUserRole={adminData.initialUserRole}
						panelAccess={adminData.panelAccess}
						dynamicModules={adminData.dynamicModules}
						storefrontMenuUrl={null}
						resolvedTabLabels={adminData.resolvedTabLabels}
						adminShortcutsEnabled={adminData.adminShortcutsEnabled}
					/>
				</TenantShell>
			</div>
		</>
	);
}
