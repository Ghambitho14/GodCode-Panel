import { lazy, Suspense } from "react";
import "./styles/tailwind.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./modules/cash/app-shell";
import { LoginShell } from "./modules/auth/login-shell";
import { Loader2 } from "lucide-react";

import "./modules/cash/styles/fulfillment-colors.css";
import "./modules/cash/styles/Login.css";
import "./modules/cash/styles/App.css";

const AdminApp = lazy(() =>
	import("./modules/cash/admin/admin-app").then((m) => ({ default: m.AdminApp })),
);

function AdminRouteFallback() {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "40vh",
				gap: 10,
			}}
		>
			<Loader2 className="animate-spin" size={22} aria-hidden />
			<span>Cargando panel...</span>
		</div>
	);
}

/**
 * Tabs "extras" del admin que el panel viejo cargaba desde `saas_admin_modules`
 * (tabla del SaaS hoy vacia). El panel viejo tambien inyectaba "Soporte" por
 * codigo cuando faltaba; replicamos ese comportamiento aqui hasta que decidamos
 * (Fase 2) si exponemos `saas_admin_modules` directamente o no.
 *
 * El consumo lo hace `AdminProvider` (filtra por `allowedRoles` del usuario).
 */
const DEFAULT_DYNAMIC_MODULES = [
  {
    id: "system-module-tickets",
    tabId: "module:tickets",
    label: "Soporte",
    description: "Crea y da seguimiento a tickets de soporte.",
    navGroup: "root" as const,
    navOrder: 85,
    allowedRoles: ["owner", "admin", "ceo", "cashier", "staff"],
    isActive: true,
  },
];

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<LoginShell displayName="GodCode Caja" />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminApp
                  companyName="GodCode Caja"
                  dynamicModules={DEFAULT_DYNAMIC_MODULES}
                />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
