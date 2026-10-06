import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleSlash, Eye, Loader2, Mail, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import CouponDateTimeField from "@/modules/cash/components/CouponDateTimeField";
import CouponFormSelect from "@/modules/cash/components/CouponFormSelect";
import {
	fetchCouponSenderStatus,
	previewCouponEmail,
	sendCouponEmails,
} from "@/modules/cash/services/couponEmailService";

const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_VALID_DAYS = 14;

function pad(n) {
	return String(n).padStart(2, "0");
}

/** Vence en dos semanas, al final del día (formato del selector: `YYYY-MM-DDTHH:mm`). */
function defaultValidUntil(now = new Date()) {
	const d = new Date(now);
	d.setDate(d.getDate() + DEFAULT_VALID_DAYS);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

function newCampaignId() {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	// Abierto por http con la IP de la red local no es contexto seguro: no hay randomUUID.
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Manda un cupón personal (1 uso, solo esa cuenta) al correo de cada cliente elegido.
 * El cupón se crea en el servidor al enviar; aquí solo se arman las condiciones.
 *
 * @param {{ open: boolean, onClose: () => void, recipients: Array<{ accountId: string, name: string, canReceiveEmail?: boolean|null, emailOptOut?: boolean|null }>, showNotify?: Function, onSent?: () => void }} props
 */
export default function SendCouponEmailModal({ open, onClose, recipients, showNotify, onSent }) {
	const [draft, setDraft] = useState(() => ({
		discountType: "percent",
		discountValue: "10",
		minOrderSubtotal: "0",
		validUntil: defaultValidUntil(),
		message: "",
	}));
	const [sender, setSender] = useState(null);
	const [senderError, setSenderError] = useState("");
	const [preview, setPreview] = useState(null);
	const [previewing, setPreviewing] = useState(false);
	const [sending, setSending] = useState(false);
	const [progress, setProgress] = useState({ done: 0, total: 0 });
	const [results, setResults] = useState(null);
	// Un id por apertura: si una tanda se reintenta, nadie recibe dos cupones.
	const [campaignId] = useState(newCampaignId);

	useEffect(() => {
		if (!open) return undefined;
		let alive = true;
		void (async () => {
			try {
				const status = await fetchCouponSenderStatus();
				if (alive) setSender(status);
			} catch (err) {
				if (alive) setSenderError(err instanceof Error ? err.message : "No se pudo leer el remitente");
			}
		})();
		return () => {
			alive = false;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => {
			if (e.key === "Escape" && !sending) onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, sending, onClose]);

	/** Los que seguro no reciben (sin login o dados de baja) se avisan antes de enviar. */
	const { reachable, unreachable } = useMemo(() => {
		const list = Array.isArray(recipients) ? recipients : [];
		const out = list.filter((r) => r.canReceiveEmail === false || r.emailOptOut === true);
		return { reachable: list.filter((r) => !out.includes(r)), unreachable: out };
	}, [recipients]);

	const namesById = useMemo(
		() => new Map((recipients ?? []).map((r) => [r.accountId, r.name || "Cliente sin nombre"])),
		[recipients],
	);

	const buildPayload = () => {
		const discountValue = Number(draft.discountValue);
		if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error("El descuento tiene que ser mayor que 0.");
		if (draft.discountType === "percent" && discountValue > 100) throw new Error("El porcentaje no puede superar 100.");
		const minOrderSubtotal = Number(draft.minOrderSubtotal || 0);
		if (!Number.isFinite(minOrderSubtotal) || minOrderSubtotal < 0) throw new Error("El mínimo del pedido no es válido.");
		const until = new Date(draft.validUntil);
		if (Number.isNaN(until.getTime())) throw new Error("Elige hasta cuándo vale el cupón.");
		if (until.getTime() <= Date.now()) throw new Error("La fecha de vencimiento ya pasó.");
		return {
			discountType: draft.discountType,
			discountValue,
			minOrderSubtotal,
			validUntil: until.toISOString(),
			message: draft.message.trim(),
		};
	};

	const showPreview = async () => {
		setPreviewing(true);
		try {
			setPreview(await previewCouponEmail(buildPayload()));
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : "No se pudo armar la vista previa", "error");
		} finally {
			setPreviewing(false);
		}
	};

	const send = async () => {
		let payload;
		try {
			payload = buildPayload();
		} catch (err) {
			showNotify?.(err.message, "error");
			return;
		}
		const ids = reachable.map((r) => r.accountId);
		if (ids.length === 0) {
			showNotify?.("Ninguno de los clientes elegidos puede recibir correos.", "error");
			return;
		}
		setSending(true);
		setProgress({ done: 0, total: ids.length });
		try {
			const out = await sendCouponEmails({
				campaignId,
				accountIds: ids,
				draft: payload,
				onProgress: (done, total) => setProgress({ done, total }),
			});
			const skippedBefore = unreachable.map((r) => ({
				accountId: r.accountId,
				status: "skipped",
				reason: r.emailOptOut ? "Se dio de baja de los correos" : "Sin correo",
			}));
			const all = [...out, ...skippedBefore];
			setResults(all);
			const sentCount = all.filter((r) => r.status === "sent").length;
			if (sentCount > 0) {
				showNotify?.(sentCount === 1 ? "Cupón enviado." : `${sentCount} cupones enviados.`, "success");
				onSent?.();
			} else {
				showNotify?.("No se envió ningún cupón.", "error");
			}
		} finally {
			setSending(false);
		}
	};

	if (!open) return null;

	const total = recipients?.length ?? 0;
	const canSend = Boolean(sender?.ready) && reachable.length > 0 && !sending;
	const target = typeof document !== "undefined" ? document.querySelector(".admin-layout") || document.body : null;
	if (!target) return null;

	return createPortal(
		<div className="coupon-form-modal-overlay" role="presentation" onClick={() => !sending && onClose()}>
			<div
				className="coupon-form-modal coupon-email-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="coupon-email-modal-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="coupon-form-modal__header">
					<div className="coupon-form-modal__header-text">
						<h3 id="coupon-email-modal-title">Enviar cupón por correo</h3>
						<p className="coupon-form-modal__header-hint">
							{total === 1
								? `A ${namesById.get(recipients[0].accountId)}`
								: `A ${total} clientes`}
							{" · "}cada uno recibe un código personal de 1 uso.
						</p>
					</div>
					<button
						type="button"
						className="coupon-form-modal__close"
						aria-label="Cerrar"
						disabled={sending}
						onClick={onClose}
					>
						<X size={18} />
					</button>
				</div>

				{results ? (
					<div className="coupon-form-modal__body">
						<ul className="coupon-email-results" aria-label="Resultado del envío">
							{results.map((r) => (
								<li key={r.accountId} className={`coupon-email-results__item is-${r.status}`}>
									{r.status === "sent" ? (
										<CircleCheck size={16} aria-hidden />
									) : r.status === "skipped" ? (
										<CircleSlash size={16} aria-hidden />
									) : (
										<TriangleAlert size={16} aria-hidden />
									)}
									<span className="coupon-email-results__name">{namesById.get(r.accountId) ?? "Cliente"}</span>
									<span className="coupon-email-results__detail">
										{r.status === "sent" ? `Enviado · ${r.code}` : r.reason || "No se envió"}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : (
					<form
						id="coupon-email-form"
						className="coupon-form-modal__body"
						onSubmit={(e) => {
							e.preventDefault();
							void send();
						}}
					>
						<section className="coupon-form-modal__section" aria-labelledby="coupon-email-sec-discount">
							<h4 id="coupon-email-sec-discount" className="coupon-form-modal__section-title">
								Descuento
							</h4>
							<div className="coupon-form-modal__grid coupon-form-modal__grid--2">
								<div className="coupon-form-modal__field">
									<label htmlFor="coupon-email-type">Tipo</label>
									<CouponFormSelect
										id="coupon-email-type"
										disabled={sending}
										value={draft.discountType}
										placeholder="Tipo"
										onValueChange={(v) => setDraft((d) => ({ ...d, discountType: v }))}
										options={[
											{ value: "percent", label: "Porcentaje" },
											{ value: "fixed_amount", label: "Monto fijo" },
										]}
									/>
								</div>
								<div className="coupon-form-modal__field">
									<label htmlFor="coupon-email-value">
										{draft.discountType === "percent" ? "Porcentaje (%)" : "Monto"}
									</label>
									<input
										id="coupon-email-value"
										type="number"
										min="1"
										step="1"
										disabled={sending}
										value={draft.discountValue}
										onChange={(e) => setDraft((d) => ({ ...d, discountValue: e.target.value }))}
									/>
								</div>
							</div>
						</section>

						<section className="coupon-form-modal__section" aria-labelledby="coupon-email-sec-limits">
							<h4 id="coupon-email-sec-limits" className="coupon-form-modal__section-title">
								Condiciones
							</h4>
							<div className="coupon-form-modal__grid coupon-form-modal__grid--2">
								<div className="coupon-form-modal__field">
									<label htmlFor="coupon-email-min">Mínimo del pedido</label>
									<input
										id="coupon-email-min"
										type="number"
										min="0"
										disabled={sending}
										value={draft.minOrderSubtotal}
										onChange={(e) => setDraft((d) => ({ ...d, minOrderSubtotal: e.target.value }))}
									/>
								</div>
								<CouponDateTimeField
									id="coupon-email-until"
									label="Vence"
									disabled={sending}
									defaultTime="23:59"
									placeholder="Elegir fecha"
									value={draft.validUntil}
									onChange={(v) => setDraft((d) => ({ ...d, validUntil: v }))}
								/>
							</div>
						</section>

						<section className="coupon-form-modal__section" aria-labelledby="coupon-email-sec-message">
							<h4 id="coupon-email-sec-message" className="coupon-form-modal__section-title">
								Mensaje (opcional)
							</h4>
							<div className="coupon-form-modal__field">
								<textarea
									id="coupon-email-message"
									className="coupon-email-modal__message"
									aria-label="Mensaje para el cliente"
									rows={3}
									maxLength={MAX_MESSAGE_LENGTH}
									disabled={sending}
									placeholder="¡Gracias por preferirnos! Aquí tienes un descuento para tu próximo pedido."
									value={draft.message}
									onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
								/>
							</div>
						</section>

						<div className="coupon-email-modal__sender">
							<Mail size={15} aria-hidden />
							{sender ? (
								sender.ready ? (
									<span>
										Sale desde <strong>{sender.from}</strong>
									</span>
								) : (
									<span>El envío de correos todavía no está configurado en el servidor.</span>
								)
							) : senderError ? (
								<span>{senderError}</span>
							) : (
								<span>Revisando el remitente…</span>
							)}
						</div>

						{unreachable.length > 0 ? (
							<p className="coupon-email-modal__warning">
								{unreachable.length === 1
									? `${unreachable[0].name || "Un cliente"} no recibe correos y se omite.`
									: `${unreachable.length} clientes no reciben correos y se omiten.`}
							</p>
						) : null}

						{preview ? (
							<div className="coupon-email-modal__preview">
								<p className="coupon-email-modal__preview-subject">
									<strong>Asunto:</strong> {preview.subject}
								</p>
								<iframe
									title="Vista previa del correo"
									sandbox=""
									srcDoc={preview.html}
									className="coupon-email-modal__preview-frame"
								/>
							</div>
						) : null}
					</form>
				)}

				<div className="coupon-form-modal__footer">
					{results ? (
						<Button variant="default" type="button" size="sm" onClick={onClose}>
							Cerrar
						</Button>
					) : (
						<>
							<Button
								variant="secondary"
								type="button"
								size="sm"
								disabled={sending || previewing}
								onClick={() => void showPreview()}
							>
								{previewing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Eye size={14} aria-hidden />}
								Vista previa
							</Button>
							<Button variant="default" type="submit" form="coupon-email-form" size="sm" disabled={!canSend}>
								{sending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
								{sending
									? `Enviando ${progress.done} de ${progress.total}…`
									: reachable.length === 1
										? "Enviar cupón"
										: `Enviar a ${reachable.length}`}
							</Button>
						</>
					)}
				</div>
			</div>
		</div>,
		target,
	);
}
