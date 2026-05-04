import { TenantLoginShell } from "../components/tenant/tenant-login-shell";
import { TenantShell } from "../components/tenant/tenant-shell";
import "./[subdomain]/tenant.css";
import "./[subdomain]/styles/Login.css";

const loginShellCss =
	".login-shell,.login-container{--login-accent:#e63946;}";

export default function HomePage() {
	return (
		<>
			<style>{loginShellCss}</style>
			<div className="tenant-theme-vars">
				<TenantShell>
					<TenantLoginShell
						displayName="Panel del negocio"
						logoUrl={null}
						storefrontBackUrl={null}
					/>
				</TenantShell>
			</div>
		</>
	);
}
