import React from "react";

/** Partes típicas de un producto; se cruzan por nombre con los grupos de "Agregar cambios". */
const RECIPE_PARTS = ["Base", "Proteína", "Relleno", "Plaqueta", "Topping", "Salsa", "Acompañamiento"];

/**
 * Parte(s) de una línea de receta. En una promo el mismo insumo puede ser relleno en un roll y
 * plaqueta en otro, así que se marcan varias; se guardan como «Relleno, Plaqueta».
 */
export default function RecipePartPicker({ value, itemName, onChange }) {
	const current = String(value || "").split(",").map((p) => p.trim()).filter(Boolean);
	const all = [...RECIPE_PARTS, ...current.filter((p) => !RECIPE_PARTS.includes(p))];
	const toggle = (part) => {
		const next = current.includes(part) ? current.filter((p) => p !== part) : [...current, part];
		onChange(all.filter((p) => next.includes(p)).join(", "));
	};
	return (
		<details className="inventory-recipe-line__part">
			<summary aria-label={`Parte del producto de ${itemName}`}>
				{current.length > 0 ? current.join(", ") : "Sin parte"}
			</summary>
			<div className="inventory-recipe-line__part-menu" role="group" aria-label={`Partes de ${itemName}`}>
				{all.map((part) => (
					<label key={part}>
						<input type="checkbox" checked={current.includes(part)} onChange={() => toggle(part)} />
						<span>{part}</span>
					</label>
				))}
			</div>
		</details>
	);
}
