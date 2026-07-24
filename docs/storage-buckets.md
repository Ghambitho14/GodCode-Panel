# Convención de imágenes en Supabase Storage

Todas las imágenes del panel se almacenan en buckets privados. La base de datos guarda solamente la ruta relativa del objeto; nunca una URL firmada ni una URL externa.

## Estructura obligatoria

La primera carpeta siempre es `companyId`. Después se organiza por módulo, sucursal cuando aplica, tipo de contenido y entidad.

```text
menu/
└── {companyId}/
    ├── catalog/
    │   └── products/
    │       ├── {productId}/
    │       └── drafts/
    ├── cart-upsell/
    │   └── {branchId}/
    │       ├── beverages/{itemId}/
    │       └── extras/{itemId}/
    └── storefront/
        ├── carousel/{branchId}/
        └── branding/
            ├── logo/
            └── background/

receipts/
└── {companyId}/
    └── orders/{branchId}/receipts/{YYYY}/{MM}/{orderId|pending-*}/

products/
└── {companyId}/
    └── reservado para imágenes de inventario que no pertenezcan al menú
```

Los nombres de archivo son UUID generados por el cliente. Una creación de producto puede comenzar en `drafts`; al reemplazar su imagen posteriormente, la nueva imagen queda bajo el `productId` definitivo y se elimina la anterior.

## API central

Los componentes no deben construir rutas ni decidir buckets manualmente. Deben usar:

- `uploadCompanyImage(file, context, options)` para subir.
- `deleteCompanyImage(path, context, companyId)` para borrar únicamente dentro de la raíz del negocio.
- `getCompanyImageStorageTarget(context, options)` solamente para inspección, pruebas o tareas especiales.
- `useSignedImageUrl(path, bucket)` para mostrar objetos privados.

Contextos disponibles:

- `CATALOG_PRODUCT`
- `CART_UPSELL`
- `MENU_CAROUSEL`
- `STOREFRONT_BRANDING`
- `ORDER_RECEIPT`

Ejemplo:

```js
const imagePath = await uploadCompanyImage(
  file,
  IMAGE_STORAGE_CONTEXTS.CART_UPSELL,
  { companyId, branchId, variant: 'extras', entityId: item.id },
);
```

## Ciclo de reemplazo seguro

1. Subir la imagen nueva.
2. Guardar la nueva ruta relativa en la base de datos.
3. Si el guardado fue exitoso, eliminar la imagen anterior.
4. Si el guardado falló, eliminar la imagen recién subida.

Al eliminar una entidad, primero se elimina o confirma la eliminación del registro y después se borra su imagen. Esto evita dejar la base de datos apuntando a un archivo inexistente.

## Reglas

- `companyId` es obligatorio; no existe una carpeta global o `general`.
- Las rutas con `..`, segmentos vacíos o caracteres no seguros son rechazadas.
- No se aceptan URLs de proveedores externos.
- Una eliminación valida que la ruta pertenezca al mismo `companyId`.
- Los buckets son privados y se muestran mediante URLs firmadas.
- La carga máxima actual es 5 MB y los formatos permitidos son JPG, PNG, WebP y GIF.
