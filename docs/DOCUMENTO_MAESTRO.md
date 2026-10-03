<!--
Fuente: Documento_Maestro_MAGAVI_Inteligencia_Comercial_Territorial_v1.docx
Transcripción Markdown fiel de la versión 1.1; no incorpora decisiones técnicas posteriores.
-->

# MAGAVI — Plataforma de Inteligencia Comercial Territorial

_Documento maestro de producto, arquitectura y desarrollo_

> **Definición central.** Plataforma SaaS autónoma que descubre potenciales clientes dentro de un territorio, relaciona sus necesidades con el catálogo real de una empresa, prioriza oportunidades y protege la relación comercial después de la venta.

| PILOTO INICIAL | PRODUCTO ESCALABLE |
| --- | --- |
| Vendedor/distribuidor independiente en Puerto Montt | Multiempresa, multiproveedor, multicatálogo y multiterritorio |
| Subconjunto seleccionado del catálogo de Global Frozen | Aplicable a alimentos, ferretería, insumos acuícolas y otros rubros B2B |
| Puerto Montt como primer territorio | Expansión progresiva a la Región de Los Lagos y otros territorios |

Versión 1.1  |  21 de septiembre de 2026

_Propietario conceptual: MAGAVI SpA_

## Resumen ejecutivo

MAGAVI desarrollará una plataforma SaaS de inteligencia comercial territorial orientada a empresas que necesitan encontrar, convertir y fidelizar clientes B2B con la menor carga operacional posible. El primer piloto utilizará el catálogo que un vendedor seleccione para comercializar productos de Global Frozen en Puerto Montt; sin embargo, ni el proveedor, ni el rubro, ni la ciudad quedarán codificados como casos especiales.

> **Principio de producto.** Si una tarea comercial repetitiva puede inferirse de los datos, la plataforma no debe pedírsela al usuario. La intervención humana se reserva para decisiones, relaciones y cierres donde aporta valor.

### Los tres ciclos del producto

| DESCUBRIR | CONVERTIR | FIDELIZAR |
| --- | --- | --- |
| Explorar territorio, investigar negocios, clasificar señales y crear prospectos. | Relacionar prospectos con productos, priorizar, preparar contacto y gestionar oportunidades. | Aprender de ventas, anticipar reposición, recomendar venta cruzada y detectar riesgo de pérdida. |

### Resultado esperado del piloto

- Una landing propia del vendedor, con su marca y únicamente los productos que decidió comercializar.
- Un radar que construya y mantenga una base útil de potenciales compradores en Puerto Montt.
- Matches explicables entre cada prospecto y productos concretos del catálogo activo.
- Una bandeja de acciones priorizadas, en vez de un CRM que dependa de carga manual constante.
- Registro de ventas por pedido, XML DTE del SII o ingreso manual de respaldo.
- Una base de datos que permita aprender patrones de compra y activar fidelización.
### Hipótesis principal

Si el sistema puede transformar catálogo + territorio + evidencia pública + historial comercial en oportunidades útiles y acciones oportunas, MAGAVI tendrá un producto replicable para otros clientes y rubros.

## 1. Visión, objetivos y límites

### 1.1 Visión

Convertir la información dispersa del mercado territorial y el comportamiento real de compra en una fuerza de venta digital asistida por IA: constante, trazable, explicable y enfocada en oportunidades de alto valor.

### 1.2 Objetivos de producto

| OBJETIVO | RESULTADO OBSERVABLE |
| --- | --- |
| Reducir búsqueda manual | Prospectos nuevos descubiertos y enriquecidos automáticamente. |
| Aumentar relevancia comercial | Productos recomendados con evidencia y explicación. |
| Priorizar el esfuerzo humano | Acciones ordenadas por valor, urgencia y probabilidad. |
| Conectar actividad con ventas | Embudo desde descubrimiento hasta pedido/factura. |
| Evitar pérdida de clientes | Alertas de reposición, caída de actividad y reactivación. |
| Construir un activo de datos | Historial por cliente, producto, territorio y resultado. |

### 1.3 No es

- Un bot de Instagram ni una herramienta dependiente de una sola red social.
- Una copia del catálogo de Global Frozen.
- Un ERP contable o un reemplazo del sistema gratuito de facturación del SII.
- Un CRM tradicional que exige que el vendedor ingrese y mantenga cada dato.
- Un sistema que contacte masivamente sin reglas, consentimiento, trazabilidad o control humano.
### 1.4 Alcance territorial inicial

Puerto Montt será el territorio habilitado del piloto. La estructura debe permitir activar posteriormente Puerto Varas, Llanquihue, Frutillar, Calbuco, Osorno, Chiloé y el resto de la Región de Los Lagos sin reconstruir el producto.

## 2. Usuarios, roles y experiencia

| ROL | NECESIDAD PRINCIPAL | INTERACCIÓN ESPERADA |
| --- | --- | --- |
| Administrador MAGAVI | Configurar tenants, fuentes, políticas, planes y salud operacional. | Supervisión global; sin acceso comercial indiscriminado. |
| Dueño / administrador cliente | Configurar empresa, catálogo, territorios, usuarios y reglas. | Configuración inicial y decisiones excepcionales. |
| Vendedor | Recibir oportunidades y acciones listas para ejecutar. | Bandeja diaria, contacto, cotización, cierre y confirmaciones. |
| Cliente B2B | Consultar catálogo, cotizar, pedir o repetir compra. | Landing pública y, más adelante, área de cliente. |
| Worker / agente | Descubrir, enriquecer, puntuar, recomendar y monitorear. | Procesos automáticos auditables. |

### 2.1 Experiencia objetivo del vendedor

> **Pantalla de inicio.** “Encontramos 11 prospectos nuevos. Tres tienen prioridad alta. Dos clientes deberían reponer esta semana. Uno muestra riesgo de abandono. Un prospecto solicitó cotización. Cinco acciones requieren tu atención.”

La aplicación debe usar divulgación progresiva: primero muestra qué requiere atención; los datos, evidencias, historial y explicaciones aparecen al profundizar. No debe volcar cientos de leads sin procesar.

### 2.2 Trabajo mínimo requerido

- Seleccionar o importar el catálogo que realmente comercializa.
- Confirmar territorio, segmentos y reglas comerciales.
- Resolver casos ambiguos que el sistema no pueda decidir con confianza.
- Realizar contactos y cierres que requieran relación humana.
- Confirmar ventas cuando no exista una fuente automática o documental.
### 2.3 Acciones sensibles

El envío de comunicaciones, cambios masivos, eliminación de datos, publicación de precios y contactos de alto impacto deben mantenerse bajo permisos explícitos y, cuando corresponda, aprobación humana.

## 3. Flujo comercial integral

| ETAPA | ENTRADA | AUTOMATIZACIÓN | SALIDA |
| --- | --- | --- | --- |
| 1. Configurar | Empresa, catálogo activo, territorio, segmentos | Validación y normalización | Contexto comercial operativo |
| 2. Descubrir | Territorio + cliente ideal | Búsqueda y deduplicación | Prospectos |
| 3. Enriquecer | Fuentes y perfiles | Extracción de señales | Ficha con evidencia |
| 4. Relacionar | Prospecto + catálogo | Matching producto-cliente | Recomendaciones explicables |
| 5. Priorizar | Señales, match y reglas | Lead scoring | Cola de oportunidades |
| 6. Convertir | Interacciones y cotización | Seguimiento asistido | Pedido / venta |
| 7. Aprender | Venta y resultado | Actualización de patrones | Mejor scoring y contexto |
| 8. Fidelizar | Historial comercial | Reposición, riesgo, cross-sell | Acciones de retención |

### 3.1 Estados mínimos

Prospecto nuevo → Analizado → Priorizado → Contactado → Respondió → Interesado → Cotización → Venta → Cliente activo. Estados terminales o alternativos: descartado, perdido, inactivo y reactivación.

### 3.2 Motivos y aprendizaje

Cada pérdida, descarte o éxito debe registrar un motivo estructurado: precio, proveedor actual, volumen insuficiente, producto no utilizado, sin respuesta, datos incorrectos, fuera de territorio, cierre ganado u otro. La calidad de estos resultados determinará cuánto puede mejorar el scoring con datos propios.

### 3.3 Inbound y outbound

| OUTBOUND | INBOUND |
| --- | --- |
| La plataforma descubre e investiga empresas del territorio. | Una empresa visita la landing o solicita información. |
| Crea matches y propone productos. | El comportamiento y la solicitud expresan intención. |
| Entrega una oportunidad priorizada. | Crea o actualiza prospecto y oportunidad. |
| Ambos flujos convergen en el mismo CRM y memoria comercial. | Ambos flujos convergen en el mismo CRM y memoria comercial. |

## 4. Módulos funcionales

| MÓDULO | RESPONSABILIDAD | USO EN MVP |
| --- | --- | --- |
| Landing y catálogo | Marca pública, catálogo activo, contacto y solicitud de cotización. | MVP 1 |
| Catálogo inteligente | Proveedores, productos, categorías, formatos, precio, disponibilidad y activación. | MVP 1 |
| Territorios | Comunas, áreas, cobertura y avance de exploración. | MVP 1 |
| Descubrimiento | Encontrar negocios desde fuentes permitidas y evitar duplicados. | MVP 1 |
| Enriquecimiento | Clasificar rubro, extraer señales y conservar evidencia. | MVP 1 |
| Matching | Vincular necesidades probables con productos del catálogo activo. | MVP 1 |
| Scoring | Prioridad comercial explicable y configurable. | MVP 1 |
| CRM autónomo | Estados, tareas, interacciones y memoria de oportunidad. | MVP 2 |
| Cotizaciones y pedidos | Preparación, seguimiento y confirmación de intención/venta. | MVP 2 |
| Ventas e ingestión | Pedido, XML DTE, carga manual y conectores futuros. | MVP 3 |
| Fidelización | RFM, reposición, health score, cross-sell y riesgo. | MVP 3 |
| Administración SaaS | Tenants, usuarios, permisos, planes, límites y auditoría. | Base transversal |

### 4.1 Catálogo: dos niveles

El catálogo maestro de un proveedor puede contener cientos de productos. Cada tenant crea su catálogo comercial seleccionando solo los que venderá, con posibilidad de adaptar precio, descripción, imagen, visibilidad, disponibilidad y productos destacados. Un producto de proveedor no debe publicarse automáticamente.

### 4.2 Carga y actualización del catálogo

Para el piloto, la vía principal será una importación asistida mediante Excel o CSV. El usuario descarga una plantilla, incorpora los productos, revisa una vista previa con errores y advertencias, y confirma la importación. El sistema registra el lote, evita duplicados y distingue productos nuevos, modificados y sin cambios.

| CAMPO | REGLA INICIAL | EJEMPLO |
| --- | --- | --- |
| SKU proveedor | Obligatorio y estable por proveedor | GF-00125 |
| Nombre y categoría | Obligatorios | Salmón porcionado / Pescados |
| Formato y unidad | Obligatorios | Caja 10 kg / caja |
| Precio y disponibilidad | Configurables; pueden ser privados | 85000 / disponible |
| Imagen | Archivo asociado por SKU o URL válida | GF-00125.jpg |
| Publicar y destacar | Decisión del catálogo comercial | Sí / No |

La plataforma también permitirá crear o corregir productos mediante formulario individual. Una nueva carga podrá actualizar precios, disponibilidad y datos autorizados sin eliminar el historial ni desactivar silenciosamente productos ausentes. Las imágenes podrán cargarse en un archivo ZIP vinculado por SKU o mediante URL. Toda importación debe poder revisarse antes de aplicar cambios y conservar un resumen de resultados.

### 4.3 Flujo de selección

Archivo del proveedor → validación y normalización → catálogo maestro → selección del vendedor → catálogo comercial activo → landing, matching y cotizaciones. Si el catálogo fuente proviene de PDF, web o imágenes, se realizará una conversión asistida a la misma estructura tabular antes de importar.

### 4.4 Landing como fuente de señal

Las visitas a productos, búsquedas, solicitudes y pedidos pueden transformarse en señales de intención, respetando privacidad y consentimiento. Estas señales enriquecen el mismo perfil comercial usado por el motor outbound.

## 5. Arquitectura de solución

| CAPA | COMPONENTES | DECISIÓN PROPUESTA |
| --- | --- | --- |
| Experiencia | Landing pública + aplicación privada responsive | Next.js / React, PWA opcional |
| API de negocio | Catálogo, CRM, ventas, usuarios, territorios | Python + FastAPI |
| Datos | Relacional, geográfico, archivos, auditoría | PostgreSQL + PostGIS; almacenamiento de objetos |
| Procesamiento | Trabajos programados y colas | Redis + worker (Celery, RQ o equivalente) |
| Inteligencia | Reglas, SQL, estadística, ML y LLM | Capa desacoplada del proveedor de modelo |
| Búsqueda semántica | Embeddings de catálogo y evidencia cuando aporte valor | pgvector inicialmente |
| Observabilidad | Logs, métricas, trazas, costos y calidad | Instrumentación desde MVP |
| Entrega | Contenedores y despliegue automatizado | Docker + CI/CD; ambientes separados |

> **Decisión estructural.** `tenant_id` debe existir en todas las entidades comerciales relevantes. El aislamiento multiempresa no se agrega después: se diseña, prueba y audita desde el primer commit.

### 5.1 Principios técnicos

- Monolito modular para el MVP: menor complejidad operacional, límites internos claros y posibilidad de separar servicios cuando exista evidencia.
- API-first: landing, dashboard, workers e integraciones consumen contratos estables.
- Procesamiento asíncrono para descubrimiento, enriquecimiento, importaciones y re-cálculos.
- Idempotencia: repetir una importación o job no debe duplicar prospectos, DTE ni ventas.
- Explicabilidad y procedencia: cada señal, match y score conserva fuente, fecha, versión y motivo.
- Portabilidad de IA: modelos y prompts se encapsulan detrás de interfaces y políticas de costo/calidad.
### 5.2 Separación conceptual

MAGAVI administra la plataforma. Cada tenant representa una empresa usuaria. Un tenant puede tener múltiples proveedores, catálogos/colecciones, territorios y usuarios. Global Frozen será un proveedor del piloto, no una entidad especial del sistema.

## 6. Modelo de datos conceptual

| DOMINIO | ENTIDADES PRINCIPALES | RELACIONES CLAVE |
| --- | --- | --- |
| Identidad SaaS | tenant, user, membership, role, permission | Usuario pertenece a uno o más tenants con rol. |
| Catálogo | supplier, supplier_product, product, category, price, availability | Tenant selecciona/adapta productos de proveedores. |
| Territorio | territory, coverage_area, exploration_run | Tenant activa territorios y mide cobertura. |
| Prospección | organization, location, contact_point, source, evidence, signal | Organización deduplicada conserva fuentes y evidencia. |
| Inteligencia | product_match, lead_score, score_factor, model_run | Resultado versionado, explicable y reproducible. |
| CRM | lead, opportunity, activity, task, interaction, loss_reason | Oportunidad registra etapa, dueño y resultado. |
| Comercial | quote, quote_item, order, order_item | Documentos conectados al prospecto/cliente. |
| Ventas | sale, sale_item, tax_document, import_batch | Venta normalizada desde múltiples fuentes. |
| Fidelización | customer_metric, purchase_pattern, health_score, recommendation, alert | Métricas temporales y acciones recomendadas. |
| Gobierno | consent, suppression, audit_event, job_run, integration | Cumplimiento, trazabilidad y operación. |

### 6.1 Identidad de organizaciones

Una misma empresa puede aparecer como nombre comercial en Instagram, razón social en el XML DTE y local físico en una fuente territorial. El sistema debe mantener alias y evidencias, relacionando gradualmente nombre comercial, razón social, RUT, ubicación, dominios y perfiles sociales sin fusionar automáticamente cuando la confianza sea insuficiente.

### 6.2 Restricciones críticas

- Unicidad de DTE por tenant + tipo + emisor + folio; guardar hash del archivo para idempotencia.
- Toda consulta de negocio se filtra por tenant y se refuerza con controles a nivel de datos.
- Las entidades derivadas guardan versión de reglas/modelo y evidencia de origen.
- Los importes se almacenan con moneda, neto, impuesto y total; no solo un monto agregado.
- El detalle por producto es obligatorio para patrones de reposición y cross-selling.
## 7. Inteligencia territorial y fuentes

### 7.1 Canalización

1.  Recibir territorio, segmentos objetivo, catálogo activo y criterios del tenant.

2.  Generar consultas y explorar fuentes permitidas conforme a sus condiciones.

3.  Normalizar nombres, direcciones, categorías, coordenadas y puntos de contacto.

4.  Detectar duplicados y decidir: crear, vincular, actualizar o enviar a revisión.

5.  Extraer señales con su evidencia y fecha de observación.

6.  Calcular matches de producto y score comercial.

7.  Publicar solo prospectos que superen reglas mínimas de calidad/relevancia.

8.  Programar revalidación según volatilidad y valor comercial.

### 7.2 Política de fuentes

| TIPO | USO | CONDICIÓN |
| --- | --- | --- |
| Fuentes públicas empresariales | Descubrimiento y datos de contacto públicos | Respetar términos, límites y procedencia. |
| Web del negocio | Menú, oferta, sedes, canales y señales | Conservar URL, extracto y fecha. |
| Redes sociales | Actividad, categoría y evidencia comercial | Usar APIs/canales permitidos; no depender de scraping frágil. |
| Landing MAGAVI | Intención, formulario, cotización y pedido | Consentimiento, minimización y política de privacidad. |
| Carga del usuario | Catálogo, listas y documentos comerciales | Validación, permisos y trazabilidad. |

### 7.3 Cobertura territorial

El porcentaje “territorio explorado” debe basarse en una definición verificable (por ejemplo: cuadrículas o zonas, consultas ejecutadas, categorías cubiertas, fuentes revisadas y vigencia), no en una cifra decorativa. La metodología exacta se valida durante el piloto.

## 8. Matching y lead scoring explicable

### 8.1 Matching producto-prospecto

El matching estima la compatibilidad entre un negocio y cada producto activo. Debe combinar taxonomía, reglas comerciales, similitud semántica y evidencia concreta. No debe recomendar productos fuera del catálogo del tenant ni asumir uso sin evidencia suficiente.

| FACTOR | EJEMPLO | TRATAMIENTO |
| --- | --- | --- |
| Compatibilidad del rubro | Sushi ↔ salmón, camarón, kanikama | Regla/taxonomía |
| Evidencia directa | Producto aparece en menú o publicación | Peso alto + fuente |
| Formato/volumen | Presentación adecuada al tipo de negocio | Regla comercial |
| Territorio/cobertura | Está dentro de zona atendida | Filtro excluyente o penalización |
| Disponibilidad/margen | Producto activo y comercialmente viable | Filtro/ponderación |
| Aprendizaje histórico | Negocios similares compraron el producto | Modelo futuro |

### 8.2 Score inicial

En el MVP se recomienda un score híbrido configurable de 0 a 100. La fórmula inicial se calibra con el piloto y debe mostrar factores positivos, negativos y datos faltantes.

| DIMENSIÓN | PESO INICIAL DE REFERENCIA |
| --- | --- |
| Compatibilidad catálogo/necesidad | 30% |
| Evidencia comercial directa | 20% |
| Actividad y vigencia del negocio | 15% |
| Accesibilidad de contacto | 10% |
| Ajuste territorial/logístico | 10% |
| Potencial estimado | 10% |
| Calidad/confianza de datos | 5% |

> **No confundir.** El score inicial es una priorización heurística, no una probabilidad real de compra. Solo podrá interpretarse como probabilidad cuando exista volumen suficiente de resultados etiquetados y una validación adecuada.

## 9. CRM autónomo y asistencia comercial

### 9.1 Memoria comercial

Cada prospecto y cliente tendrá una línea de tiempo con descubrimiento, cambios de datos, evidencias, matches, recomendaciones, contactos, respuestas, cotizaciones, pedidos, ventas, alertas y decisiones humanas. Los resúmenes generados no reemplazan los eventos fuente.

### 9.2 Bandeja de acciones

| ACCIÓN | DISPARADOR | RESPUESTA ESPERADA |
| --- | --- | --- |
| Revisar oportunidad alta | Score y calidad superan umbral | Aceptar, postergar o descartar con motivo. |
| Contactar | Existe canal válido y propuesta relevante | Abrir guion borrador; humano aprueba/envía. |
| Dar seguimiento | Plazo vencido o respuesta pendiente | Contactar, reprogramar o cerrar. |
| Preparar cotización | Interés/productos identificados | Revisar cantidades, precios y condiciones. |
| Confirmar venta | Pedido u oportunidad cerrada | Registrar o vincular DTE. |
| Atender riesgo | Patrón comercial deteriorado | Seleccionar acción de retención. |

### 9.3 Automatización gradual

El sistema comenzará recomendando y preparando. La ejecución automática de mensajes solo se habilitará por canal, tenant y caso de uso después de validar calidad, cumplimiento, reputación y mecanismos de exclusión. Siempre se debe saber qué envió el sistema, cuándo, por qué y con qué versión de contenido.

### 9.4 Canales

Instagram, WhatsApp, email, teléfono y landing son canales intercambiables alrededor del mismo registro de interacción. La primera versión puede funcionar sin integración profunda con redes sociales; el núcleo es la inteligencia y priorización, no el canal.

## 10. Ventas, pedidos y XML DTE del SII

### 10.1 Fuentes de una venta

| FUENTE | MVP | NIVEL DE ESFUERZO |
| --- | --- | --- |
| Oportunidad/pedido de la plataforma | MVP 2 | Confirmación breve |
| XML DTE descargado del SII | MVP 3 | Carga individual o múltiple |
| Ingreso manual | MVP 2 | Respaldo excepcional |
| CSV/Excel | Posterior | Carga por lotes |
| API de facturador, ERP, POS o e-commerce | Posterior | Automático según conector |

### 10.2 Procesamiento XML

1.  Validar formato, tamaño, tipo de DTE, emisor y tenant.

2.  Extraer folio, fechas, RUT/receptor, razón social, montos y detalle.

3.  Detectar duplicados mediante claves tributarias y hash.

4.  Normalizar unidades, productos y precios; conservar el XML original.

5.  Resolver identidad del cliente y equivalencia de productos.

6.  Vincular pedido/cotización cuando exista coincidencia suficiente.

7.  Solicitar confirmación únicamente en ambigüedades relevantes.

8.  Crear venta, actualizar oportunidad, métricas y patrones.

> **Límite deliberado.** La plataforma no automatizará el inicio de sesión ni hará scraping del portal del SII. Para el piloto, el usuario descargará el XML y lo cargará; más adelante se evaluarán conectores formales con sistemas de facturación.

### 10.3 Reglas de conciliación

La coincidencia puede usar RUT, razón social, monto, fecha, productos y pedido abierto. Una coincidencia de baja confianza no debe fusionar ni convertir silenciosamente un prospecto; debe ir a revisión.

## 11. Fidelización y crecimiento de clientes

### 11.1 Motores de fidelización

| MOTOR | PREGUNTA | SALIDA |
| --- | --- | --- |
| Reposición | ¿Cuándo debería volver a comprar? | Ventana estimada + recordatorio. |
| Health score | ¿Qué tan sana está la relación? | Puntaje, tendencia y factores. |
| Riesgo | ¿Está disminuyendo frecuencia, monto o variedad? | Alerta priorizada por valor. |
| Cross-selling | ¿Qué producto compatible aún no compra? | Recomendación con evidencia. |
| Reactivación | ¿Qué cliente inactivo vale recuperar? | Acción y propuesta sugerida. |
| LTV | ¿Qué valor aporta y podría aportar? | Prioridad comercial de largo plazo. |

### 11.2 Inicio simple, evolución responsable

En las primeras ventas se usarán reglas transparentes: recencia, frecuencia, monto, intervalo promedio/mediana, tendencia y variedad. Los modelos predictivos se incorporarán solo cuando exista historial suficiente y puedan compararse contra una línea base sencilla.

### 11.3 Ejemplo de regla

> **Reposición.** Si un cliente compra salmón cada 14 días, el sistema puede abrir una ventana de reposición alrededor de su patrón. La tolerancia debe considerar variabilidad, estacionalidad, días hábiles y cantidad de observaciones; no basta con un promedio fijo.

### 11.4 Priorización de retención

Las alertas deben combinar riesgo y valor. Un cliente con caída moderada, alto margen y alto LTV puede requerir atención antes que uno con riesgo mayor pero impacto comercial mínimo.

## 12. Agentes y automatizaciones

| CAPACIDAD | RESPONSABILIDAD | IMPLEMENTACIÓN PREFERENTE |
| --- | --- | --- |
| Territorial | Descubrir negocios y controlar cobertura | Jobs + APIs/fuentes + reglas |
| Investigación | Extraer rubro, oferta, señales y evidencia | Extracción + LLM puntual |
| Resolución de identidad | Deduplicar y vincular perfiles/razón social | Reglas + similitud + revisión |
| Matching | Relacionar catálogo con necesidades | Taxonomía + embeddings + reglas |
| Scoring | Priorizar oportunidades | Fórmula versionada; ML futuro |
| Comercial | Preparar siguiente mejor acción y borradores | Reglas + LLM con contexto |
| Seguimiento | Detectar vencimientos y cambios de estado | Máquina de estados + scheduler |
| Fidelización | Reposición, riesgo, cross-sell y reactivación | SQL/estadística + modelos futuros |
| Calidad | Detectar datos obsoletos, anomalías y jobs fallidos | Validaciones + observabilidad |

### 12.1 No son “LLM permanentes”

Agente describe una responsabilidad autónoma, no necesariamente un modelo generativo. El orden preferente es: reglas y SQL; estadística; algoritmos/ML; LLM solo cuando la comprensión de lenguaje o contenido no estructurado lo justifique.

### 12.2 Contrato de cada ejecución

- Entrada, tenant, propósito y permisos explícitos.
- Fuentes y evidencia utilizadas.
- Salida estructurada con confianza y motivos.
- Costo, latencia, versión de regla/modelo/prompt.
- Estado: exitoso, parcial, fallido o requiere revisión.
- Capacidad de reintento idempotente y auditoría.
## 13. Seguridad, privacidad y gobierno

| CONTROL | REQUISITO MÍNIMO |
| --- | --- |
| Aislamiento multiempresa | Autorización por tenant en API y datos; pruebas automáticas de aislamiento. |
| Identidad y acceso | MFA para administradores, roles mínimos y sesiones seguras. |
| Protección de datos | TLS en tránsito, cifrado administrado en reposo y secretos fuera del código. |
| Documentos tributarios | Acceso restringido, trazabilidad, política de retención y descarga controlada. |
| Auditoría | Registrar cambios sensibles, importaciones, fusiones, envíos y decisiones automáticas. |
| Privacidad | Minimización, finalidad, consentimiento cuando aplique y mecanismos de supresión. |
| IA | No enviar más datos de los necesarios; contratos y configuración de proveedores revisados. |
| Resiliencia | Backups probados, recuperación, monitoreo y respuesta a incidentes. |
| Fuentes externas | Cumplir términos de uso, límites técnicos y reglas de cada canal. |

### 13.1 Guardrails comerciales

- Lista de exclusión por tenant y canal; no volver a contactar cuando corresponda.
- Límites de frecuencia y ventanas horarias.
- Aprobación humana inicial para mensajes salientes.
- Prohibición de fabricar precios, stock, condiciones o evidencias.
- Toda recomendación debe distinguir dato observado, inferencia y dato faltante.
- Revisión periódica de falsos positivos, sesgos territoriales y calidad de fuentes.
### 13.2 Contexto chileno

Antes de producción se debe realizar revisión legal específica sobre datos personales, comunicaciones comerciales, documentos tributarios, conservación de registros y obligaciones contractuales aplicables. Este documento define requisitos de producto y arquitectura; no reemplaza asesoría legal.

## 14. Métricas y observabilidad

| ÁREA | MÉTRICAS PROPUESTAS |
| --- | --- |
| Cobertura | Negocios únicos por zona/segmento; vigencia; porcentaje de cobertura metodológicamente definido. |
| Calidad de datos | Completitud, duplicados, contactos válidos, evidencia vigente, revisiones humanas. |
| Matching | Precisión evaluada por humanos, aceptación, productos relevantes por prospecto. |
| Embudo | Nuevos, contactados, respuestas, interesados, cotizaciones, ventas y pérdidas. |
| Eficiencia | Tiempo ahorrado, acciones diarias, tiempo a primera oportunidad y a venta. |
| Fidelización | Recompra, retención, reactivación, alertas útiles, cambio de frecuencia/ticket. |
| Economía SaaS | Costo por prospecto útil, por oportunidad y por tenant; consumo de IA. |
| Operación | Jobs fallidos, latencia, reintentos, disponibilidad, errores de integración. |

### 14.1 Norte del MVP 1

> **Métrica principal.** Porcentaje de prospectos priorizados que el vendedor considera comercialmente útiles y accionables, medido sobre una muestra revisada con criterios explícitos.

### 14.2 Experimento de validación

1.  Seleccionar una versión real del catálogo activo y segmentos HORECA iniciales.

2.  Definir zonas de Puerto Montt y una muestra objetivo de negocios.

3.  Ejecutar descubrimiento, enriquecimiento, matching y scoring.

4.  Hacer revisión ciega o semiciega por el vendedor: útil/no útil, producto correcto, razón.

5.  Contactar una muestra priorizada y registrar resultados reales.

6.  Comparar con búsqueda manual y ajustar reglas, pesos y fuentes.

## 15. Roadmap de entrega

| FASE | ALCANCE | CRITERIO DE SALIDA |
| --- | --- | --- |
| Fase 0 · Fundaciones | Repositorio, ambientes, CI/CD, auth, tenant, auditoría, esquema base y datos del piloto. | Aislamiento probado; catálogo/territorio configurables. |
| MVP 1 · Descubrir | Landing, catálogo, territorio, discovery, enriquecimiento, matching, score, mapa y dashboard. | Prueba real en Puerto Montt con prospectos útiles y explicación. |
| MVP 2 · Convertir | CRM autónomo, actividades, tareas, cotización, pedido, borradores y seguimiento. | Embudo trazable y oportunidades gestionadas con baja carga manual. |
| MVP 3 · Fidelizar | XML DTE, ventas, patrones, health score, reposición, cross-sell y reactivación. | Ventas alimentan acciones de retención útiles. |
| Escalamiento | Conectores, automatización por canales, planes SaaS, nuevos rubros y territorios. | Segundo tenant incorporado sin desarrollo a medida del núcleo. |

### 15.1 Orden sugerido de construcción del MVP 1

1.  Fundaciones multiempresa y permisos.

2.  Catálogo maestro, selección por tenant y landing básica.

3.  Territorios y modelo geográfico.

4.  Prospectos, fuentes, evidencias y deduplicación.

5.  Primer pipeline de descubrimiento controlado.

6.  Matching explicable y score configurable.

7.  Dashboard/bandeja, ficha de prospecto y mapa.

8.  Instrumentación, revisión humana y experimento de validación.

### 15.2 Estrategia de desarrollo asistido por IA

Claude Code, Codex u otros asistentes deben trabajar por historias pequeñas y verificables, basadas en contratos, migraciones, pruebas y criterios de aceptación de este documento. No deben rediseñar la arquitectura ni agregar automatización sensible sin una decisión explícita.

## 16. Criterios de aceptación por MVP

### 16.1 MVP 1 — Descubrir

- Un administrador crea un tenant, usuarios y un territorio sin tocar código.
- Se importa un catálogo proveedor y se publica únicamente el subconjunto seleccionado.
- La importación Excel/CSV presenta vista previa, valida campos, detecta duplicados y distingue altas y actualizaciones.
- Una nueva carga actualiza datos permitidos sin eliminar productos o historial de forma implícita.
- La landing refleja marca, catálogo activo y solicitud de contacto/cotización.
- El pipeline crea prospectos con fuente, ubicación, categoría, evidencia y control de duplicados.
- Cada match indica productos, score, razones, evidencia y confianza.
- El vendedor puede aceptar, descartar o posponer con motivo.
- El mapa y tablero se filtran por territorio, segmento, score y estado.
- Toda operación relevante queda aislada por tenant y auditada.
### 16.2 MVP 2 — Convertir

- Una oportunidad recorre estados sin perder historial.
- El sistema crea tareas y seguimientos según reglas.
- Los borradores comerciales usan solo datos confirmados y requieren aprobación.
- Cotizaciones/pedidos guardan detalle por producto y pueden convertirse en venta.
- El panel presenta acciones, no solo registros.
### 16.3 MVP 3 — Fidelizar

- Carga múltiple de XML válida e idempotente; errores comprensibles.
- El sistema vincula cliente/productos o solicita revisión si la confianza es baja.
- Cada venta actualiza métricas y patrones sin borrar el histórico anterior.
- Alertas de reposición y riesgo muestran fundamento y prioridad.
- Cross-selling excluye productos inactivos o incompatibles.
- El usuario puede marcar una recomendación como útil/no útil para retroalimentar el sistema.
## 17. Backlog inicial

| ÉPICA | HISTORIAS PRIORITARIAS |
| --- | --- |
| SaaS base | Crear tenant; invitar usuario; asignar rol; impedir acceso cruzado; auditar cambios. |
| Catálogo | Importar proveedor; seleccionar producto; adaptar ficha; activar/desactivar; publicar landing. |
| Territorio | Crear cobertura; segmentar; ejecutar exploración; medir estado y vigencia. |
| Prospectos | Crear desde fuente; guardar evidencia; deduplicar; fusionar con revisión; enriquecer. |
| Matching/score | Generar matches; mostrar factores; recalcular; versionar; capturar feedback. |
| Dashboard | Mostrar acciones; filtros; ficha; mapa; estadísticas de cobertura y embudo. |
| CRM | Gestionar etapa; actividad; tarea; interacción; motivo de pérdida; siguiente acción. |
| Comercial | Cotización; pedido; confirmación de venta; detalle por producto. |
| DTE | Cargar XML; validar; deduplicar; conciliar cliente/producto; registrar venta. |
| Fidelización | Calcular RFM; patrón; alerta; health score; cross-sell; reactivación. |
| Operación | Monitorear jobs/costos; reintentar; alertar fallos; exportar auditoría. |

### 17.1 Definición de terminado

Una historia se considera terminada cuando incluye migración/versionado si aplica, control de permisos, validaciones, pruebas automatizadas relevantes, observabilidad, manejo de errores, documentación mínima de API y verificación visual en tamaños móvil y escritorio.

## 18. Decisiones pendientes para iniciar el piloto

| DECISIÓN | POR QUÉ IMPORTA | RESPONSABLE / MOMENTO |
| --- | --- | --- |
| Nombre y marca del vendedor | Dominio, landing y comunicaciones. | Dueño del piloto · antes de diseño visual |
| Catálogo inicial real | Define taxonomía, importación y matching. | Vendedor + proveedor · Fase 0 |
| Precios y disponibilidad | Determina si son públicos, privados o solo cotizables. | Vendedor · Fase 0 |
| Segmentos HORECA prioritarios | Acota búsqueda y prueba de calidad. | MAGAVI + vendedor · Fase 0 |
| Zonas exactas de Puerto Montt | Permite medir cobertura y logística. | Vendedor · Fase 0 |
| Canales de contacto permitidos | Define UX, consentimiento e integraciones. | Vendedor + revisión legal · MVP 2 |
| Formato real de XML DTE usado | Permite pruebas con documentos representativos. | Vendedor · antes de MVP 3 |
| Infraestructura y presupuesto | Afecta despliegue, modelos y límites. | MAGAVI · Fase 0 |
| Criterios de éxito del piloto | Evita validar por percepción anecdótica. | MAGAVI + vendedor · Fase 0 |

> **Primer insumo requerido.** Una muestra real del catálogo que el vendedor pretende comercializar, idealmente con nombre, categoría, formato, unidad, precio/disponibilidad e imágenes; además de 5 a 10 ejemplos de negocios que él considera buenos clientes objetivo.

### 18.1 Riesgos principales

- Fuentes insuficientes o restricciones de acceso: comenzar con fuentes permitidas y medición de cobertura real.
- Demasiados falsos positivos: filtros mínimos, evidencia y revisión de muestra antes de escalar.
- Catálogo inconsistente: normalización, taxonomía y equivalencias como trabajo fundacional.
- Automatización prematura: mantener recomendación/aprobación humana hasta demostrar calidad.
- Pocos datos de venta: usar reglas simples y no prometer modelos predictivos antes de tiempo.
- Costo de IA: presupuestos por tenant, caché, modelos pequeños y procesamiento selectivo.
## 19. Plan de trabajo de arranque — 30 días

| SEMANA | OBJETIVO | ENTREGABLE |
| --- | --- | --- |
| 1 | Descubrimiento y decisiones del piloto | Catálogo muestra, segmentos, territorio, identidad de marca, KPIs y mapa de riesgos. |
| 2 | Fundaciones técnicas y prototipo de experiencia | Repositorio, ambientes, auth/tenant, modelo inicial y prototipo navegable. |
| 3 | Catálogo + prospectos + primera exploración | Importación, landing inicial, fuentes/evidencias y conjunto piloto. |
| 4 | Matching, score y validación | Dashboard, ficha explicable, revisión del vendedor y ajustes documentados. |

### 19.1 Reunión de kickoff

- Confirmar quién es dueño del producto y quién valida comercialmente.
- Revisar muestra de catálogo y restricciones del proveedor.
- Definir cliente ideal inicial y exclusiones.
- Acordar datos permitidos, fuentes y protocolo de contacto.
- Fijar métrica principal, muestra de evaluación y fecha de revisión.
- Seleccionar dominio, ambiente y responsable de despliegue.
### 19.2 Resultado al día 30

No se espera una plataforma completa. Se espera un vertical demostrable: catálogo seleccionado → territorio configurado → prospectos con evidencia → matches explicables → priorización revisada por el vendedor. Esa evidencia decidirá qué ajustar antes de ampliar el CRM y la automatización.

## 20. Decisiones consolidadas

| TEMA | DECISIÓN |
| --- | --- |
| Producto | SaaS de Inteligencia Comercial Territorial, no solución puntual para Global Frozen. |
| Piloto | Vendedor/distribuidor independiente, catálogo seleccionado y Puerto Montt. |
| Arquitectura | Multiempresa, multiproveedor, multicatálogo y multiterritorio desde el inicio. |
| UX | Mínima operación; bandeja de acciones y excepciones. |
| Datos | Detalle por producto y evidencia/procedencia obligatorios. |
| IA | Híbrida: reglas/SQL/estadística/ML/LLM según necesidad y costo. |
| Ventas | Modelo normalizado con pedido, XML DTE y manual de respaldo. |
| SII | Carga de XML; no scraping/login automatizado. |
| Fidelización | Parte central: reposición, health, riesgo, cross-sell y reactivación. |
| Canales | Desacoplados del núcleo; Instagram es fuente/canal, no el producto. |
| Automatización | Gradual, explicable, trazable y con aprobación humana al inicio. |
| Desarrollo | MVP 1 Descubrir → MVP 2 Convertir → MVP 3 Fidelizar. |

> **Definición final.** MAGAVI transforma catálogos y territorios en oportunidades comerciales accionables, y convierte las ventas resultantes en inteligencia para conservar y hacer crecer cada cliente.

Este documento funciona como línea base del producto. Los cambios de alcance, arquitectura o automatización sensible deberán registrarse como decisiones explícitas y versionadas.
