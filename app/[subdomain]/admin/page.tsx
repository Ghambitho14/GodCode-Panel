import { redirect } from "next/navigation";

/** Rutas con slug quedan redirigidas al admin unificado en la raíz. */
export default async function LegacyTenantAdminPage() {
	redirect("/admin");
}
