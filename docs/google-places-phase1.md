# Google Maps Places: alcance de la Fase 1

Esta fase agrega modelos, normalización e ingestión de resultados **ya obtenidos**.
No registra rutas para ejecutar Places, no añade una tarea programada y no cambia
el descubrimiento de Instagram. El método `run_sync()` del proveedor solo puede
invocarse explícitamente desde código; las pruebas sustituyen la llamada HTTP.

## Correspondencia comercial

Cada `DiscoveryJob` guarda `category_families`. `prepare_places_job()` selecciona
familias conocidas a partir del rubro buscado o acepta una selección explícita.
Las equivalencias revisables están en `place_categories.py`: por ejemplo,
«cafeterías» corresponde a `Espresso bar`, `Coffee shop` y `Café`. Se revisan
`category` y `allCategories` de cada lugar. Una categoría presente pero ajena al
rubro, o una búsqueda sin regla conocida, produce una `DiscoveryObservation`
`REJECTED` con el motivo. Agregar familias o equivalencias requiere revisar el
código hasta que exista configuración para cada empresa en la interfaz.

La validación territorial exige país `CL` o `Chile`, región del territorio activo
y ciudad igual a la localidad solicitada. La deduplicación automática utiliza
solo `(empresa, placeId)`; los nombres comerciales no provocan fusiones.

## Límite temporal y costos

El proveedor y la ingestión de esta fase admiten únicamente `maxResults=1` y
`maxImages=0`. El playground mostró US$0,004 por establecimiento, pero el costo
real del run controlado sigue pendiente de confirmar en Run History. Los campos
`estimated_cost_usd` y `actual_cost_usd` son distintos y no se completan por
suposición. Para ampliar el límite se debe confirmar primero el máximo permitido,
la paginación, los cargos reales y la facturación de búsquedas vacías; después
añadir presupuestos por empresa, caché y pruebas de múltiples resultados antes
de relajar **ambas** validaciones del proveedor y de la ingestión.

## POST, timeout y resultado incierto

`run_sync()` realiza **un solo POST** al endpoint `wait=true` confirmado en el
playground. No hay reintentos automáticos. Si vence el timeout, falla la conexión,
el proveedor responde 429/5xx o llega una respuesta 200 inválida, el proveedor
marca `submission_uncertain=True`. Esto significa que Mindcase pudo haber creado
y cobrado una ejecución aunque MAGAVI no tenga su resultado. Se debe revisar Run
History y reconciliar esa ejecución antes de autorizar otro POST; repetir la
solicitud a ciegas podría duplicar el cargo. La respuesta HTTP de `wait=true`
no se ha validado en vivo desde MAGAVI: solo se confirmó que el archivo JSON
descargado del run controlado es un array directo. Si el API devuelve otro
envoltorio, se tratará como resultado incierto y no se reintentará.

`wait=false`, sus campos de respuesta para Places, la estructura interna de
`socials` cuando contiene datos y la paginación siguen sin verificar. La
programación, el seguimiento de jobs, el vínculo con la interfaz y el
enriquecimiento de Instagram pertenecen a una fase posterior.
