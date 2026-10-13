import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";

/**
 * La pantalla del extra. Tiene a mano todo el contexto del panel con `useAdmin()`
 * (`companyId`, sucursal elegida, rol, `showNotify`…) y el cliente de Supabase en
 * `@/integrations/supabase`, igual que el resto de las pestañas.
 */
export default function PlantillaScreen() {
	const { userRole } = useAdmin() as { userRole?: string };
	return (
		<section style={{ padding: 16 }}>
			<h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Extra de ejemplo</h2>
			<p style={{ marginTop: 6, fontSize: "0.85rem", color: "var(--admin-text-muted, #64748b)" }}>
				Tu negocio tiene este extra activo. Entraste como {userRole ?? "usuario"}.
			</p>
		</section>
	);
}
