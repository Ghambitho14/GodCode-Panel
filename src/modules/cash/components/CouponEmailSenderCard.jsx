import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, LifeBuoy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import { fetchCouponSenderStatus } from "@/modules/cash/services/couponEmailService";
import {
	buildCouponSenderTicketDraft,
	queueSupportTicketDraft,
} from "@/modules/cash/utils/supportTicketDraft";

const SUPPORT_TAB = "module:tickets";
const ACCOUNT_EMAIL_URL = "https://www.godcode.me/cuenta?tab=correo";

/**
 * Desde qué correo salen los cupones (pestaña Cupones). Solo informa.
 *
 * - Sin dominio propio: salen por el Resend de GodCode con el nombre del negocio;
 *   no hay nada que configurar.
 * - Con dominio propio: el Resend del negocio lo conecta el CEO desde su cuenta
 *   GodCode (/cuenta › Correo de cupones) o lo dejamos listo desde el super admin
 *   cuando nos lo piden por Soporte.
 */
export default function CouponEmailSenderCard() {
	const { canAccessTab, setActiveTab, userRole } = useAdmin();
	const [status, setStatus] = useState(null);

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

	if (!status) return null;

	const own = status.own;
	const usingOwn = status.mode === "own";
	const canAskSupport = Boolean(status.customDomain) && canAccessTab?.(SUPPORT_TAB);
	const isCeo = String(userRole ?? "").toLowerCase() === "ceo";

	const askSupport = () => {
		queueSupportTicketDraft(buildCouponSenderTicketDraft(status));
		setActiveTab(SUPPORT_TAB);
	};

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
							Tu negocio tiene dominio propio (<strong>{status.customDomain}</strong>). Para que los cupones salgan
							desde tu dominio hay que conectar una cuenta de Resend. El CEO puede hacerlo desde su cuenta GodCode, o
							pídenos ayuda y lo dejamos listo.
						</p>
					) : null}
					{usingOwn ? (
						<p className="coupon-sender-card__text">
							Para cambiarlo, el CEO entra a su cuenta GodCode › Correo de cupones.
						</p>
					) : null}
					{own?.lastError ? <p className="coupon-sender-card__error">Último error de Resend: {own.lastError}</p> : null}
				</div>
				{canAskSupport || (status.customDomain && isCeo) ? (
					<div className="coupon-sender-card__actions">
						{status.customDomain && isCeo ? (
							<Button variant="ghost" size="sm" asChild>
								<a href={ACCOUNT_EMAIL_URL} target="_blank" rel="noopener noreferrer">
									<ExternalLink aria-hidden /> Configurar en mi cuenta
								</a>
							</Button>
						) : null}
						{canAskSupport ? (
							<Button variant="secondary" type="button" size="sm" onClick={askSupport}>
								<LifeBuoy aria-hidden /> Pedir ayuda a Soporte
							</Button>
						) : null}
					</div>
				) : null}
			</div>
		</section>
	);
}
