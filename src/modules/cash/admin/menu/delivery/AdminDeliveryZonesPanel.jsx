import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import AdminHelpTip from "../../../components/AdminHelpTip";
import DeliveryPlaceSuggestInput from "../../../components/DeliveryPlaceSuggestInput";
import { DELIVERY_TOOLTIPS } from "./deliveryZoneHelpers";
import { Button } from "@/components/ui/button";
import { normalizeBranchOrigin } from "@/lib/geo";
import { isVenezuelaCountry } from "@/lib/geo/tenant-locale";

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

	const latPlaceholder = isVenezuelaCountry(selectedBranch?.country)
		? "Ej: 11.0208"
		: "Ej: -33.4489";
	const lngPlaceholder = isVenezuelaCountry(selectedBranch?.country)
		? "Ej: -63.8937 (negativa)"
		: "Ej: -70.6693";

	return (
		<div className="admin-delivery-billing">
			<section className="admin-delivery-section" aria-labelledby="adm-del-strategy-label">
				<p
					id="adm-del-strategy-label"
					className="admin-menu-options-section-label admin-menu-options-section-label--with-tip"
				>
					Modalidad de cobro
					<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyIntro} />
				</p>
				<div className="admin-delivery-switch" role="group" aria-label="Modalidad de cobro del envío">
					<button
						type="button"
						disabled={lockOptions}
						aria-pressed={pricingStrategy === "distance"}
						className={`admin-delivery-switch__btn${pricingStrategy === "distance" ? " admin-delivery-switch__btn--active" : ""}`}
						onClick={() => setPricingStrategy("distance")}
						title={DELIVERY_TOOLTIPS.strategyDistance}
					>
						Distancia
					</button>
					<button
						type="button"
						disabled={lockOptions}
						aria-pressed={pricingStrategy === "named_areas"}
						className={`admin-delivery-switch__btn${pricingStrategy === "named_areas" ? " admin-delivery-switch__btn--active" : ""}`}
						onClick={() => setPricingStrategy("named_areas")}
						title={DELIVERY_TOOLTIPS.strategyNamedAreas}
					>
						Zonas
					</button>
					{allowTenantExternalDelivery ? (
						<button
							type="button"
							disabled={lockOptions}
							aria-pressed={pricingStrategy === "external"}
							className={`admin-delivery-switch__btn${pricingStrategy === "external" ? " admin-delivery-switch__btn--active" : ""}`}
							onClick={() => setPricingStrategy("external")}
							title={DELIVERY_TOOLTIPS.strategyExternal}
						>
							Externo
						</button>
					) : null}
				</div>
			</section>

			<section className="admin-delivery-section admin-delivery-tariffs" aria-label="Tarifas del modelo activo">
				{pricingStrategy === "distance" ? (
					<>
						<p className="admin-delivery-section__title">
							Tarifas por distancia
							<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyDistance} />
						</p>
						<div className="admin-delivery-tariff-block">
							<p className="admin-delivery-tariff-block__label">Tarifa</p>
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
										onChange={(ev) =>
											setDraft((d) => ({ ...d, pricePerKm: ev.target.value }))
										}
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
										onChange={(ev) =>
											setDraft((d) => ({ ...d, baseFee: ev.target.value }))
										}
									/>
								</div>
							</div>
						</div>
						<div className="admin-delivery-tariff-block">
							<p className="admin-delivery-tariff-block__label">Ubicación del local</p>
							<div className="admin-branch-delivery-grid admin-branch-delivery-grid--2">
								<div className="form-group">
									<label htmlFor="adm-del-olat">
										Latitud
										<AdminHelpTip text={DELIVERY_TOOLTIPS.originLat} />
									</label>
									<input
										id="adm-del-olat"
										type="text"
										inputMode="decimal"
										className="form-input"
										placeholder={latPlaceholder}
										disabled={lockOptions}
										value={draft.originLat}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, originLat: ev.target.value }))
										}
									/>
								</div>
								<div className="form-group">
									<label htmlFor="adm-del-olng">
										Longitud
										<AdminHelpTip text={DELIVERY_TOOLTIPS.originLng} />
									</label>
									<input
										id="adm-del-olng"
										type="text"
										inputMode="decimal"
										className="form-input"
										placeholder={lngPlaceholder}
										disabled={lockOptions}
										value={draft.originLng}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, originLng: ev.target.value }))
										}
									/>
								</div>
								{originCheck?.warning ? (
									<p
										className={`admin-delivery-origin-warn${originCheck.fixed ? " admin-delivery-origin-warn--fixed" : " admin-delivery-origin-warn--error"}`}
										role="status"
									>
										{originCheck.warning}
										{originCheck.fixed && originCheck.lng != null
											? ` Usa longitud ${originCheck.lng}.`
											: ""}
									</p>
								) : null}
							</div>
						</div>

						<div className="admin-branch-delivery-zones">
							<p className="admin-delivery-section__lead admin-delivery-inline-tip">
								<strong>Anillos por distancia (opcional):</strong> si el pedido cae dentro del radio
								en km desde el local, aplicas la tarifa fija de esa fila; si no, se usa precio por km
								+ cargo fijo.{" "}
								<AdminHelpTip text={DELIVERY_TOOLTIPS.distanceRingsHelp} />
							</p>
							{zoneRows.map((row, idx) => (
								<div key={row.id} className="admin-delivery-zone-row">
									<div className="form-group admin-delivery-zone-row__field">
										<label htmlFor={`adm-del-zr-${row.id}`}>
											Radio máx. (km)
											<AdminHelpTip text={DELIVERY_TOOLTIPS.zoneRingRadius} />
										</label>
										<input
											id={`adm-del-zr-${row.id}`}
											type="number"
											min={0}
											step="any"
											className="form-input"
											disabled={lockOptions}
											value={row.radiusKm}
											onChange={(ev) => {
												const v = ev.target.value;
												setZoneRows((rows) =>
													rows.map((r, i) => (i === idx ? { ...r, radiusKm: v } : r)),
												);
											}}
										/>
									</div>
									<div className="form-group admin-delivery-zone-row__field">
										<label htmlFor={`adm-del-zf-${row.id}`}>
											Tarifa fija ($)
											<AdminHelpTip text={DELIVERY_TOOLTIPS.zoneRingFee} />
										</label>
										<input
											id={`adm-del-zf-${row.id}`}
											type="number"
											min={0}
											step="any"
											className="form-input"
											disabled={lockOptions}
											value={row.feeFlat}
											onChange={(ev) => {
												const v = ev.target.value;
												setZoneRows((rows) =>
													rows.map((r, i) => (i === idx ? { ...r, feeFlat: v } : r)),
												);
											}}
										/>
									</div>
									<button
										type="button"
										className="admin-icon-btn admin-icon-btn--sm admin-delivery-icon-btn"
										disabled={lockOptions}
										aria-label="Quitar anillo de distancia"
										title={DELIVERY_TOOLTIPS.removeDistanceRing}
										onClick={() =>
											setZoneRows((rows) =>
												rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
											)
										}
									>
										<Trash2 size={15} strokeWidth={1.75} aria-hidden />
									</button>
								</div>
							))}
							<div className="admin-delivery-zone-row__actions">
								<Button
									variant="secondary"
									size="sm"
									type="button"
									disabled={lockOptions}
									onClick={() =>
										setZoneRows((rows) => [
											...rows,
											{ id: `z${Date.now()}`, radiusKm: "", feeFlat: "" },
										])
									}
								>
									<Plus size={15} strokeWidth={1.75} aria-hidden /> Añadir anillo
								</Button>
								<AdminHelpTip text={DELIVERY_TOOLTIPS.addDistanceRing} />
							</div>
						</div>
					</>
				) : pricingStrategy === "named_areas" ? (
					<>
						<p className="admin-delivery-section__title">
							Tarifas por zonas
							<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyNamedAreas} />
						</p>
						<div className="admin-delivery-named-resolution">
							<p className="admin-menu-options-section-label admin-menu-options-section-label--with-tip">
								Zonas en el checkout
								<AdminHelpTip text={DELIVERY_TOOLTIPS.zonesCheckoutSection} />
							</p>
							<div className="admin-delivery-switch" role="group" aria-label="Cómo elige el cliente la zona">
								<button
									type="button"
									disabled={lockOptions}
									aria-pressed={namedAreaResolution === "manual_select"}
									className={`admin-delivery-switch__btn${namedAreaResolution === "manual_select" ? " admin-delivery-switch__btn--active" : ""}`}
									onClick={() => setNamedAreaResolution("manual_select")}
									title={DELIVERY_TOOLTIPS.namedManual}
								>
									Lista para elegir
								</button>
								<button
									type="button"
									disabled={lockOptions}
									aria-pressed={namedAreaResolution === "address_matched"}
									className={`admin-delivery-switch__btn${namedAreaResolution === "address_matched" ? " admin-delivery-switch__btn--active" : ""}`}
									onClick={() => setNamedAreaResolution("address_matched")}
									title={DELIVERY_TOOLTIPS.namedAddress}
								>
									Según dirección
								</button>
							</div>
							<p className="admin-delivery-section__lead">
								{namedAreaResolution === "manual_select"
									? "El cliente elige comuna/zona en un menú. Puedes usar sugerencias al escribir el nombre (mapa gratuito)."
									: "El cliente escribe la dirección; el sistema intenta detectar la zona y el precio (datos de mapa abiertos)."}
							</p>
						</div>

						<div className="admin-branch-delivery-zones">
							<p className="admin-delivery-section__lead">
								<strong>Zonas y tarifas</strong> (hasta 40). Cada fila es el envío completo para esa
								zona. Sugerencias de nombres vía{" "}
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
							{namedPlaceRows.map((row, idx) => (
								<div key={row.id} className="admin-delivery-zone-row admin-delivery-zone-row--named">
									<div className="form-group admin-delivery-zone-row__field admin-delivery-zone-row__field--name">
										<label htmlFor={`adm-del-place-${row.id}`}>
											Nombre de la zona
											<AdminHelpTip text={DELIVERY_TOOLTIPS.namedZoneName} />
										</label>
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
												draft.originLat.trim() !== "" &&
												Number.isFinite(Number(draft.originLat))
													? Number(draft.originLat)
													: undefined
											}
											biasLng={
												draft.originLng.trim() !== "" &&
												Number.isFinite(Number(draft.originLng))
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
									<div className="form-group admin-delivery-zone-row__field">
										<label htmlFor={`adm-del-place-fee-${row.id}`}>
											Tarifa ($)
											<AdminHelpTip text={DELIVERY_TOOLTIPS.namedZoneFee} />
										</label>
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
									<div className="form-group admin-delivery-zone-row__field">
										<label htmlFor={`adm-del-place-al-${row.id}`}>
											Alias (opc.)
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
										className="admin-icon-btn admin-icon-btn--sm admin-delivery-icon-btn"
										disabled={lockOptions}
										aria-label="Quitar zona de la lista"
										title={DELIVERY_TOOLTIPS.removeNamedZoneRow}
										onClick={() =>
											setNamedPlaceRows((rows) =>
												rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
											)
										}
									>
										<Trash2 size={15} strokeWidth={1.75} aria-hidden />
									</button>
								</div>
							))}
							<div className="admin-delivery-zone-row__actions">
								<Button
									variant="secondary"
									size="sm"
									type="button"
									disabled={lockOptions}
									onClick={() =>
										setNamedPlaceRows((rows) => [
											...rows,
											{ id: `p${Date.now()}`, name: "", feeFlat: "", aliasesStr: "" },
										])
									}
								>
									<Plus size={15} strokeWidth={1.75} aria-hidden /> Añadir zona
								</Button>
								<AdminHelpTip text={DELIVERY_TOOLTIPS.addNamedZone} />
							</div>
						</div>
					</>
				) : (
					<>
						<p className="admin-delivery-section__title">
							Envío externo (Uber Direct)
							<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyExternal} />
						</p>
						<p className="admin-delivery-section__lead admin-delivery-inline-tip">
							<strong>Uber Direct:</strong> el <strong>Client ID y Secret</strong> de la app Uber están en
							la base de datos por <strong>empresa</strong> (los configura soporte/GodCode en admin
							SaaS). Aquí solo defines el <strong>Store ID</strong> de esta sucursal y si el cliente ve
							el monto cotizado o solo un mensaje.
						</p>
						<div className="admin-branch-delivery-grid admin-branch-delivery-grid--external">
							<div className="form-group full-span">
								<label htmlFor="adm-del-uber-store-id">
									Store ID (Uber Direct) — esta sucursal
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
									onChange={(ev) =>
										setDraft((d) => ({ ...d, uberDirectStoreId: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group full-span">
								<div className="admin-delivery-payment-grid admin-delivery-inline-tip">
									<button
										type="button"
										role="checkbox"
										aria-checked={showExternalDeliveryFee}
										disabled={lockOptions}
										className={`admin-delivery-pay-chip${showExternalDeliveryFee ? " is-on" : ""}`}
										onClick={() => setShowExternalDeliveryFee((v) => !v)}
										title={DELIVERY_TOOLTIPS.uberShowFee}
									>
										Mostrar monto de envío cotizado (Uber)
									</button>
									<AdminHelpTip text={DELIVERY_TOOLTIPS.uberShowFee} />
								</div>
							</div>
							<div className="form-group full-span">
								<label htmlFor="adm-del-uber-display-text">
									Texto si no se muestra monto (o mensaje complementario)
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
										setDraft((d) => ({
											...d,
											externalDeliveryDisplayText: ev.target.value,
										}))
									}
								/>
							</div>
						</div>
						<p className="admin-delivery-section__lead admin-delivery-inline-tip">
							Si <strong>Mostrar monto</strong> está apagado, la API usa{" "}
							<code className="admin-delivery-code">showDeliveryFeeAmount: false</code>. Con monto
							encendido, el cliente debe indicar ubicación para cotizar vía Uber.
						</p>
					</>
				)}
			</section>
		</div>
	);
}
