# Google Maps Places: búsqueda manual acotada en Prospectos

La pantalla Prospectos permite a OWNER/ADMIN buscar un rubro configurado en una
localidad de un territorio activo. Cada clic crea como máximo **un** POST a
`/v1/data/google-maps/places/run?wait=true`, con `maxResults=1` y `maxImages=0`.
No hay tarea programada de Places ni búsqueda automática de Instagram nueva.
La ruta GET `/api/prospects/places/` solo lee historial, observaciones y cupo;
no llama a Mindcase. El POST de esa ruta requiere sesión, empresa activa y rol
de edición. `MINDCASE_API_KEY` permanece exclusivamente en el backend.

La solicitud queda registrada como `DiscoveryJob` RUNNING **antes** de enviar
el POST externo. Un resultado validado pasa por la ingestión territorial y
comercial de Fase 1, crea un prospecto aun sin Instagram, o conserva el motivo
de descarte. La deduplicación usa `(empresa, placeId)`. La interfaz muestra las
20 búsquedas más recientes y sus observaciones. Un resultado de la misma empresa,
territorio, localidad y rubro completado en las últimas 24 horas se reutiliza
sin consumir otra consulta.

El cupo inicial es cinco POST por empresa y día en `America/Santiago`; se puede
ajustar con `MAPS_DAILY_MAX_RUNS` entre 0 y 50. Este valor es un límite de
solicitudes, no un saldo exacto. `estimated_cost_usd=0.004` es la tarifa por
lugar mostrada en el playground; `actual_cost_usd` queda vacío hasta verificar
Run History. No se solicitan imágenes. Desconocemos aún el cargo de búsquedas
vacías y los posibles cargos adicionales.

Un timeout, 429, 5xx o JSON inesperado deja `submission_uncertain=True`. Un
reinicio durante el POST conserva RUNNING. Ambos estados impiden nuevas
consultas pagadas para la empresa, incluidos los clics repetidos. No hay
reintentos automáticos. Para reactivar una empresa se debe reconciliar el intento
con Mindcase Run History y sus resultados, y corregir el registro bajo revisión
administrativa; todavía no existe un control público de reconciliación.

El export controlado de Places era un array directo, pero **no se ha validado**
el cuerpo de la respuesta HTTP de `wait=true` desde MAGAVI. Si el endpoint
responde con otro envoltorio, el intento quedará incierto sin duplicarse.
`wait=false` para Places, paginación, máximo real de resultados y estructura de
`socials` poblado siguen pendientes. No se vinculan perfiles de Instagram por
coincidencias de nombre, y la lógica actual de Instagram no se modifica.
