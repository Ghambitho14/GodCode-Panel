import React, { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Loader2, Puzzle } from "lucide-react";
import { addonTabId, getAddonModule } from "@/addons/registry";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import { ADMIN_PANEL_TAB_OPTIONS, normalizeStoredNavTabId } from "@/shared/constants/admin-panel-tabs";
import { COMPANY_ADDONS_SELECT, activeCompanyAddons } from "@/lib/tenant/company-addons";
import "../styles/AdminAddons.css";

const ACCOUNT_PLAN_URL = "https://www.godcode.me/cuenta?tab=plan";

const TAB_LABELS = new Map(ADMIN_PANEL_TAB_OPTIONS.map((tab) => [tab.id, tab.label]));

const dayFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" });

/**
 * Pestaña «Addons»: los extras vigentes de la empresa y lo que desbloquean. Solo informa:
 * los extras se piden y se pagan en la cuenta GodCode del dueño (/cuenta › Plan y extras).
 */
export default function AdminAddons() {
	const { companyId, resolvedTabLabels: tabLabels, canAccessTab, setActiveTab } = useAdmin();
	const [addons, setAddons] = useState(null);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!companyId) return undefined;
		let alive = true;
		void supabase
			.from("company_addons")
			.select(COMPANY_ADDONS_SELECT)
			.eq("company_id", companyId)
			.then(({ data, error: readError }) => {
				if (!alive) return;
				if (readError) {
					setError("No pudimos leer tus extras. Intenta de nuevo en un rato.");
					return;
				}
				setAddons(activeCompanyAddons(data));
			});
		return () => {
			alive = false;
		};
	}, [companyId]);

	const tabName = (id) => {
		const key = normalizeStoredNavTabId(id);
		return tabLabels?.[key] || TAB_LABELS.get(key) || id;
	};

	return (
		<div className="admin-addons">
			<header className="admin-addons__head">
				<div>
					<h2 className="admin-addons__title">
						<Puzzle size={18} aria-hidden /> Addons
					</h2>
					<p className="admin-addons__text">Los extras que tiene tu negocio además de su plan.</p>
				</div>
				<Button variant="ghost" size="sm" asChild>
					<a href={ACCOUNT_PLAN_URL} target="_blank" rel="noopener noreferrer">
						<ExternalLink aria-hidden /> Ver en mi cuenta
					</a>
				</Button>
			</header>

			{error ? <p className="admin-addons__error">{error}</p> : null}

			{addons === null && !error ? (
				<div className="admin-addons__loading">
					<Loader2 className="animate-spin" size={18} aria-hidden /> Cargando extras…
				</div>
			) : null}

			{addons && addons.length === 0 ? (
				<section className="admin-addons__empty">
					<Puzzle size={28} aria-hidden />
					<p className="admin-addons__empty-title">No tienes addons personalizados ni extras</p>
					<p className="admin-addons__text">
						El dueño puede pedirlos en su cuenta GodCode › <strong>Plan y extras</strong>: ahí están los extras disponibles
						y puede pedir uno a medida.
					</p>
				</section>
			) : null}

			{addons && addons.length > 0 ? (
				<div className="admin-addons__grid">
					{addons.map((addon) => (
						<article key={addon.id} className="admin-addons__card">
							<p className="admin-addons__name">{addon.name}</p>
							{addon.description ? <p className="admin-addons__text">{addon.description}</p> : null}
							{addon.unlocksTabs.length > 0 ? (
								<p className="admin-addons__text">
									Desbloquea: <strong>{addon.unlocksTabs.map(tabName).join(", ")}</strong>
								</p>
							) : null}
							<p className="admin-addons__meta">
								<CalendarClock size={14} aria-hidden />
								{addon.expiresAt ? `Vigente hasta el ${dayFmt.format(new Date(addon.expiresAt))}` : "Sin vencimiento"}
							</p>
							{addon.panelModule && getAddonModule(addon.panelModule) && canAccessTab?.(addonTabId(addon.panelModule)) ? (
								<div className="admin-addons__actions">
									<Button type="button" size="sm" onClick={() => setActiveTab(addonTabId(addon.panelModule))}>
										Abrir
									</Button>
								</div>
							) : null}
						</article>
					))}
				</div>
			) : null}

			{addons && addons.length > 0 ? (
				<p className="admin-addons__text admin-addons__foot">
					¿Necesitas algo más? El dueño puede pedir un extra a medida en su cuenta GodCode › Plan y extras.
				</p>
			) : null}
		</div>
	);
}
