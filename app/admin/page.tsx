import { redirect } from "next/navigation";

import { AdminApp } from "../../components/tenant/admin/admin-app";
import { TenantShell } from "../../components/tenant/tenant-shell";
import { buildTenantThemeCss } from "../../lib/panel-theme-css";
import { getStorefrontMenuUrl } from "../../lib/storefront-url";
import { createSupabaseServerClient } from "../../utils/supabase/server";
import {
	buildResolvedTabLabels,
	normalizeTenantPanelUserRole,
} from "../../lib/tenant-admin-tabs";
import {
	filterDynamicAdminModules,
	parseAdminPanelThemeExtensions,
} from "../../lib/admin-theme-config";
import type { DatabaseCompanyTheme } from "../../lib/company-theme-types";

export const dynamic = "force-dynamic";

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

export default async function TenantAdminPage() {
	const supabase = await createSupabaseServerClient("tenant");
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.email) {
		redirect("/");
	}

	const allowedRoles = new Set(["owner", "admin", "ceo", "cashier"]);

	const { data: byAuth } = await supabase
		.from("users")
		.select("id,role,allowed_tabs,company_id")
		.eq("auth_user_id", user.id)
		.maybeSingle();

	let staffRow =
		byAuth && allowedRoles.has(String(byAuth.role ?? "").toLowerCase())
			? byAuth
			: null;

	if (!staffRow) {
		const { data: byEmail } = await supabase
			.from("users")
			.select("id,role,allowed_tabs,company_id")
			.ilike("email", user.email.trim());

		staffRow =
			(byEmail ?? []).find((row) =>
				allowedRoles.has(String(row.role ?? "").toLowerCase()),
			) ?? null;
	}

	if (!staffRow?.company_id) {
		redirect("/");
	}

	const { data: company } = await supabase
		.from("companies")
		.select("id,name,theme_config,public_slug")
		.eq("id", staffRow.company_id)
		.maybeSingle();

	if (!company) {
		redirect("/");
	}

	const name =
		(company.theme_config as { displayName?: string } | null)?.displayName ??
		company.name ??
		"GodCode";
	const logoUrl =
		(company.theme_config as { logoUrl?: string | null } | null)?.logoUrl ?? null;
	const themeConfig = company.theme_config as DatabaseCompanyTheme | null | undefined;
	const roleNavPermissions = themeConfig?.roleNavPermissions ?? null;

	const adminThemeExt = parseAdminPanelThemeExtensions(themeConfig ?? null);
	const resolvedTabLabels = buildResolvedTabLabels(adminThemeExt.tabLabels ?? null);

	const userAllowedTabs = Array.isArray(staffRow.allowed_tabs)
		? staffRow.allowed_tabs
		: null;

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

	const hasTicketsModule = dynamicModules.some(
		(module) => module.tabId === "module:tickets",
	);
	if (!hasTicketsModule && adminThemeExt.injectTicketsModuleIfMissing !== false) {
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

	const storefrontMenuUrl = getStorefrontMenuUrl(company.public_slug);

	const initialUserRole = normalizeTenantPanelUserRole(staffRow.role);

	return (
		<>
			<style>{buildTenantThemeCss(company)}</style>
			<div className="tenant-theme-vars">
				<TenantShell>
					<AdminApp
						companyId={company.id}
						companyName={name}
						logoUrl={logoUrl}
						userEmail={user.email ?? null}
						initialUserRole={initialUserRole}
						roleNavPermissions={roleNavPermissions as Record<string, string[]> | null}
						userAllowedTabs={userAllowedTabs}
						dynamicModules={dynamicModules}
						storefrontMenuUrl={storefrontMenuUrl}
						resolvedTabLabels={resolvedTabLabels}
						adminShortcutsEnabled={adminThemeExt.adminShortcutsEnabled}
					/>
				</TenantShell>
			</div>
		</>
	);
}
