import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	deleteCouponSender,
	fetchCouponSenderStatus,
	saveCouponSender,
} from "@/modules/cash/services/couponEmailService";

const emptyForm = (own) => ({
	apiKey: "",
	fromEmail: own?.fromEmail ?? "",
	fromName: own?.fromName ?? "",
	replyTo: own?.replyTo ?? "",
});

/**
 * Desde qué correo salen los cupones (pestaña Cupones).
 *
 * - Sin dominio propio: salen por el Resend de GodCode con el nombre del negocio;
 *   no hay nada que configurar.
 * - Con dominio propio: el dueño o el CEO conecta su propio Resend (API key y
 *   remitente de su dominio). Al guardar se manda un correo de prueba y solo se
 *   guarda si llega. Si no sabe hacerlo, lo configuramos desde el super admin.
 */
export default function CouponEmailSenderCard({ showNotify }) {
	const [status, setStatus] = useState(null);
	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState(() => emptyForm(null));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	/** Sin la función (aún no desplegada) la tarjeta no se muestra: los cupones siguen igual. */
	const readStatus = useCallback(async () => {
		try {
			return await fetchCouponSenderStatus();
		} catch (err) {
			console.warn("[cupones] remitente:", err instanceof Error ? err.message : err);
			return null;
		}
	}, []);

	const load = useCallback(async () => {
		const next = await readStatus();
		if (next) setStatus(next);
	}, [readStatus]);

	useEffect(() => {
		let alive = true;
		void (async () => {
			const next = await readStatus();
			if (alive && next) setStatus(next);
		})();
		return () => {
			alive = false;
		};
	}, [readStatus]);

	const startEdit = () => {
		setForm(emptyForm(status?.own));
		setError("");
		setEditing(true);
	};

	const save = async () => {
		setSaving(true);
		setError("");
		try {
			const res = await saveCouponSender({
				apiKey: form.apiKey.trim(),
				fromEmail: form.fromEmail.trim(),
				fromName: form.fromName.trim(),
				replyTo: form.replyTo.trim(),
			});
			showNotify?.(`Listo. Te mandamos un correo de prueba a ${res.testSentTo}.`, "success");
			setEditing(false);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : "No se pudo guardar");
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!window.confirm("¿Quitar tu Resend? Los cupones volverán a salir desde GodCode con el nombre de tu negocio.")) return;
		setSaving(true);
		try {
			await deleteCouponSender();
			showNotify?.("Remitente quitado.", "success");
			setEditing(false);
			await load();
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : "No se pudo quitar", "error");
		} finally {
			setSaving(false);
		}
	};

	if (!status) return null;

	const own = status.own;
	const usingOwn = status.mode === "own";

	return (
		<section className="coupon-sender-card" aria-labelledby="coupon-sender-title">
			<div className="coupon-sender-card__head">
				<div>
					<h3 id="coupon-sender-title" className="coupon-sender-card__title">
						<Mail size={16} aria-hidden /> Correo de los cupones
					</h3>
					<p className="coupon-sender-card__text">
						{status.ready ? (
							<>
								Los cupones que mandes desde Clientes salen desde <strong>{status.from}</strong>
								{usingOwn ? " (tu Resend)." : "."}
							</>
						) : (
							"El envío de correos todavía no está configurado en el servidor."
						)}
					</p>
					{status.customDomain && !usingOwn ? (
						<p className="coupon-sender-card__text">
							Tu negocio tiene dominio propio (<strong>{status.customDomain}</strong>). Conecta tu cuenta de Resend
							para que salgan desde tu dominio. Si no sabes cómo, pídenos ayuda desde Soporte y lo dejamos listo.
						</p>
					) : null}
					{own?.lastError ? <p className="coupon-sender-card__error">Último error de Resend: {own.lastError}</p> : null}
				</div>
				{status.customDomain && status.canConfigure && !editing ? (
					<Button variant="secondary" type="button" size="sm" onClick={startEdit}>
						{own ? "Cambiar" : "Conectar Resend"}
					</Button>
				) : null}
			</div>

			{editing ? (
				<form
					className="coupon-sender-card__form"
					onSubmit={(e) => {
						e.preventDefault();
						void save();
					}}
				>
					<div className="coupon-form-modal__grid coupon-form-modal__grid--2">
						<div className="coupon-form-modal__field coupon-form-modal__field--span-2">
							<label htmlFor="coupon-sender-key">API key de Resend</label>
							<input
								id="coupon-sender-key"
								type="password"
								autoComplete="off"
								spellCheck={false}
								disabled={saving}
								placeholder={own?.apiKeyLast4 ? `Guardada (••••${own.apiKeyLast4}). Déjala vacía para no cambiarla.` : "re_…"}
								value={form.apiKey}
								onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
							/>
							<span className="coupon-form-modal__hint">
								En resend.com › API Keys. Basta con permiso de envío («Sending access»).
							</span>
						</div>
						<div className="coupon-form-modal__field">
							<label htmlFor="coupon-sender-from">Correo remitente</label>
							<input
								id="coupon-sender-from"
								type="email"
								disabled={saving}
								placeholder={`cupones@${status.customDomain}`}
								value={form.fromEmail}
								onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
							/>
						</div>
						<div className="coupon-form-modal__field">
							<label htmlFor="coupon-sender-name">Nombre que se ve</label>
							<input
								id="coupon-sender-name"
								type="text"
								disabled={saving}
								placeholder="El nombre de tu negocio"
								value={form.fromName}
								onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
							/>
						</div>
						<div className="coupon-form-modal__field coupon-form-modal__field--span-2">
							<label htmlFor="coupon-sender-reply">Respuestas a (opcional)</label>
							<input
								id="coupon-sender-reply"
								type="email"
								disabled={saving}
								placeholder="hola@tunegocio.com"
								value={form.replyTo}
								onChange={(e) => setForm((f) => ({ ...f, replyTo: e.target.value }))}
							/>
							<span className="coupon-form-modal__hint">
								El dominio del remitente tiene que estar verificado en tu Resend. Al guardar te llega un correo de prueba.
							</span>
						</div>
					</div>
					{error ? <p className="coupon-sender-card__error">{error}</p> : null}
					<div className="coupon-sender-card__actions">
						{own ? (
							<Button variant="secondary" type="button" size="sm" disabled={saving} onClick={() => void remove()}>
								Quitar
							</Button>
						) : null}
						<Button variant="secondary" type="button" size="sm" disabled={saving} onClick={() => setEditing(false)}>
							Cancelar
						</Button>
						<Button variant="default" type="submit" size="sm" disabled={saving}>
							{saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
							{saving ? "Probando…" : "Probar y guardar"}
						</Button>
					</div>
				</form>
			) : null}
		</section>
	);
}
