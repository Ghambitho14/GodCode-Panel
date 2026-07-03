import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase, TABLES, bootstrapSession, logout } from "@/integrations/supabase";
import type { DatabaseCompanyTheme } from "@/shared/types/company-theme";
import { buildTenantThemeCss } from "@/shared/utils/panel-theme-css";
import { buildResolvedTabLabels } from "@/shared/constants/admin-panel-tabs";
import {
	extractMenuSettingsFromIntegration,
	resolvePanelCapabilities,
} from "@/lib/tenant/menu-settings";
import "../styles/AdminContextualHelp.css";
import { AdminPage } from "./pages/Admin";
import { AdminProvider } from "./pages/AdminProvider";
import { LocationProvider } from "../context/LocationContext";
import { applyDocumentFavicon } from "@/shared/utils/documentFavicon";
import { resetDocumentMeta, setDocumentMeta } from "@/shared/utils/documentMeta";

interface CompanyProfile {
	country?: string | null;
	currency?: string | null;
	integration_settings?: unknown;
	planFeatures?: unknown;
}

interface AdminAppProps {
	/** Opcional: forzar empresa (solo si necesitás override explícito; por defecto se toma de la sesión). */
	companyId?: string;
	companyName?: string;
	logoUrl?: string | null;
	userEmail?: string | null;
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
	storefrontMenuUrl?: string | null;
	resolvedTabLabels?: Record<string, string>;
	adminShortcutsEnabled?: boolean;
	companyProfile?: CompanyProfile | null;
}

function extractPlanFeatures(planRow: unknown): unknown {
	if (!planRow || typeof planRow !== "object") return null;
	const row = planRow as Record<string, unknown>;
	if ("features" in row) return row.features;
	if (Array.isArray(planRow)) {
		const first = planRow[0];
		if (first && typeof first === "object" && "features" in (first as Record<string, unknown>)) {
			return (first as Record<string, unknown>).features;
		}
	}
	return null;
}

export function AdminApp({
	companyId: companyIdProp,
	companyName: companyNameProp = "Panel",
	logoUrl: logoUrlProp,
	userEmail: userEmailProp,
	initialUserRole = null,
	panelAccess: panelAccessProp,
	dynamicModules = [],
	primaryColor,
	storefrontMenuUrl = null,
	resolvedTabLabels: resolvedTabLabelsProp = {},
	adminShortcutsEnabled: adminShortcutsEnabledProp,
	companyProfile: companyProfileProp = null,
}: AdminAppProps) {
	const navigate = useNavigate();
	const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(() =>
		companyIdProp?.trim() ? companyIdProp.trim() : null,
	);
	const [resolvedCompanyName, setResolvedCompanyName] = useState(companyNameProp);
	const [resolvedUserEmail, setResolvedUserEmail] = useState<string | null>(userEmailProp ?? null);
	const [resolvedThemeConfig, setResolvedThemeConfig] = useState<DatabaseCompanyTheme | null>(null);
	const [resolvedCompanyProfile, setResolvedCompanyProfile] = useState<CompanyProfile | null>(
		companyProfileProp,
	);
	const [resolvedPanelAccess, setResolvedPanelAccess] = useState<string[] | null | undefined>(
		panelAccessProp,
	);
	const [resolvedTabLabels, setResolvedTabLabels] = useState<Record<string, string>>(
		resolvedTabLabelsProp,
	);
	const [resolvedAdminShortcutsEnabled, setResolvedAdminShortcutsEnabled] = useState(
		adminShortcutsEnabledProp ?? true,
	);
	const [resolvedUserRole, setResolvedUserRole] = useState<string | null>(initialUserRole);
	const [resolvedAssignedBranchId, setResolvedAssignedBranchId] = useState<string | null>(null);
	const [gateLoading, setGateLoading] = useState(() => !companyIdProp?.trim());

	const applyCompanyRow = (co: Record<string, unknown> | null | undefined) => {
		if (!co) return;
		const theme = (co.theme_config as DatabaseCompanyTheme) ?? null;
		setResolvedThemeConfig(theme);
		setResolvedCompanyProfile({
			country: typeof co.country === "string" ? co.country : null,
			currency: typeof co.currency === "string" ? co.currency : null,
			integration_settings: co.integration_settings ?? null,
			planFeatures: extractPlanFeatures(co.plans),
		});
		if (panelAccessProp == null) {
			setResolvedPanelAccess(Array.isArray(theme?.panelAccess) ? theme.panelAccess : null);
		}
		if (!Object.keys(resolvedTabLabelsProp).length) {
			setResolvedTabLabels(buildResolvedTabLabels(theme?.tabLabels));
		}
		if (adminShortcutsEnabledProp == null) {
			setResolvedAdminShortcutsEnabled(theme?.adminShortcutsEnabled !== false);
		}
	};

	useEffect(() => {
		let cancelled = false;

		if (companyIdProp?.trim()) {
			const cid = companyIdProp.trim();
			setResolvedCompanyId(cid);
			setGateLoading(false);
			void bootstrapSession().then((user) => {
				if (cancelled) return;
				const em = user?.email?.trim().toLowerCase() ?? null;
				setResolvedUserEmail(em);
			});
			void supabase
				.from(TABLES.companies)
				.select("theme_config, country, currency, integration_settings, plan_id, plans(features)")
				.eq("id", cid)
				.maybeSingle()
				.then(({ data: co }) => {
					if (cancelled) return;
					applyCompanyRow(co as Record<string, unknown> | null);
				});
			return () => {
				cancelled = true;
			};
		}

		(async () => {
			const sessionUser = await bootstrapSession();
			if (!sessionUser) {
				navigate("/", { replace: true });
				return;
			}
			const uid = sessionUser.id;
			const emailNorm = sessionUser.email?.trim().toLowerCase() ?? "";

			let { data: row } = await supabase
				.from(TABLES.users)
				.select("company_id, role, branch_id")
				.eq("auth_user_id", uid)
				.maybeSingle();

			if (!row?.company_id && emailNorm) {
				const r2 = await supabase
					.from(TABLES.users)
					.select("company_id, role, branch_id")
					.ilike("email", emailNorm)
					.maybeSingle();
				row = r2.data;
			}

			if (cancelled) return;

			if (!row?.company_id) {
				await logout();
				navigate("/", { replace: true });
				return;
			}

			const cid = String(row.company_id);

			const { data: co } = await supabase
				.from(TABLES.companies)
				.select("name, theme_config, country, currency, integration_settings, plan_id, plans(features)")
				.eq("id", cid)
				.maybeSingle();

			if (cancelled) return;

			setResolvedCompanyId(cid);
			if (co?.name) setResolvedCompanyName(co.name);
			applyCompanyRow(co as Record<string, unknown> | null);
			setResolvedUserEmail(emailNorm || null);
			setResolvedUserRole((row.role as string | null) ?? null);
			setResolvedAssignedBranchId(row.branch_id ? String(row.branch_id) : null);
			setGateLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [companyIdProp, navigate, panelAccessProp, resolvedTabLabelsProp, adminShortcutsEnabledProp]);

	const menuCapabilities = useMemo(() => {
		const profile = companyProfileProp ?? resolvedCompanyProfile;
		const menuSettings = extractMenuSettingsFromIntegration(profile?.integration_settings);
		return resolvePanelCapabilities(menuSettings, profile?.planFeatures);
	}, [companyProfileProp, resolvedCompanyProfile]);

	const themeLogoUrl = useMemo(() => {
		return typeof resolvedThemeConfig?.logoUrl === "string" && resolvedThemeConfig.logoUrl.trim()
			? resolvedThemeConfig.logoUrl.trim()
			: null;
	}, [resolvedThemeConfig]);
	const effectiveLogoUrl = logoUrlProp ?? themeLogoUrl;
	const effectiveCompanyProfile = companyProfileProp ?? resolvedCompanyProfile;
	const effectivePanelAccess = panelAccessProp ?? resolvedPanelAccess;
	const effectiveTabLabels = Object.keys(resolvedTabLabelsProp).length
		? resolvedTabLabelsProp
		: resolvedTabLabels;
	const effectiveAdminShortcuts =
		adminShortcutsEnabledProp ?? resolvedAdminShortcutsEnabled;

	useEffect(() => {
		if (gateLoading || !resolvedCompanyId) return;
		applyDocumentFavicon(effectiveLogoUrl);
		setDocumentMeta({
			title: resolvedCompanyName,
			description: `Panel de caja y operación de ${resolvedCompanyName}`,
			imageUrl: effectiveLogoUrl,
		});
		return () => {
			applyDocumentFavicon(null);
			resetDocumentMeta();
		};
	}, [effectiveLogoUrl, gateLoading, resolvedCompanyId, resolvedCompanyName]);

	if (gateLoading || !resolvedCompanyId) {
		return (
			<div
				className="admin-gate-loading"
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "40vh",
					gap: 10,
				}}
			>
				<Loader2 className="animate-spin" size={22} aria-hidden />
				<span>Cargando tu cuenta...</span>
			</div>
		);
	}

	return (
		<>
			<style>{buildTenantThemeCss({ theme_config: resolvedThemeConfig })}</style>
			<div className="tenant-theme-vars">
				<LocationProvider companyId={resolvedCompanyId}>
					<AdminProvider
						companyId={resolvedCompanyId}
						initialUserRole={initialUserRole ?? resolvedUserRole}
						initialAssignedBranchId={resolvedAssignedBranchId}
						panelAccess={effectivePanelAccess}
						dynamicModules={dynamicModules}
						resolvedTabLabels={effectiveTabLabels}
						adminShortcutsEnabled={effectiveAdminShortcuts}
						companyProfile={effectiveCompanyProfile}
						menuCapabilities={menuCapabilities}
					>
						<AdminPage
							companyName={resolvedCompanyName}
							logoUrl={effectiveLogoUrl}
							userEmail={resolvedUserEmail ?? userEmailProp}
							primaryColor={primaryColor}
							storefrontMenuUrl={storefrontMenuUrl}
						/>
					</AdminProvider>
				</LocationProvider>
			</div>
		</>
	);
}
