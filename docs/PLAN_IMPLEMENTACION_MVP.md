# Plan incremental de implementación del MVP MAGAVI

**Estado:** propuesta corregida para revisión, sin código de aplicación<br>
**Base funcional:** `docs/DOCUMENTO_MAESTRO.md`, versión 1.1<br>
**Objetivo:** convertir la línea base del producto en incrementos verificables, desarrollables en Codex Cloud, gestionados en GitHub y desplegables inicialmente con recursos gratuitos de Render.

## 1. Alcance y jerarquía de decisiones

El documento maestro define el problema, los requisitos y la visión de largo plazo. Este plan define cómo construir el primer MVP bajo restricciones técnicas y económicas más acotadas. Cuando una propuesta tecnológica del documento maestro difiera de este plan, **para el MVP prevalecen las decisiones obligatorias de este plan**; no se modifica la transcripción histórica para ocultar esa diferencia.

El MVP será un SaaS B2B multiempresa que valida primero el ciclo **Descubrir**. El piloto sigue usando un vendedor independiente, un subconjunto real de catálogo y Puerto Montt, pero proveedor, rubro y ciudad serán datos configurables, no casos especiales.

El primer vertical demostrable será:

> catálogo seleccionado → territorio configurado → prospectos con evidencia → matches explicables → priorización revisada por el vendedor

No se programará todavía en esta tarea. Primero deben aprobarse alcance, arquitectura, riesgos, criterios de éxito y decisiones pendientes.

### 1.1 Capacidades obligatorias identificadas

| ID | Capacidad | Requisito no negociable | Entrega |
| --- | --- | --- | --- |
| CAP-01 | SaaS multiempresa | `tenant_id`, autorización y pruebas de aislamiento desde la primera migración | Fase 0 |
| CAP-02 | Identidad y permisos | Administrador MAGAVI, administrador cliente y vendedor; mínimo privilegio | Fase 0 |
| CAP-03 | Feature toggles | Habilitar capacidades por ambiente y tenant sin bifurcar código | Fase 0 |
| CAP-04 | Auditoría | Actor, tenant, fecha, acción y cambios en operaciones relevantes | Fase 0 |
| CAP-05 | Catálogo maestro/comercial | Importar Excel/CSV, previsualizar, validar, deduplicar y publicar solo productos elegidos | MVP 1 |
| CAP-06 | Landing PWA | Marca, catálogo activo y solicitud de contacto/cotización; responsive e instalable | MVP 1 |
| CAP-07 | Territorios | Cobertura configurable y medición verificable, sin exigir PostGIS | MVP 1 |
| CAP-08 | Prospección | Fuentes permitidas, procedencia, vigencia y deduplicación | MVP 1 |
| CAP-09 | Enriquecimiento | Categoría, ubicación, contactos, señales y evidencia fechada | MVP 1 |
| CAP-10 | Matching | Solo catálogo activo; taxonomía, reglas, evidencia, razones y confianza | MVP 1 |
| CAP-11 | Scoring | Heurística configurable 0–100, versionada, con factores y datos faltantes | MVP 1 |
| CAP-12 | Bandeja y mapa | Acciones antes que registros; filtros por territorio, segmento, score y estado | MVP 1 |
| CAP-13 | Feedback | Aceptar, postergar o descartar con motivo; muestra evaluable | MVP 1 |
| CAP-14 | CRM y memoria | Estados, línea de tiempo, tareas, interacciones y motivos sin perder historia | MVP 2 |
| CAP-15 | Asistencia comercial | Borradores con datos confirmados y aprobación humana | MVP 2 |
| CAP-16 | Cotización y pedido | Detalle por producto y conversión trazable a venta | MVP 2 |
| CAP-17 | Ingesta de ventas | Pedido, XML DTE idempotente e ingreso manual de respaldo | MVP 3 |
| CAP-18 | Identidad/conciliación | No fusionar organizaciones, clientes o productos con confianza insuficiente | MVP 1–3 |
| CAP-19 | Fidelización | RFM, reposición, health, riesgo, cross-sell, reactivación y feedback | MVP 3 |
| CAP-20 | Gobierno y operación | Consentimiento, supresión, trazabilidad, logs, métricas, costos y errores | Transversal |

### 1.2 Restricciones y límites explícitos

- No construir un bot de Instagram, un clon del catálogo proveedor, un ERP ni un CRM de carga manual intensiva.
- No codificar Global Frozen, Puerto Montt, HORECA o un proveedor de IA como casos especiales.
- No publicar productos automáticamente ni eliminar/desactivar silenciosamente los ausentes de una importación.
- No presentar el score heurístico como probabilidad de compra.
- No automatizar el login ni hacer scraping del portal del SII.
- No automatizar inicialmente mensajes salientes; una persona debe aprobarlos.
- No fusionar identidades con baja confianza sin revisión.
- No inventar precio, stock, condiciones o evidencia.
- No introducir ML predictivo antes de contar con resultados etiquetados suficientes.
- No incluir Next.js, FastAPI, PostGIS, pgvector, Redis, workers, scheduler ni servicios de aplicación separados en la primera etapa.
- No almacenar datos reales en los recursos gratuitos temporales de Render.

### 1.3 Atributos de calidad

| Atributo | Implicación verificable |
| --- | --- |
| Seguridad | TLS, secretos externos, sesiones seguras, RBAC y análisis de dependencias |
| Aislamiento | Tenant en aplicación y datos, fixtures adversariales y pruebas de acceso cruzado |
| Trazabilidad | Fuente, fecha, versión de regla y decisión humana en cada derivación relevante |
| Idempotencia | Restricciones únicas para importaciones, DTE y operaciones repetibles |
| Explicabilidad | Descomposición visible de match/score, confianza y datos faltantes |
| Privacidad | Minimización, finalidad, consentimiento cuando aplique y supresión |
| Portabilidad | Un contenedor, API estable y configuración por variables de entorno |
| Accesibilidad/UX | PWA responsive, teclado, contraste y estados de carga/error/vacío |
| Observabilidad | Correlation ID, logs estructurados y métricas de producto y operación |

## 2. Decisiones técnicas obligatorias del MVP

### 2.1 Arquitectura y repositorio

- **Un único repositorio** con frontend React y backend Django claramente separados dentro del mismo árbol.
- **Monolito modular**: Django contiene módulos de dominio con límites internos explícitos; no se crean microservicios.
- **Un único artefacto desplegable**: Docker construye la PWA y el mismo contenedor Django sirve sus archivos estáticos y la API.
- **Una única aplicación en ejecución**: un Web Service gratuito de Render conectado a una base PostgreSQL gratuita.
- **API REST** bajo `/api/v1` implementada con Django REST Framework (DRF).
- **Procesamiento síncrono y acotado** en la primera etapa. No se despliegan worker, scheduler, Redis ni cola.
- **Feature toggles** persistidos/configurados por ambiente y tenant para liberar funciones gradualmente sin ramas especiales.

### 2.2 Stack aprobado

| Capa | Selección para el MVP | Justificación |
| --- | --- | --- |
| PWA | React + TypeScript + Vite | Aplicación instalable y responsive sin incorporar Next.js |
| Service worker | Plugin PWA de Vite/Workbox | Manifest, caché del shell y actualización controlada |
| API y servidor | Python + Django + Django REST Framework | Backend monolítico, permisos, administración y API madura |
| Persistencia | Django ORM + migraciones de Django | Un único modelo y migraciones versionadas |
| Base de datos | PostgreSQL estándar | Relaciones, transacciones e índices sin extensiones geográficas/vectoriales en el MVP |
| Archivos tabulares | Backend Django | Lectura, validación, preview y aplicación de Excel/CSV en el mismo proceso web |
| Imágenes | Archivos demostrativos versionados en el repositorio | Evita depender del filesystem persistente durante desarrollo gratuito |
| Pruebas frontend | Vitest + Testing Library + Playwright | Unidades/componentes y recorridos críticos |
| Pruebas backend | pytest + pytest-django sobre PostgreSQL | Reglas, permisos, migraciones e idempotencia |
| Entrega | Dockerfile + `render.yaml` | Build reproducible e infraestructura declarativa mínima |

Quedan expresamente excluidos del MVP Next.js y FastAPI. Tampoco se usarán PostGIS ni pgvector: el documento maestro los propone, pero ningún criterio obligatorio del primer vertical exige esas extensiones. La ubicación se representará inicialmente con latitud/longitud y zonas configurables; el matching utilizará taxonomía, reglas y evidencia textual. Solo una medición posterior que demuestre una limitación concreta puede justificar un ADR para incorporar extensiones.

### 2.3 Módulos del monolito Django

| Módulo | Responsabilidad inicial |
| --- | --- |
| `accounts` | Usuarios, autenticación y sesiones |
| `tenancy` | Tenant, membresías, roles y contexto efectivo |
| `features` | Feature toggles por ambiente/tenant |
| `audit` | Eventos auditables y trazabilidad |
| `catalog` | Proveedores, productos, selección comercial e importaciones |
| `territories` | Zonas, coordenadas y cobertura metodológica |
| `prospecting` | Organizaciones, fuentes, evidencias, señales y deduplicación |
| `intelligence` | Matching, score, factores, versiones y feedback |
| `landing` | Configuración pública, catálogo visible y solicitudes |
| `crm`, `sales`, `loyalty` | Se incorporan únicamente en MVP 2 y MVP 3 |

Los módulos interactúan mediante servicios de aplicación e interfaces internas, no accediendo arbitrariamente a tablas ajenas. Esta disciplina permite separar componentes en el futuro sin asumir desde ahora el costo operacional de servicios distribuidos.

### 2.4 Aislamiento, roles y trazabilidad

1. Toda entidad comercial incluye `tenant_id NOT NULL`; restricciones y claves únicas incorporan tenant cuando corresponda.
2. El tenant efectivo se deriva de una membresía autorizada, nunca de un identificador confiado del navegador.
3. Managers/querysets y servicios exigen contexto de tenant; la administración global queda separada y auditada.
4. DRF aplica autenticación y permisos por objeto/acción; ocultar controles en React no cuenta como autorización.
5. Las pruebas intentan lecturas, escrituras, referencias, importaciones y exportaciones entre tenant A y tenant B.
6. Los roles iniciales son administrador MAGAVI, administrador del tenant y vendedor.
7. Cambios sensibles, importaciones, fusiones, cambios de permisos y feedback registran actor, tenant, fecha y contexto.
8. Los feature toggles nunca omiten permisos: solo controlan disponibilidad, no autorización.

### 2.5 Importación Excel/CSV e imágenes

- El navegador carga el archivo al backend Django usando límites explícitos de tamaño, filas y tiempo.
- Django valida tipo, cabeceras, campos, SKU y duplicados; produce una preview con errores, advertencias, altas, cambios y filas sin cambio.
- Confirmar la preview aplica la importación de forma transaccional e idempotente y conserva el resumen del lote.
- Al no existir worker, los límites deben mantener cada operación dentro del tiempo seguro del Web Service. Los lotes que excedan esos límites se rechazan con una explicación y se dividen manualmente.
- El parser de Excel/CSV debe impedir fórmulas peligrosas al exportar, controlar consumo de memoria y nunca ejecutar macros.
- Durante el desarrollo gratuito solo se usarán imágenes demostrativas almacenadas en el repositorio y servidas como estáticos.
- No se cargarán imágenes reales al filesystem efímero de Render. La selección de almacenamiento persistente, permisos, costos, retención y migración queda como decisión obligatoria antes del piloto con datos reales.

### 2.6 IA y scoring en el MVP

- Implementar taxonomía, reglas y SQL antes de cualquier modelo externo.
- No usar embeddings ni pgvector durante el MVP.
- Versionar fórmula, pesos, factores, evidencia y resultado del score.
- Recalcular conserva el resultado anterior para trazabilidad.
- Si luego se prueba un LLM, debe vivir detrás de una interfaz, entregar salida estructurada y no decidir permisos, publicaciones, precios ni contactos.
- El MVP debe ser funcional sin contratar un proveedor de IA.

## 3. Despliegue gratuito inicial en Render

### 3.1 Topología mínima

`render.yaml` declarará únicamente:

| Recurso | Plan inicial | Responsabilidad |
| --- | --- | --- |
| `magavi-web` | Web Service gratuito | Servir React PWA, API DRF, Django Admin y archivos estáticos demostrativos |
| `magavi-db` | PostgreSQL gratuito | Datos sintéticos o demostrativos del desarrollo |

No se crearán workers, cron jobs, scheduler, Redis, key-value store, servicios privados ni un segundo Web Service en la primera etapa.

### 3.2 Construcción y ejecución

- Un `Dockerfile` multi-stage compila React con Node y copia el resultado al artefacto Python/Django.
- Gunicorn ejecuta Django en el único Web Service; Django/WhiteNoise sirve el build de la PWA y estáticos demostrativos.
- `/api/v1/*` y administración se resuelven en Django; las demás rutas públicas habilitadas entregan el shell de React sin interceptar archivos ni API.
- `collectstatic` ocurre durante el build. Las migraciones se ejecutan mediante un comando explícito y controlado, no concurrentemente en cada réplica.
- El contenedor usa usuario sin privilegios, dependencias fijadas y variables de entorno.
- Se exponen `/health/live` y `/health/ready`; readiness comprueba solo dependencias esenciales.
- Los secretos se configuran en Render/GitHub y nunca se escriben en `render.yaml` ni en el repositorio.

### 3.3 Limitaciones obligatorias del nivel gratuito

> **Advertencia crítica:** la base PostgreSQL gratuita de Render expira después de 30 días. No se debe utilizar con datos reales, datos personales, catálogos confidenciales ni documentos tributarios.

- El ambiente gratuito es exclusivamente demostrativo y usa fixtures sintéticos.
- Antes de la expiración se puede recrear la base desde migraciones y fixtures; no se la considera almacenamiento durable.
- El Web Service gratuito puede suspenderse por inactividad y presentar latencia de arranque; esto se acepta solo durante desarrollo.
- El filesystem del Web Service es efímero: no se usa para imágenes cargadas, Excel/CSV permanentes ni XML DTE.
- Backups, RPO/RTO, región, capacidad y continuidad deben resolverse contratando recursos apropiados antes del piloto real.
- La promoción a piloto exige nueva base persistente, política de backups/restauración probada y decisión de almacenamiento de archivos/imágenes.

## 4. Flujo de trabajo Codex Cloud + GitHub

### 4.1 Unidad de entrega

Cada issue implementable debe incluir:

1. referencia a capacidad (`CAP-xx`) y fase;
2. contexto, comportamiento y fuera de alcance;
3. contrato DRF o migración afectados;
4. criterios de aceptación observables;
5. requisitos de tenant, rol, feature toggle, auditoría y errores;
6. fixtures sintéticos permitidos;
7. comandos de prueba y evidencia visual cuando aplique;
8. efecto sobre Docker/Render y estrategia de reversión.

Codex trabaja una historia pequeña por rama, lee `AGENTS.md`, ejecuta controles locales, documenta supuestos y abre un PR. No cambia stack, arquitectura, permisos, infraestructura o automatización sensible sin un issue y ADR aprobados.

### 4.2 Controles GitHub

- Proteger `main`: PR obligatorio, checks requeridos, conversaciones resueltas y sin pushes directos.
- CI por PR: formato, lint, tipos, unidades, integración, migración desde cero, contrato API, build de PWA, build Docker, secretos/dependencias y e2e mínimo.
- `CODEOWNERS` para tenancy, permisos, migraciones, feature toggles e infraestructura.
- Merge a `main` despliega el ambiente demostrativo de Render; cualquier piloto real requiere aprobación y recursos no efímeros.
- Releases etiquetados y changelog; rollback de imagen se diseña separado de cambios de datos.

### 4.3 Reglas para agentes

- Solo datos sintéticos o anonimizados en repositorio, prompts y Render gratuito.
- Nunca incluir secretos, XML reales, RUT, contactos privados o dumps.
- Nunca eliminar una prueba de aislamiento para hacer pasar CI.
- Todo supuesto se registra como decisión pendiente o ADR.
- Cambios generados se revisan igual que cambios humanos.
- Una historia no termina sin pruebas, permisos, trazabilidad, errores, documentación y revisión visual cuando corresponda.

## 5. Fases incrementales y puertas de salida

### Fase 0A — Alineación y riesgos

**Objetivo:** resolver incógnitas que podrían invalidar el piloto.

**Entregables:** dueño de producto y validador; catálogo muestra; 5–10 clientes objetivo; segmentos, exclusiones y zonas; rúbrica de “útil y accionable”; política de fuentes; datos exclusivamente sintéticos; presupuesto del piloto; ADR de autenticación, multiempresa, feature toggles y futura persistencia de archivos.

**Puerta:** alcance firmado, fuentes autorizadas, criterios de éxito medibles y aceptación expresa de que Render gratuito no aloja datos reales.

### Fase 0B — Esqueleto operacional monolítico

**Objetivo:** desplegar un recorrido técnico mínimo sin funcionalidad comercial extensa.

**Incrementos:**

1. monorepo, comandos, documentación y toolchains fijados;
2. React PWA mínima y Django/DRF con health checks;
3. Dockerfile único y `render.yaml` con un Web Service y PostgreSQL gratuitos;
4. CI en GitHub y despliegue reproducible desde `main`;
5. tenant, membresías, roles, permisos y auditoría mínima;
6. feature toggles por ambiente y tenant;
7. migraciones y pruebas adversariales tenant A/B;
8. fixtures sintéticos y procedimiento de recreación de la base temporal.

**Puerta:** el único contenedor sirve PWA y API; un usuario solo accede al tenant/funciones permitidos; la base puede recrearse desde cero; no existen servicios auxiliares.

### MVP 1A — Catálogo y landing

**Objetivo:** publicar un catálogo comercial separado del catálogo proveedor.

**Incrementos:** proveedor/categoría/producto; plantilla; Excel/CSV procesado por Django; preview; errores/advertencias; confirmación transaccional; selección/adaptación; imágenes demo del repositorio; landing PWA; formulario de contacto.

**Puerta:** importar dos veces no duplica; se corrigen errores antes de confirmar; solo se publica el subconjunto elegido; no se intenta persistir una imagen real en Render.

### MVP 1B — Territorio y evidencia

**Objetivo:** crear prospectos de calidad y medir cobertura sin PostGIS ni procesos en segundo plano.

**Incrementos:** zonas configurables; latitud/longitud; ejecución manual y acotada de una fuente permitida; organización, ubicación, contacto, evidencia y señal; deduplicación; revisión de fusiones; fecha de vigencia.

**Puerta:** una ejecución iniciada por usuario y dentro de límites registra qué cubrió y crea/actualiza prospectos sin duplicación silenciosa. No se promete exploración continua mientras no exista infraestructura de jobs.

### MVP 1C — Matching, score y validación

**Objetivo:** entregar oportunidades explicables superiores a la búsqueda manual.

**Incrementos:** taxonomía; reglas; filtros; matches sin embeddings; score versionado; ficha; bandeja; mapa cliente; filtros; feedback; conjunto de evaluación y métricas.

**Puerta:** revisión ciega o semiciega sobre la muestra acordada, comparación con línea base y decisión explícita de continuar o ajustar.

### MVP 2 — Convertir

**Objetivo:** convertir una oportunidad en pedido con mínima carga manual.

**Incrementos:** estados; timeline; actividad/tarea/interacción; motivos; siguiente acción; borrador aprobado; cotización; pedido; venta manual y embudo. Todo permanece en el monolito y las automatizaciones periódicas siguen deshabilitadas hasta aprobar infraestructura adecuada.

**Puerta:** oportunidad trazable, borradores con aprobación y pedido/cotización con detalle por producto.

### MVP 3 — Fidelizar

**Condición previa:** abandonar los recursos temporales gratuitos para datos reales y resolver almacenamiento persistente seguro.

**Objetivo:** convertir ventas verificadas en acciones de retención.

**Incrementos:** XML seguro e idempotente; conciliación asistida; ventas/items; RFM/patrones; reposición; health/riesgo; cross-sell/reactivación y feedback.

**Puerta:** el XML original tiene almacenamiento autorizado; recargas no duplican; ambigüedad abre revisión; recomendaciones explican sus datos.

### Escalamiento posterior

Workers, scheduler, Redis, almacenamiento de objetos, PostGIS, pgvector, servicios separados, automatización por canal y modelos predictivos solo se evaluarán mediante ADR y evidencia. No forman parte de la primera etapa.

## 6. Estrategia de pruebas

| Nivel | Cobertura mínima |
| --- | --- |
| Unidad | Normalización, importación, score, catálogo, permisos y feature toggles |
| Propiedades | Idempotencia, invariantes monetarias, deduplicación y límites del score |
| Integración | Django ORM con PostgreSQL, migraciones, aislamiento y Excel/CSV |
| Contrato | Endpoints y schemas DRF consumidos por React |
| Seguridad | Matriz rol×acción, tenant A/B, cargas maliciosas, rate limits y secretos |
| PWA | Manifest, service worker, actualización, offline shell y responsive |
| E2E | Acceso, importación/publicación, territorio, prospecto, match y feedback |
| Despliegue | Docker build, health checks, migración y recreación de base gratuita |
| Visual/accesibilidad | Móvil/escritorio, teclado, contraste y estados vacío/carga/error |

La definición de terminado sigue exigiendo migración/versionado, permisos, validaciones, pruebas, observabilidad, manejo de errores, documentación de API y revisión visual.

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación inicial |
| --- | --- | --- |
| PostgreSQL gratuito expira a los 30 días | Pérdida completa de datos | Solo fixtures sintéticos; recreación automatizada; migrar a plan durable antes del piloto |
| Web Service duerme o tiene recursos limitados | Latencia y timeouts | Aceptarlo en demo; límites estrictos; plan de pago antes de usuarios reales |
| Excel/CSV bloquea el proceso web | Indisponibilidad | Límites de tamaño/filas/tiempo, streaming cuando sea posible y división manual |
| No existe scheduler/worker | Sin exploración o revalidación automática | Acciones manuales acotadas y feature toggles; diferir automatización |
| Filesystem efímero | Pérdida de cargas | Imágenes demo en repo; no conservar archivos reales; decidir storage para piloto |
| Fuente pobre o prohibida | Cobertura baja o incumplimiento | Inventario, términos revisados, adaptador sustituible y evidencia |
| Falsos positivos | Baja utilidad comercial | Umbral, evidencia, revisión por muestra y motivos estructurados |
| Fuga entre tenants | Incidente crítico | Managers/servicios con tenant, permisos DRF, pruebas A/B y auditoría |
| Feature toggle usado como permiso | Acceso indebido | Evaluar siempre permisos; pruebas de combinaciones toggle/rol |
| Catálogo inconsistente | Matching deficiente | Preview, validación, taxonomía y confirmación transaccional |
| Automatización prematura | Daño reputacional | Aprobación humana y funciones sensibles apagadas por defecto |
| Alcance excesivo | Vertical incompleto | WIP limitado, puertas de salida y aplazar MVP 2/3 |

## 8. Decisiones pendientes antes del piloto real

1. Nombre, marca, dominio y responsable del vendedor.
2. Catálogo real, autorización del proveedor y visibilidad de precios/stock.
3. Segmentos, exclusiones, zonas y definición matemática de cobertura.
4. Fuente inicial permitida, KPI, muestra y umbral de éxito.
5. Proveedor de autenticación y requisito de MFA administrativo.
6. Revisión legal de privacidad, comunicaciones, retención y documentos tributarios.
7. Plan de pago, región, backups, RPO/RTO y procedimiento de restauración.
8. Almacenamiento persistente de imágenes, importaciones y XML reales.
9. Límites medidos que justificarían worker/cola/scheduler.
10. Evidencia que eventualmente justificaría PostGIS, pgvector o un proveedor de IA.

## 9. Estructura propuesta del repositorio

En esta tarea solo se actualiza documentación. La estructura recomendada para Fase 0B es:

```text
.
├── AGENTS.md
├── README.md
├── .editorconfig
├── .env.example
├── .gitignore
├── Makefile
├── Dockerfile
├── compose.yaml
├── render.yaml
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── demo-images/
│   └── src/
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── config/
│   ├── apps/
│   │   ├── accounts/
│   │   ├── tenancy/
│   │   ├── features/
│   │   ├── audit/
│   │   ├── catalog/
│   │   ├── territories/
│   │   ├── prospecting/
│   │   ├── intelligence/
│   │   └── landing/
│   └── tests/
├── fixtures/
│   └── synthetic/
├── docs/
│   ├── DOCUMENTO_MAESTRO.md
│   ├── PLAN_IMPLEMENTACION_MVP.md
│   ├── adr/
│   └── runbooks/
└── .github/
    ├── CODEOWNERS
    ├── ISSUE_TEMPLATE/
    ├── pull_request_template.md
    └── workflows/
        ├── ci.yml
        └── release.yml
```

### 9.1 Responsabilidad de archivos iniciales

| Archivo | Contenido mínimo |
| --- | --- |
| `AGENTS.md` | Comandos, stack obligatorio, límites, seguridad de datos y definición de terminado |
| `README.md` | Propósito, arquitectura, arranque local, ambientes y enlaces |
| `.env.example` | Variables documentadas sin secretos |
| `Makefile` | `setup`, `dev`, `lint`, `typecheck`, `test`, `e2e`, `migrate`, `build` y `smoke` |
| `Dockerfile` | Build multi-stage de React y runtime único Django/Gunicorn |
| `compose.yaml` | Web monolítica y PostgreSQL local, sin Redis ni worker |
| `render.yaml` | Un Web Service gratuito y una PostgreSQL gratuita, sin secretos |
| `docs/adr/*` | Decisiones versionadas y consecuencias |
| `CODEOWNERS` | Revisión de tenancy, permisos, toggles, migraciones e infraestructura |
| workflows | Checks reproducibles y despliegue controlado |
| runbooks | Deploy, migración, recreación de demo, upgrade de base e incidente |

## 10. Secuencia de los primeros PR

| PR | Contenido | Validación |
| --- | --- | --- |
| 0 | Línea base documental (esta tarea) | Transcripción separada del plan técnico corregido |
| 1 | Gobernanza: AGENTS, ADR, plantillas y CODEOWNERS | Issue/PR de ejemplo cumple el flujo |
| 2 | React, Django/DRF y comandos mínimos | Lint/test/build reproducibles |
| 3 | Dockerfile único, PWA servida por Django y PostgreSQL local | Smoke test del monolito |
| 4 | `render.yaml` con Web Service y PostgreSQL gratuitos | Deploy demo recreable sin datos reales |
| 5 | Tenant, membresías, roles, permisos, auditoría y toggles | Matriz rol/tenant/toggle |
| 6+ | Incrementos verticales de MVP 1 | Aceptación ligada a CAP y puerta de fase |

## 11. Criterio para autorizar programación

La implementación puede comenzar solo después de:

- aprobar este plan y registrar excepciones como ADR;
- confirmar React PWA + Django REST Framework + PostgreSQL como stack único;
- aceptar el despliegue inicial de un solo Web Service sin procesos auxiliares;
- aceptar que PostgreSQL gratuito expira a los 30 días y no contendrá datos reales;
- entregar catálogo muestra sintético y ejemplos anonimizados de clientes objetivo;
- definir fuente, territorio y rúbrica de utilidad;
- priorizar Fase 0B y MVP 1, dejando MVP 2/3 fuera del primer incremento.

Así se valida el supuesto comercial central sin introducir prematuramente infraestructura distribuida, extensiones de base de datos o almacenamiento persistente que el primer MVP no necesita.
