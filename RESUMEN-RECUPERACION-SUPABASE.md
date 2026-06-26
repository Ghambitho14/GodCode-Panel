# Resumen: recuperación de base de datos Supabase

Documento generado a partir de la conversación del 26/06/2026.

## Contexto

- Proyecto Supabase: `oacoilyiquawwzexvxxi` (`https://oacoilyiquawwzexvxxi.supabase.co`)
- Plan: **gratuito**, con uso que superó los límites de recursos
- No hay dumps ni backups guardados fuera de Supabase
- No se quiere pagar el plan de pago
- El dashboard **no permite pausar** el proyecto manualmente

## Pruebas con MCP (Cursor)

| Herramienta        | Resultado                                              |
|--------------------|--------------------------------------------------------|
| `get_project_url`  | OK — el proyecto responde a nivel de API               |
| `list_tables`      | Timeout — `Connection terminated due to connection timeout` |
| `execute_sql`      | Timeout / interrumpido                                 |

Conclusión: el proyecto existe, pero la base de datos no acepta consultas por saturación de recursos.

## Estado real del proyecto (captura del dashboard)

El proyecto **no está pausado ni borrado**. Está **activo pero colapsado**:

- Banner: *"Your project is currently exhausting multiple resources, and its performance is affected"*
- Table Editor: *"Failed to load schemas"* con timeout de conexión
- Los datos probablemente **siguen en el servidor**, pero **no son accesibles** en este momento

## Qué implica

| Escenario                              | ¿Se pueden recuperar los datos?                          |
|----------------------------------------|----------------------------------------------------------|
| Dashboard/SQL responde aunque sea poco | Sí — exportar de inmediato con `pg_dump` o SQL Editor    |
| Solo timeouts, sin conexión posible    | No — sin backup propio, los datos quedan inaccesibles    |
| Proyecto borrado (plan Free)           | No — no hay backups automáticos en el plan gratuito      |

En plan Free **no hay backups diarios**. Si no exportaste vos, Supabase no guarda copias para restaurar.

## Plan de acción recomendado

### 1. Cortar todo el tráfico externo

Si Vercel, scripts, tests E2E o el panel en producción siguen pegándole a la API, la base no va a bajar la carga para permitir una exportación.

- Pausar o desactivar el deploy en Vercel
- Quitar temporalmente las variables de Supabase del entorno
- Cerrar pestañas del dashboard que recarguen schemas
- Esperar 15–30 minutos sin tráfico

### 2. Intentar exportar (en este orden)

1. **Reiniciar la base** — `Settings → Database` → *Restart database* (no borra datos)
2. **SQL Editor** — consulta liviana (`SELECT count(*) FROM companies;`). Si responde, correr dump al toque
3. **`pg_dump` por terminal** — connection string del dashboard (Session pooler, puerto 6543):

```bash
pg_dump "postgresql://postgres.oacoilyiquawwzexvxxi:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres" \
  -F c --no-owner --no-acl -f godcode-respaldo.dump
```

4. Si el pooler falla, probar conexión **directa** (puerto 5432)
5. Repetir en horario de baja carga (madrugada, fin de semana)

### 3. Si no conecta después de varios intentos

| Opción                                      | Costo      | Resultado                              |
|---------------------------------------------|------------|----------------------------------------|
| Upgrade 1 mes → dump → downgrade            | ~USD 25    | Alta probabilidad de recuperar todo    |
| Crear proyecto Supabase Free nuevo          | $0         | Arrancar de cero; datos viejos perdidos |

### 4. Si hay que empezar de cero

1. Crear proyecto nuevo (otra org/cuenta si hace falta por cupo Free)
2. Actualizar `VITE_SUPABASE_URL`, anon key y service role en Vercel / `.env`
3. Recrear usuarios en Auth
4. Cargar datos manualmente o con seeds

## Material de referencia en el repo

- `BASE DE DATOS BACKUP.md` — schema SQL exportado (estructura de tablas, funciones, etc.). Sirve para **recrear el esquema**, no los datos de producción (pedidos, clientes, movimientos de caja, etc.)

## Prevención para el futuro

En plan Free, **vos sos el backup**. Rutina mínima:

```bash
pg_dump "$DATABASE_URL" -F c -f backup-$(date +%F).dump
```

Guardar el archivo en Google Drive, disco externo u otro almacenamiento. Frecuencia sugerida: semanal, o antes de dejar el proyecto inactivo.

## Conclusión

- **Estado actual:** base saturada por recursos del plan Free; datos probablemente en disco pero inaccesibles
- **Prioridad inmediata:** cortar tráfico → esperar → reiniciar DB → `pg_dump`
- **Sin conexión exitosa:** asumir pérdida de datos operativos y migrar a proyecto nuevo
- **Schema:** recuperable desde `BASE DE DATOS BACKUP.md`; **datos:** solo si lográs un dump a tiempo
