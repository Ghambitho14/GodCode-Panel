import React, { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCouponSenderStatus } from "@/modules/cash/services/couponEmailService";
import { createTicket } from "@/modules/cash/services/ticketsService";

/**
 * Desde qué correo salen los cupones (pestaña Cupones). Solo lectura.
 *
 * - Sin dominio propio: salen por el Resend de GodCode con el nombre del negocio;
 *   no hay nada que configurar.
 * - Con dominio propio: el Resend del negocio lo configura soporte desde el super
 *   admin de GodCode. Aquí el dueño o el CEO lo pide con un ticket; la API key
 *   nunca se escribe en el panel.
 */
function buildSenderSetupTicket(status) {
	const domain = status?.customDomain ?? "";
	const changing = status?.mode === "own";
	return {
		subject: changing
			? `Cambiar el correo de los cupones (${domain})`
			: `Configurar el correo de los cupones con mi dominio (${domain})`,
		description: [
			changing
				? `Quiero cambiar el remitente de los cupones por correo. Hoy salen desde ${status?.from ?? "?"}.`
				: `Quiero que los cupones por correo salgan desde mi dominio ${domain}. Hoy salen desde ${status?.from ?? "?"}.`,
			"Correo remitente que quiero usar: ",
			"Nombre que se ve: ",
			"Respuestas a (opcional): ",
		].join("\n"),
		category: "technical",
		priority: "medium",
	};
}

export default function CouponEmailSenderCard({ showNotify }) {
	const [status, setStatus] = useState(null);
	const [requesting, setRequesting] = useState(false);
	const [requested, setRequested] = useState(false);

	/** Sin la función (aún no desplegada) la tarjeta no se muestra: los cupones siguen igual. */
	const readStatus = useCallback(async () => {
		try {
			return await fetchCouponSenderStatus();
		} catch (err) {
			console.warn("[cupones] remitente:", err instanceof Error ? err.message : err);
			return null;
		}
	}, []);

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

	const requestSetup = async () => {
		setRequesting(true);
		try {
			await createTicket(buildSenderSetupTicket(status));
			setRequested(true);
			showNotify?.("Listo, abrimos un ticket. Te escribimos desde Soporte para dejarlo configurado.", "success");
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : "No se pudo abrir el ticket", "error");
		} finally {
			setRequesting(false);
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
								{usingOwn ? " (tu dominio)." : "."}
							</>
						) : (
							"El envío de correos todavía no está configurado en el servidor."
						)}
					</p>
					{status.customDomain && !usingOwn ? (
						<p className="coupon-sender-card__text">
							Tu negocio tiene dominio propio (<strong>{status.customDomain}</strong>). Si quieres que los cupones
							salgan desde tu dominio, pídelo a Soporte y lo dejamos configurado.
						</p>
					) : null}
					{own?.lastError ? (
						<p className="coupon-sender-card__error">
							Último error al enviar desde tu dominio: {own.lastError}. Escríbenos a Soporte para revisarlo.
						</p>
					) : null}
				</div>
				{status.customDomain && status.canConfigure ? (
					<Button
						variant="secondary"
						type="button"
						size="sm"
						disabled={requesting || requested}
						onClick={() => void requestSetup()}
					>
						{requesting ? (
							<Loader2 size={14} className="animate-spin" aria-hidden />
						) : (
							<LifeBuoy size={14} aria-hidden />
						)}
						{requested ? "Ticket enviado" : usingOwn ? "Pedir un cambio a Soporte" : "Pedir a Soporte"}
					</Button>
				) : null}
			</div>
		</section>
	);
}
