-- Parte del producto a la que pertenece cada línea de receta (Base, Proteína, Relleno, Plaqueta,
-- Topping, Salsa…). Sirve al botón "Cambios": un grupo del armador ("Nuevo extra") solo mira
-- las líneas cuya parte coincide con su nombre. Opcional: sin parte se compara por nombre.
ALTER TABLE public.product_inventory_recipe
  ADD COLUMN IF NOT EXISTS part text;
