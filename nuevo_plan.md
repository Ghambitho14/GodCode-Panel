Estado actual

manual-order-body (flex row en desktop, column en ≤1024px) tiene 2 columnas: [manual-order-products](components/tenant/admin/kit/admin/components/ManualOrderModal.jsx) y [manual-order-sidebar](components/tenant/admin/kit/admin/components/ManualOrderModal.jsx) (420px). Hoy el sidebar contiene orderTypeSection, customerSection, noteSection, summarySection y footerSection, intercalados con isMobileLikeLayout.

flowchart LR
    Products[Productos] --> Sidebar[Sidebar 420px<br/>tipo+cliente+nota+resumen+footer]

Estructura objetivo

flowchart LR
    subgraph Desktop
        P1[Productos] --> S1[Sidebar 420px<br/>Resumen + Footer] --> N1[Panel nuevo 420px<br/>Tipo + Cliente + Nota]
    end
    subgraph Mobile
        P2[Productos] --> N2[Panel nuevo<br/>Tipo + Cliente + Nota] --> S2[Sidebar<br/>Resumen + Footer]
    end

Cambios

1) Componente: components/tenant/admin/kit/admin/components/ManualOrderModal.jsx

Reemplazar el bloque actual del sidebar (líneas ~1494–1513) por dos paneles hermanos dentro de manual-order-body. Mantener isMobileLikeLayout para invertir el orden de DOM entre desktop y móvil:

{isMobileLikeLayout ? (
    <>
        <div className="manual-order-side-panel">
            {orderTypeSection}
            {customerSection}
            {noteSection}
        </div>
        <div className="manual-order-sidebar">
            {summarySection}
            {footerSection}
        </div>
    </>
) : (
    <>
        <div className="manual-order-sidebar">
            {summarySection}
            {footerSection}
        </div>
        <div className="manual-order-side-panel">
            {orderTypeSection}
            {customerSection}
            {noteSection}
        </div>
    </>
)}

Notas:





Las secciones internas siguen usando manual-order-section y los hooks/handlers ya definidos (sin cambios funcionales).



summarySection queda con flex: 1 (ya lo es) dentro del sidebar reducido, así el resumen sigue creciendo y empujando el footer abajo.

2) Estilos: app/[subdomain]/styles/ManualOrderModal.css

Agregar .manual-order-side-panel como gemelo de .manual-order-sidebar. Estrategia: agrupar selectores con coma para no duplicar reglas grandes.





Convertir las reglas existentes de .manual-order-sidebar para que también apliquen a .manual-order-side-panel:





Bloque base (línea ~980): mismo width: 100%, gradient, border-left, box-shadow, overflow-y: auto.



Desktop ≥1025px (~992): width: 420px; min-width: 420px; para ambos.



Tablet 768–1024px (~1000): width: 360px; min-width: 360px; para ambos.



Mobile ≤767px (1008) y ≤1024px (1034): border-left: none; border-top: 1px solid var(--modal-border); flex: 1; min-height: 0; max-height: none; para ambos.



Scrollbar webkit (~1655–1673): incluir .manual-order-side-panel en los selectores.



Tema claro admin-layout (~1851 y ~1857): incluir .manual-order-side-panel.



Footer del sidebar reducido: manual-order-summary-section ya tiene flex: 1 y el footer margin-top: auto, así que el resumen ocupa el espacio sobrante y el footer queda al final sin tocar nada extra.



Quitar el box-shadow: -10px 0 30px ... del sidebar central en desktop y dejarlo solo en el panel más a la derecha (.manual-order-side-panel en desktop). En móvil no aplica (column). Implementación:

  .manual-order-sidebar { box-shadow: none; }
  .manual-order-side-panel { box-shadow: -10px 0 30px rgba(0,0,0,0.5); }
  @media (max-width: 1024px) {
      .manual-order-sidebar, .manual-order-side-panel { box-shadow: none; }
  }
  


3) Verificación





Desktop ≥1025px: 3 columnas (Productos flex:1, Sidebar 420px con Resumen+Footer, Panel nuevo 420px con Tipo+Cliente+Nota).



Tablet 768–1024px: stack vertical, orden Productos → Panel nuevo → Sidebar.



Mobile ≤767px: igual que tablet, scroll continuo.



Tema admin claro: ambos paneles heredan el mismo gradient/borde.



submitOrder, validaciones (isFormValid), hooks (useManualOrder) y la sección orderTypeSection (que sigue editando manualOrder.delivery_*) no requieren cambios.

Fuera de alcance





No se modifica el contenido ni el comportamiento de las 3 secciones movidas.



No se cambian rutas, APIs ni el hook useManualOrder.



No se ajustan estilos de manual-order-section/manual-order-section--note (siguen igual).