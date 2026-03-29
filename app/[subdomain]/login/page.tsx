import { redirect } from "next/navigation";

/** Rutas con slug quedan redirigidas al login unificado en la raíz. */
export default async function LegacyTenantLoginPage() {
	redirect("/");
}
