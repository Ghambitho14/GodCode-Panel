/** Selects explícitos para inventario del panel (sin `*`). */

export const INVENTORY_ITEMS_PANEL_SELECT =
	'id, company_id, name, unit, category, min_stock, item_type, cost_per_unit, tags, beverage_kind, created_at, updated_at';

export const INVENTORY_BRANCH_PANEL_SELECT =
	'id, branch_id, inventory_item_id, current_stock, min_stock, updated_at';

export const INVENTORY_BRANCH_WITH_ITEM_SELECT =
	`${INVENTORY_BRANCH_PANEL_SELECT}, inventory_items(id, name, unit, min_stock, category)`;

export const INVENTORY_MOVEMENTS_PANEL_SELECT =
	'id, branch_id, company_id, inventory_item_id, movement_type, quantity_delta, created_at, note, order_id';

export const PRODUCT_INVENTORY_RECIPE_SELECT =
	'id, company_id, product_id, inventory_item_id, qty_per_sale';
