export type DatabaseCompanyTheme = {
	displayName?: string;
	logoUrl?: string | null;
	primaryColor?: string;
	secondaryColor?: string;
	priceColor?: string;
	discountColor?: string;
	hoverColor?: string;
	backgroundColor?: string;
	backgroundImageUrl?: string | null;
	roleNavPermissions?: Record<string, string[]>;
};