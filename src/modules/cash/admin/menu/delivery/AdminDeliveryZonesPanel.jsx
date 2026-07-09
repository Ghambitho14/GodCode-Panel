import React from "react";
import { Plus, Trash2 } from "lucide-react";
import AdminHelpTip from "../../../components/AdminHelpTip";
import DeliveryPlaceSuggestInput from "../../../components/DeliveryPlaceSuggestInput";
import { DELIVERY_TOOLTIPS } from "./deliveryZoneHelpers";
import { Button } from "@/components/ui/button";

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
	return (
		<details className="admin-delivery-fold">
			<summary className="admin-delivery-fold__summary">
				<div className="admin-delivery-fold__summary-text">
					<span className="admin-delivery-fold__eyebrow">Cobro</span>
					<span className="admin-delivery-fold__title">Tarifas de envío</span>
				</div>
			</summary>
			<div className="admin-delivery-fold__body">
				<div className="admin-delivery-strategy-block" style={{ marginTop: 0 }}>
					<p
						className="admin-menu-options-section-label admin-menu-options-section-label--with-tip"
						style={{ marginBottom: 8 }}
					>
						¿Cómo cobras el envío?
						<AdminHelpTip text={DELIVERY_TOOLTIPS.strategyIntro} />
					</p>
					<div className="admin-delivery-strategy-pills">
						<Button variant="default"
							type="button"
							disabled={lockOptions}
							className={`btn btn-secondary admin-tooltip-btn-hover ${pricingStrategy === "distance" ? "is-active" : ""}`}
							onClick={() => setPricingStrategy("distance")}
						>
							Por distancia (km)
							<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
								{DELIVERY_TOOLTIPS.strategyDistance}
							</span>
						</Button>
						<Button variant="default"
							type="button"
							disabled={lockOptions}
							className={`btn btn-secondary admin-tooltip-btn-hover ${pricingStrategy === "named_areas" ? "is-active" : ""}`}
							onClick={() => setPricingStrategy("named_areas")}
						>
							Por zonas con nombre
							<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
								{DELIVERY_TOOLTIPS.strategyNamedAreas}
							</span>
						</Button>
						{allowTenantExternalDelivery ? (
							<Button variant="default"
								type="button"
								disabled={lockOptions}
								className={`btn btn-secondary admin-tooltip-btn-hover ${pricingStrategy === "external" ? "is-active" : ""}`}
								onClick={() => setPricingStrategy("external")}
							>
								Consultar con tienda / externo
								<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
									{DELIVERY_TOOLTIPS.strategyExternal}
								</span>
							</Button>
						) : null}
					</div>
				</div>

				{pricingStrategy === "distance" ? (
					<>
						<div className="admin-branch-delivery-grid" style={{ marginTop: 18 }}>
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
							<div className="form-group">
								<label htmlFor="adm-del-olat">
									Ubicación del local · latitud
									<AdminHelpTip text={DELIVERY_TOOLTIPS.originLat} />
								</label>
								<input
									id="adm-del-olat"
									type="text"
									inputMode="decimal"
									className="form-input"
									placeholder="Ej: -33.4489"
									disabled={lockOptions}
									value={draft.originLat}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, originLat: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-olng">
									Ubicación del local · longitud
									<AdminHelpTip text={DELIVERY_TOOLTIPS.originLng} />
								</label>
								<input
									id="adm-del-olng"
									type="text"
									inputMode="decimal"
									className="form-input"
									placeholder="Ej: -70.6693"
									disabled={lockOptions}
									value={draft.originLng}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, originLng: ev.target.value }))
									}
								/>
							</div>
						</div>
						<div className="admin-branch-delivery-zones" style={{ marginTop: 8 }}>
							<p
								className="admin-menu-options-card-desc admin-delivery-inline-tip"
								style={{ marginBottom: 10 }}
							>
								<strong>Anillos por distancia (opcional):</strong> si el pedido cae dentro del radio
								en km desde el local, aplicas la tarifa fija de esa fila; si no, se usa precio por km
								+ cargo fijo.{" "}
								<AdminHelpTip text={DELIVERY_TOOLTIPS.distanceRingsHelp} />
							</p>
							{zoneRows.map((row, idx) => (
								<div
									key={row.id}
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 10,
										alignItems: "flex-end",
										marginBottom: 10,
									}}
								>
									<div className="form-group" style={{ flex: "1 1 120px" }}>
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
									<div className="form-group" style={{ flex: "1 1 120px" }}>
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
									<Button variant="default"
										type="button"
										className=""
										disabled={lockOptions}
										aria-label="Quitar anillo de distancia (radio km y tarifa fija)"
										onClick={() =>
											setZoneRows((rows) =>
												rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
											)
										}
									>
										<Trash2 size={16} strokeWidth={1.75} aria-hidden />
										<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
											{DELIVERY_TOOLTIPS.removeDistanceRing}
										</span>
									</Button>
								</div>
							))}
							<Button variant="secondary"
								type="button"
								className=""
								style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
								disabled={lockOptions}
								onClick={() =>
									setZoneRows((rows) => [
										...rows,
										{ id: `z${Date.now()}`, radiusKm: "", feeFlat: "" },
									])
								}
							>
								<Plus size={16} strokeWidth={1.75} aria-hidden /> Añadir anillo
								<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
									{DELIVERY_TOOLTIPS.addDistanceRing}
								</span>
							</Button>
						</div>
					</>
				) : pricingStrategy === "named_areas" ? (
					<>
						<div className="admin-delivery-strategy-block" style={{ marginTop: 14 }}>
							<p
								className="admin-menu-options-section-label admin-menu-options-section-label--with-tip"
								style={{ marginBottom: 8 }}
							>
								Zonas en el checkout
								<AdminHelpTip text={DELIVERY_TOOLTIPS.zonesCheckoutSection} />
							</p>
							<div className="admin-delivery-strategy-pills">
								<Button variant="default"
									type="button"
									disabled={lockOptions}
									className={`btn btn-secondary admin-tooltip-btn-hover ${namedAreaResolution === "manual_select" ? "is-active" : ""}`}
									onClick={() => setNamedAreaResolution("manual_select")}
								>
									Lista para elegir
									<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
										{DELIVERY_TOOLTIPS.namedManual}
									</span>
								</Button>
								<Button variant="default"
									type="button"
									disabled={lockOptions}
									className={`btn btn-secondary admin-tooltip-btn-hover ${namedAreaResolution === "address_matched" ? "is-active" : ""}`}
									onClick={() => setNamedAreaResolution("address_matched")}
								>
									Según la dirección (automático)
									<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
										{DELIVERY_TOOLTIPS.namedAddress}
									</span>
								</Button>
							</div>
							<p className="admin-menu-options-card-desc" style={{ marginTop: 10, marginBottom: 0 }}>
								{namedAreaResolution === "manual_select"
									? "El cliente elige comuna/zona en un menú. Puedes usar sugerencias al escribir el nombre (mapa gratuito)."
									: "El cliente escribe la dirección; el sistema intenta detectar la zona y el precio (datos de mapa abiertos)."}
							</p>
						</div>
						<div className="admin-branch-delivery-zones" style={{ marginTop: 14 }}>
							<p className="admin-menu-options-card-desc" style={{ marginBottom: 10 }}>
								<strong>Zonas y tarifas</strong> (hasta 40). Cada fila es el envío completo para esa
								zona. Sugerencias de nombres vía{" "}
								<a
									href="https://www.openstreetmap.org/copyright"
									target="_blank"
									rel="noreferrer"
									style={{ color: "inherit", textDecoration: "underline" }}
								>
									OpenStreetMap
								</a>
								.
							</p>
							{namedPlaceRows.map((row, idx) => (
								<div
									key={row.id}
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 10,
										alignItems: "flex-end",
										marginBottom: 10,
									}}
								>
									<div className="form-group" style={{ flex: "2 1 160px" }}>
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
									<div className="form-group" style={{ flex: "1 1 120px" }}>
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
									<div className="form-group" style={{ flex: "1 1 140px" }}>
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
									<Button variant="default"
										type="button"
										className=""
										disabled={lockOptions}
										aria-label="Quitar zona de la lista (nombre, tarifa y alias)"
										onClick={() =>
											setNamedPlaceRows((rows) =>
												rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
											)
										}
									>
										<Trash2 size={16} strokeWidth={1.75} aria-hidden />
										<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
											{DELIVERY_TOOLTIPS.removeNamedZoneRow}
										</span>
									</Button>
								</div>
							))}
							<Button variant="secondary"
								type="button"
								className=""
								style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
								disabled={lockOptions}
								onClick={() =>
									setNamedPlaceRows((rows) => [
										...rows,
										{ id: `p${Date.now()}`, name: "", feeFlat: "", aliasesStr: "" },
									])
								}
							>
								<Plus size={16} strokeWidth={1.75} aria-hidden /> Añadir zona
								<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
									{DELIVERY_TOOLTIPS.addNamedZone}
								</span>
							</Button>
						</div>
					</>
				) : (
					<div className="admin-delivery-strategy-block" style={{ marginTop: 14 }}>
						<p className="admin-menu-options-card-desc admin-delivery-inline-tip" style={{ marginBottom: 12 }}>
							<strong>Uber Direct:</strong> el <strong>Client ID y Secret</strong> de la app Uber están en
							la base de datos por <strong>empresa</strong> (los configura soporte/GodCode en admin
							SaaS). Aquí solo defines el <strong>Store ID</strong> de esta sucursal y si el cliente ve
							el monto cotizado o solo un mensaje.
						</p>
						<div className="form-group" style={{ maxWidth: "36rem" }}>
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
						<div
							className="admin-delivery-pay-chip-row"
							style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
						>
							<Button variant="default"
								type="button"
								role="checkbox"
								aria-checked={showExternalDeliveryFee}
								disabled={lockOptions}
								className={`admin-delivery-pay-chip admin-tooltip-btn-hover ${showExternalDeliveryFee ? "is-on" : ""}`}
								onClick={() => setShowExternalDeliveryFee((v) => !v)}
							>
								Mostrar monto de envío cotizado (Uber)
								<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
									{DELIVERY_TOOLTIPS.uberShowFee}
								</span>
							</Button>
						</div>
						<div className="form-group" style={{ maxWidth: "36rem", marginTop: 14 }}>
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
						<p
							className="admin-menu-options-card-desc admin-delivery-inline-tip"
							style={{ marginTop: 14, marginBottom: 0 }}
						>
							Si <strong>Mostrar monto</strong> está apagado, la API usa{" "}
							<code style={{ fontSize: "0.85em" }}>showDeliveryFeeAmount: false</code>. Con monto
							encendido, el cliente debe indicar ubicación para cotizar vía Uber.
						</p>
					</div>
				)}
			</div>
		</details>
	);
}
