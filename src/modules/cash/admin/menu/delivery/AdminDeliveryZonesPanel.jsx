import React, { useMemo, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import AdminHelpTip from "../../../components/AdminHelpTip";
import DeliveryPlaceSuggestInput from "../../../components/DeliveryPlaceSuggestInput";
import { DELIVERY_TOOLTIPS } from "./deliveryZoneHelpers";
import { Button } from "@/components/ui/button";
import { normalizeBranchOrigin } from "@/lib/geo";
import { isVenezuelaCountry } from "@/lib/geo/tenant-locale";

const STRATEGIES = [
	{ id: "distance", label: "Por distancia", tip: DELIVERY_TOOLTIPS.strategyDistance },
	{ id: "named_areas", label: "Por zonas", tip: DELIVERY_TOOLTIPS.strategyNamedAreas },
	{ id: "external", label: "Uber Direct", tip: DELIVERY_TOOLTIPS.strategyExternal },
];

export default function AdminDeliveryZonesPanel({
	lockOptions,
	pricingStrategy,
	setPricingStrategy,
	allowTenantExternalDelivery,
	draft,
	setDraft,
	zoneRows,
	setZoneRows,
	namedPlaceRows,
	setNamedPlaceRows,
	namedAreaResolution,
	setNamedAreaResolution,
	showExternalDeliveryFee,
	setShowExternalDeliveryFee,
	selectedBranch,
}) {
	const [editOrigin, setEditOrigin] = useState(false);

	const originCheck = useMemo(() => {
		if (!String(draft.originLat ?? "").trim() && !String(draft.originLng ?? "").trim()) {
			return null;
		}
		return normalizeBranchOrigin(
			draft.originLat,
			draft.originLng,
			selectedBranch?.country,
		);
	}, [draft.originLat, draft.originLng, selectedBranch?.country]);

	const originSet =
		String(draft.originLat ?? "").trim() !== "" && String(draft.originLng ?? "").trim() !== "";

	const latPlaceholder = isVenezuelaCountry(selectedBranch?.country)
		? "Ej: 11.0208"
		: "Ej: -33.4489";
	const lngPlaceholder = isVenezuelaCountry(selectedBranch?.country)
		? "Ej: -63.8937 (negativa)"
		: "Ej: -70.6693";

	const strategies = STRATEGIES.filter(
		(s) => s.id !== "external" || allowTenantExternalDelivery,
	);

	/*
	 * Latitud y longitud se escriben una vez y no se vuelven a tocar, pero estaban
	 * en medio de los precios. Una vez puestas se resumen en una línea.
	 */
	const originBlock = (
		<div className="admin-delivery-origin">
			{originSet && !editOrigin ? (
				<p className="admin-delivery-origin__summary">
					<MapPin size={15} strokeWidth={2} aria-hidden />
					<span>
						El local está en <strong>{draft.originLat}, {draft.originLng}</strong>
					</span>
					<button
						type="button"
						className="admin-delivery-origin__edit"
						disabled={lockOptions}
						onClick={() => setEditOrigin(true)}
					>
						Cambiar
					</button>
				</p>
			) : (
				<>
					<p className="admin-delivery-block__label">
						Ubicación del local
						<AdminHelpTip text={DELIVERY_TOOLTIPS.originLat} />
					</p>
					<div className="admin-branch-delivery-grid admin-branch-delivery-grid--2">
						<div className="form-group">
							<label htmlFor="adm-del-olat">Latitud</label>
							<input
								id="adm-del-olat"
								type="text"
								inputMode="decimal"
								className="form-input"
								placeholder={latPlaceholder}
								disabled={lockOptions}
								value={draft.originLat}
								onChange={(ev) => setDraft((d) => ({ ...d, originLat: ev.target.value }))}
							/>
						</div>
						<div className="form-group">
							<label htmlFor="adm-del-olng">Longitud</label>
							<input
								id="adm-del-olng"
								type="text"
								inputMode="decimal"
								className="form-input"
								placeholder={lngPlaceholder}
								disabled={lockOptions}
								value={draft.originLng}
								onChange={(ev) => setDraft((d) => ({ ...d, originLng: ev.target.value }))}
							/>
						</div>
					</div>
				</>
			)}
			{originCheck?.warning ? (
				<p
					className={`admin-delivery-origin-warn${originCheck.fixed ? " admin-delivery-origin-warn--fixed" : " admin-delivery-origin-warn--error"}`}
					role="status"
				>
					{originCheck.warning}
					{originCheck.fixed && originCheck.lng != null ? ` Usa longitud ${originCheck.lng}.` : ""}
				</p>
			) : null}
		</div>
	);

	return (
		<section className="admin-delivery-step" aria-labelledby="adm-del-strategy-label">
			<header className="admin-delivery-step__head">
				<span className="admin-delivery-step__num" aria-hidden>
					1
				</span>
				<h3 id="adm-del-strategy-label" className="admin-delivery-step__title">
					Cómo se cobra el envío
					<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyIntro} />
				</h3>
			</header>

			{/* El selector y los campos del modelo elegido van en la misma tarjeta:
			    separados parecían dos ajustes sin relación. */}
			<div className="admin-delivery-switch" role="group" aria-label="Modalidad de cobro del envío">
				{strategies.map((s) => (
					<button
						key={s.id}
						type="button"
						disabled={lockOptions}
						aria-pressed={pricingStrategy === s.id}
						className={`admin-delivery-switch__btn${pricingStrategy === s.id ? " admin-delivery-switch__btn--active" : ""}`}
						onClick={() => setPricingStrategy(s.id)}
						title={s.tip}
					>
						{s.label}
					</button>
				))}
			</div>

			<div className="admin-delivery-step__body">
				{pricingStrategy === "distance" ? (
					<>
						<div className="admin-branch-delivery-grid admin-branch-delivery-grid--2">
							<div className="form-group">
								<label htmlFor="adm-del-price-km">
									Precio por km
									<AdminHelpTip text={DELIVERY_TOOLTIPS.pricePerKm} />
								</label>
								<input
									id="adm-del-price-km"
									type="number"
									min={0}
									step="any"
									className="form-input"
									disabled={lockOptions}
									value={draft.pricePerKm}
									onChange={(ev) => setDraft((d) => ({ ...d, pricePerKm: ev.target.value }))}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-base">
									Cargo fijo base
									<AdminHelpTip text={DELIVERY_TOOLTIPS.baseFee} />
								</label>
								<input
									id="adm-del-base"
									type="number"
									min={0}
									step="any"
									className="form-input"
									disabled={lockOptions}
									value={draft.baseFee}
									onChange={(ev) => setDraft((d) => ({ ...d, baseFee: ev.target.value }))}
								/>
							</div>
						</div>

						{/*
						 * «Anillos» con dos campos rotulados no decía qué hacía. Cada fila se
						 * lee ahora como la regla que es: hasta N km, el envío cuesta X.
						 */}
						<div className="admin-delivery-rules">
							<p className="admin-delivery-block__label">
								Tramos con precio fijo (opcional)
								<AdminHelpTip text={DELIVERY_TOOLTIPS.distanceRingsHelp} />
							</p>
							<ul className="admin-delivery-rules__list">
								{zoneRows.map((row, idx) => (
									<li key={row.id} className="admin-delivery-rule">
										<span className="admin-delivery-rule__text">Hasta</span>
										<input
											type="number"
											min={0}
											step="any"
											className="admin-delivery-rule__input"
											aria-label={`Radio máximo del tramo ${idx + 1} en kilómetros`}
											disabled={lockOptions}
											value={row.radiusKm}
											onChange={(ev) => {
												const v = ev.target.value;
												setZoneRows((rows) =>
													rows.map((r, i) => (i === idx ? { ...r, radiusKm: v } : r)),
												);
											}}
										/>
										<span className="admin-delivery-rule__text">km, el envío cuesta</span>
										<input
											type="number"
											min={0}
											step="any"
											className="admin-delivery-rule__input"
											aria-label={`Tarifa fija del tramo ${idx + 1}`}
											disabled={lockOptions}
											value={row.feeFlat}
											onChange={(ev) => {
												const v = ev.target.value;
												setZoneRows((rows) =>
													rows.map((r, i) => (i === idx ? { ...r, feeFlat: v } : r)),
												);
											}}
										/>
										<button
											type="button"
											className="admin-delivery-rule__remove"
											disabled={lockOptions}
											aria-label={`Quitar el tramo ${idx + 1}`}
											title={DELIVERY_TOOLTIPS.removeDistanceRing}
											onClick={() =>
												setZoneRows((rows) =>
													rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
												)
											}
										>
											<Trash2 size={15} strokeWidth={1.75} aria-hidden />
										</button>
									</li>
								))}
							</ul>
							<Button
								variant="secondary"
								size="sm"
								type="button"
								disabled={lockOptions}
								title={DELIVERY_TOOLTIPS.addDistanceRing}
								onClick={() =>
									setZoneRows((rows) => [
										...rows,
										{ id: `z${Date.now()}`, radiusKm: "", feeFlat: "" },
									])
								}
							>
								<Plus size={15} strokeWidth={1.75} aria-hidden /> Añadir tramo
							</Button>
						</div>

						{originBlock}
					</>
				) : pricingStrategy === "named_areas" ? (
					<>
						<div className="admin-delivery-block">
							<p className="admin-delivery-block__label">
								Cómo elige la zona el cliente
								<AdminHelpTip text={DELIVERY_TOOLTIPS.zonesCheckoutSection} />
							</p>
							<div className="admin-delivery-switch admin-delivery-switch--sub" role="group" aria-label="Cómo elige el cliente la zona">
								<button
									type="button"
									disabled={lockOptions}
									aria-pressed={namedAreaResolution === "manual_select"}
									className={`admin-delivery-switch__btn${namedAreaResolution === "manual_select" ? " admin-delivery-switch__btn--active" : ""}`}
									onClick={() => setNamedAreaResolution("manual_select")}
									title={DELIVERY_TOOLTIPS.namedManual}
								>
									La elige de una lista
								</button>
								<button
									type="button"
									disabled={lockOptions}
									aria-pressed={namedAreaResolution === "address_matched"}
									className={`admin-delivery-switch__btn${namedAreaResolution === "address_matched" ? " admin-delivery-switch__btn--active" : ""}`}
									onClick={() => setNamedAreaResolution("address_matched")}
									title={DELIVERY_TOOLTIPS.namedAddress}
								>
									Se detecta por su dirección
								</button>
							</div>
						</div>

						<div className="admin-delivery-rules">
							<p className="admin-delivery-block__label">
								Zonas y tarifas
								<AdminHelpTip text={DELIVERY_TOOLTIPS.namedZoneFee} />
							</p>
							<ul className="admin-delivery-rules__list">
								{namedPlaceRows.map((row, idx) => (
									<li key={row.id} className="admin-delivery-zone">
										<div className="form-group admin-delivery-zone__name">
											<label htmlFor={`adm-del-place-${row.id}`}>Zona</label>
											<DeliveryPlaceSuggestInput
												id={`adm-del-place-${row.id}`}
												placeholder="Comuna, barrio o sector"
												value={row.name}
												region={
													String(selectedBranch?.country ?? "CL").toUpperCase() === "VE"
														? "ve"
														: "cl"
												}
												biasLat={
													draft.originLat.trim() !== "" && Number.isFinite(Number(draft.originLat))
														? Number(draft.originLat)
														: undefined
												}
												biasLng={
													draft.originLng.trim() !== "" && Number.isFinite(Number(draft.originLng))
														? Number(draft.originLng)
														: undefined
												}
												disabled={lockOptions}
												onChange={(v) => {
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, name: v } : r)),
													);
												}}
											/>
										</div>
										<div className="form-group admin-delivery-zone__fee">
											<label htmlFor={`adm-del-place-fee-${row.id}`}>Envío</label>
											<input
												id={`adm-del-place-fee-${row.id}`}
												type="number"
												min={0}
												step="any"
												className="form-input"
												disabled={lockOptions}
												value={row.feeFlat}
												onChange={(ev) => {
													const v = ev.target.value;
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, feeFlat: v } : r)),
													);
												}}
											/>
										</div>
										<div className="form-group admin-delivery-zone__alias">
											<label htmlFor={`adm-del-place-al-${row.id}`}>
												Otros nombres
												<AdminHelpTip text={DELIVERY_TOOLTIPS.namedZoneAliases} />
											</label>
											<input
												id={`adm-del-place-al-${row.id}`}
												type="text"
												className="form-input"
												placeholder="Separados por coma"
												disabled={lockOptions}
												value={row.aliasesStr ?? ""}
												onChange={(ev) => {
													const v = ev.target.value;
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, aliasesStr: v } : r)),
													);
												}}
											/>
										</div>
										<button
											type="button"
											className="admin-delivery-rule__remove admin-delivery-zone__remove"
											disabled={lockOptions}
											aria-label={`Quitar la zona ${row.name || idx + 1}`}
											title={DELIVERY_TOOLTIPS.removeNamedZoneRow}
											onClick={() =>
												setNamedPlaceRows((rows) =>
													rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
												)
											}
										>
											<Trash2 size={15} strokeWidth={1.75} aria-hidden />
										</button>
									</li>
								))}
							</ul>
							<Button
								variant="secondary"
								size="sm"
								type="button"
								disabled={lockOptions || namedPlaceRows.length >= 40}
								title={DELIVERY_TOOLTIPS.addNamedZone}
								onClick={() =>
									setNamedPlaceRows((rows) => [
										...rows,
										{ id: `p${Date.now()}`, name: "", feeFlat: "", aliasesStr: "" },
									])
								}
							>
								<Plus size={15} strokeWidth={1.75} aria-hidden /> Añadir zona
							</Button>
							<p className="admin-delivery-rules__foot">
								Hasta 40 zonas. Los nombres se sugieren con{" "}
								<a
									href="https://www.openstreetmap.org/copyright"
									target="_blank"
									rel="noreferrer"
									className="admin-delivery-ext-link"
								>
									OpenStreetMap
								</a>
								.
							</p>
						</div>

						{originBlock}
					</>
				) : (
					<div className="admin-branch-delivery-grid admin-branch-delivery-grid--external">
						<div className="form-group full-span">
							<label htmlFor="adm-del-uber-store-id">
								Store ID de esta sucursal en Uber
								<AdminHelpTip text={DELIVERY_TOOLTIPS.uberStoreId} />
							</label>
							<input
								id="adm-del-uber-store-id"
								type="text"
								className="form-input tabular-nums"
								placeholder="UUID o id del local en Uber"
								disabled={lockOptions}
								autoComplete="off"
								value={draft.uberDirectStoreId}
								onChange={(ev) => setDraft((d) => ({ ...d, uberDirectStoreId: ev.target.value }))}
							/>
						</div>
						<div className="form-group full-span">
							<label className="admin-delivery-inline-check">
								<button
									type="button"
									role="checkbox"
									aria-checked={showExternalDeliveryFee}
									disabled={lockOptions}
									className={`admin-delivery-pay-chip${showExternalDeliveryFee ? " is-on" : ""}`}
									onClick={() => setShowExternalDeliveryFee((v) => !v)}
								>
									Mostrar al cliente el monto que cotiza Uber
								</button>
								<AdminHelpTip text={DELIVERY_TOOLTIPS.uberShowFee} />
							</label>
						</div>
						<div className="form-group full-span">
							<label htmlFor="adm-del-uber-display-text">
								Qué ve el cliente si no se muestra el monto
								<AdminHelpTip text={DELIVERY_TOOLTIPS.uberDisplayText} />
							</label>
							<input
								id="adm-del-uber-display-text"
								type="text"
								className="form-input"
								placeholder="Ej. Consultar con la tienda"
								disabled={lockOptions}
								value={draft.externalDeliveryDisplayText}
								onChange={(ev) =>
									setDraft((d) => ({ ...d, externalDeliveryDisplayText: ev.target.value }))
								}
							/>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
