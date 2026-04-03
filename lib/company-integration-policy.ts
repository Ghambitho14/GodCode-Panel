/** Alineado con saas-godcode-admin/lib/company-integration-policy.ts */

export function isTenantExternalDeliveryAllowed(integrationSettingsRaw: unknown): boolean {
	if (
		!integrationSettingsRaw ||
		typeof integrationSettingsRaw !== "object" ||
		Array.isArray(integrationSettingsRaw)
	) {
		return true;
	}
	const o = integrationSettingsRaw as Record<string, unknown>;
	if (o.allowTenantExternalDelivery === false) return false;
	if (o.allow_tenant_external_delivery === false) return false;
	return true;
}
