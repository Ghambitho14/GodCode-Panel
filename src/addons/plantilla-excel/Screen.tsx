import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import { createMoneyFormatter } from "@/shared/utils/money";

import { useAddonData } from "../useAddonData";
import HojaCalculo from "./HojaCalculo";
import { reviveWorkbook } from "./hoja-calculo";

type AdminSlice = {
	companyId?: string | null;
	companyProfile?: { currency?: string | null; country?: string | null } | null;
	selectedBranch?: { id?: string | null; name?: string | null; currency?: string | null; country?: string | null } | null;
};

type SheetScreenProps = {
	companyId: string | null;
	branchId: string;
	localKey: string;
	locale: string;
	branchName: string | null;
};

/** Una hoja por empresa y sucursal, guardada en Supabase (`addon_data`). */
function SheetScreen({ companyId, branchId, localKey, locale, branchName }: SheetScreenProps) {
	const { data, setData, status, savedAt, loadError, reload } = useAddonData({
		addon: "plantilla-excel",
		dataKey: branchId,
		companyId,
		revive: reviveWorkbook,
		localKey,
	});

	if (loadError) {
		return (
			<div className="hoja-state" role="alert">
				<p>No pudimos abrir la hoja. Revisa la conexión y vuelve a intentar.</p>
				<button type="button" className="hoja__btn" onClick={reload}>
					<RefreshCw size={14} aria-hidden="true" />
					Reintentar
				</button>
			</div>
		);
	}
	if (!data) {
		return (
			<div className="hoja-state" role="status">
				<Loader2 className="animate-spin" size={18} aria-hidden="true" />
				Abriendo la hoja…
			</div>
		);
	}
	return (
		<HojaCalculo
			book={data}
			onBookChange={setData}
			saveStatus={status === "loading" ? "saved" : status}
			savedAt={savedAt}
			zoomKey={`${localKey}:zoom`}
			locale={locale}
			branchName={branchName}
		/>
	);
}

/** Entrada del extra: toma empresa, sucursal y formato de números del panel y pinta la hoja. */
export default function HojaScreen() {
	const { companyId, companyProfile, selectedBranch } = useAdmin() as AdminSlice;
	const money = useMemo(() => createMoneyFormatter(selectedBranch, companyProfile), [selectedBranch, companyProfile]);
	const branchId = selectedBranch?.id ?? "";
	// Misma clave que cuando la hoja vivía solo en el navegador: lo de antes se sube la primera vez.
	const localKey = `godcode:addon:plantilla-excel:hoja:${companyId ?? "sin-empresa"}:${branchId || "todas"}`;

	return (
		<SheetScreen
			key={localKey}
			companyId={companyId ?? null}
			branchId={branchId}
			localKey={localKey}
			locale={money.locale}
			branchName={selectedBranch?.name ?? null}
		/>
	);
}
