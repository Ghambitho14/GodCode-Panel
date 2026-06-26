/** Selects explícitos para catálogo y clientes del panel (sin `*`). */

export const CATEGORIES_PANEL_SELECT = 'id, name, company_id, order, is_active';

export const PRODUCTS_PANEL_SELECT =
	'id, name, description, image_url, category_id, company_id, is_active, is_special, dish_kind';

export const PRODUCT_PRICES_BRANCH_SELECT =
	'id, product_id, price, has_discount, discount_price';

export const PRODUCT_BRANCH_SELECT =
	'id, product_id, is_active, is_special, category_id, inventory_pause_reason, inventory_paused_at';

export const CLIENTS_PANEL_SELECT =
	'id, name, phone, email, source, total_orders, total_spent, last_order_at, created_at, company_id';
