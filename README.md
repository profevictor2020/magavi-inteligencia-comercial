# MAGAVI — Inteligencia Comercial Territorial

Base técnica ejecutable del MVP MAGAVI. Esta entrega incorpora una PWA React, una API Django REST Framework, PostgreSQL, resolución multiempresa por hostname, landing pública por empresa, catálogo comercial con importación Excel/CSV revisable, solicitudes públicas de contacto/cotización, pedidos con pago por coordinar, cotizaciones emitibles desde esas solicitudes, prospectos, matching comercial explicable, búsqueda automática opcional de prospectos en Instagram con IA, un área privada protegida, Django Admin y health check. **No incluye pago en línea.**

## Arquitectura

El repositorio contiene un **monolito modular** desplegado como un único proceso:

```text
Navegador ──► Django + DRF + WhiteNoise ──► PostgreSQL
                 │
                 ├── /api/health/  API de salud
                 ├── /admin/       Django Admin
                 └── /*            React PWA compilada
```

- `frontend/`: React, TypeScript, Vite y service worker PWA.
- `backend/`: Django, Django REST Framework, configuración por ambiente y aplicaciones modulares.
- `backend/apps/accounts/`: modelo de usuario personalizado desde la primera migración.
- `backend/apps/catalog/`: categorías y productos comerciales aislados por tenant.
- `backend/apps/health/`: comprobación pública y mínima de aplicación/base de datos.
- `backend/apps/inquiries/`: solicitudes, cotizaciones y pedidos aislados por tenant.
- `backend/apps/prospecting/`: registro manual y descubrimiento automático opcional de prospectos, revisión y matching por tenant.
- `backend/apps/tenancy/`: tenants, membresías, dominios, resolución segura, permisos y API pública/privada.
- `Dockerfile`: build multi-stage; compila React y crea una imagen Python no privilegiada.
- `render.yaml`: un Web Service gratuito y una PostgreSQL gratuita.
- `scripts/start.sh`: aplica migraciones y ejecuta Gunicorn.
- `docs/`: línea base funcional y plan incremental.

No se usan Next.js, FastAPI, Redis, Celery, workers, PostGIS ni pgvector. La tarea programada de GitHub Actions llama al servicio en Render cuando se configuran sus secretos.

## Requisitos locales

- Python 3.13 recomendado.
- Node.js 22 y npm.
- PostgreSQL accesible mediante `DATABASE_URL`.
- Docker, opcional para validar la imagen de producción.

## Configuración

1. Copiar el contrato de variables sin versionar secretos:

   ```bash
   cp .env.example .env
   ```

2. Cambiar los valores locales. Nunca usar los valores de ejemplo en producción.
3. Exportar las variables antes de ejecutar Django. El proyecto no carga `.env` automáticamente para evitar diferencias ocultas entre local, CI y Render:

   ```bash
   set -a
   . ./.env
   set +a
   ```

Variables principales:

| Variable | Propósito |
| --- | --- |
| `DJANGO_SECRET_KEY` | Secreto generado en el ambiente; obligatorio en producción |
| `DJANGO_SETTINGS_MODULE` | `config.settings.development`, `test` o `production` |
| `DEBUG` | `true` solo durante desarrollo local |
| `DATABASE_URL` | URL PostgreSQL; obligatoria en producción |
| `ALLOWED_HOSTS` | Hosts separados por comas |
| `CSRF_TRUSTED_ORIGINS` | Orígenes completos separados por comas |
| `SECURE_SSL_REDIRECT` | Redirección HTTPS, activada en producción |
| `SESSION_COOKIE_SECURE` | Cookie de sesión solo HTTPS en producción |
| `CSRF_COOKIE_SECURE` | Cookie CSRF solo HTTPS en producción |

No se deben registrar ni confirmar secretos, datos personales, RUT, documentos tributarios o información real de empresas.

### Descubrimiento automático de prospectos en Instagram

La función es opcional y se activa cuando el operador configura en **Render → magavi-web → Environment** `MINDCASE_API_KEY`, `DEEPSEEK_API_KEY` y `AUTOMATION_TOKEN` (una cadena aleatoria larga). La clave de Mindcase se obtiene en **Mindcase Console → API keys** y la de DeepSeek en **DeepSeek Platform → API keys**. Ambas se guardan solo como secretos en Render; nunca se pegan en el chat ni en GitHub. `OPENAI_API_KEY` sigue siendo una alternativa a DeepSeek: si están las dos, se utiliza DeepSeek. También se puede configurar `APIFY_TOKEN` en lugar de `MINDCASE_API_KEY`; si existen ambos, se utiliza Mindcase. El extractor de Apify por defecto es `apify~instagram-scraper`, configurable con `APIFY_INSTAGRAM_ACTOR_ID`. La búsqueda y clasificación consumen servicios externos y pueden generar cargos en sus respectivas cuentas. La aplicación no revela las claves en `/app`.

En **GitHub → Settings → Secrets and variables → Actions**, crear el secreto `MAGAVI_AUTOMATION_TOKEN` con el **mismo valor** de `AUTOMATION_TOKEN` de Render. La variable opcional `MAGAVI_BASE_URL` permite reemplazar la URL pública de Render. Tras configurar las claves, el owner o admin activa una vez la búsqueda en **/app → Prospectos**. El workflow `Instagram discovery` se ejecuta cada quince minutos y procesa una empresa habilitada y pendiente por ejecución; también admite `workflow_dispatch` para una prueba inicial. Las búsquedas completadas se espacian al menos 20 horas por empresa. Un trabajo pendiente se consulta por su `job_id` sin volver a iniciar la extracción. `MINDCASE_POLL_INTERVAL_MINUTES` (15 por defecto, entre 5 y 120) regula el intervalo mínimo entre consultas; `MINDCASE_JOB_MAX_WAIT_HOURS` (24 por defecto, entre 1 y 72) detiene el seguimiento si el proveedor no termina. Mindcase recibe una consulta por ejecución; Apify recibe hasta dos hashtags. Se analizan como máximo doce perfiles de la respuesta en cada ejecución. **Ese límite local no limita los perfiles que Mindcase pueda devolver o cobrar**: revisar el saldo y el control de gasto de Mindcase antes de activar la tarea. Si no hay productos disponibles, no consulta proveedores externos.

El paquete oficial `mindcase` 0.3.0 publicado en npm/PyPI documenta `GET /api/v1/jobs/{job_id}` para estado y `GET /api/v1/jobs/{job_id}/results` para resultados, con autenticación Bearer y estados `queued`, `running`, `completed`, `failed` y `cancelled`. MAGAVI usa esas rutas HTTP desde Python, sin otro servicio Node. La búsqueda por palabra clave se inicia en `POST /v1/data/instagram/profiles/run?wait=false`, según el playground de Mindcase. **Falta validar en una ejecución real que los jobs de `/v1/data` se puedan consultar con las rutas `/api/v1/jobs` del SDK**. Hasta comprobarlo, mantener la búsqueda automática pausada en producción.

La IA propone una búsqueda por rubro y localidad a partir de productos y territorios activos. Mindcase devuelve perfiles públicos con biografía y publicaciones recientes; la IA filtra negocios compradores con una razón y una puntuación. Con Apify, la IA propone hashtags y el extractor devuelve publicaciones asociadas. Se guardan solo perfiles con evidencia comercial y puntuación de al menos 60/100. Los prospectos se deduplican por cuenta de Instagram dentro de cada empresa. La información pública y la razón del hallazgo aparecen en **/app → Prospectos**; allí también se ve el estado de la última búsqueda. El proceso no envía mensajes ni valida pagos. La cobertura depende de los resultados reales que entregue el proveedor; hacer una ejecución inicial con el catálogo de la empresa antes de considerar el descubrimiento operativo.

## Desarrollo del backend

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py runserver
```

El desarrollo normal usa PostgreSQL desde `DATABASE_URL`. SQLite está limitado a la configuración autocontenida de pruebas y **nunca se selecciona en producción**.

API disponible:

```text
GET /api/health/
200 {"status":"ok","database":"ok"}
503 {"status":"unavailable","database":"unavailable"}
```

## Desarrollo del frontend

En otra terminal:

```bash
cd frontend
npm ci --no-audit --no-fund
npm run dev
```

Vite sirve la interfaz en `http://localhost:5173` y redirige `/api` a Django en `http://localhost:8000`.

### Demostración multiempresa local

Después de aplicar migraciones, carga exclusivamente los fixtures sintéticos:

```bash
cd backend
python manage.py loaddata fixtures/demo_tenants.json
```

Con Django y Vite activos, visita:

```text
http://empresa-a.localhost:5173/
http://empresa-b.localhost:5173/
http://desconocida.localhost:5173/
```

Los dos primeros hostnames muestran landings distintas. Un hostname desconocido muestra una landing demostrativa controlada y nunca selecciona el primer tenant ni expone datos de otra empresa.

### Rutas

| Ruta | Acceso | Responsabilidad |
| --- | --- | --- |
| `/` | Público | Landing del tenant resuelto por hostname o demo segura |
| `/app/` | Privado | Shell de la aplicación; exige sesión y membership activa |
| `/app/login/` | Público | Pantalla inicial de acceso |
| `/api/auth/session/` | Público | Estado de sesión y token CSRF; nunca entrega credenciales |
| `/api/auth/login/` | Público + CSRF | Crea una sesión solo si usuario, tenant y membership están activos |
| `/api/auth/logout/` | Sesión + CSRF | Invalida la sesión actual |
| `/api/public/landing/` | Público | Configuración pública y productos publicados del tenant del hostname |
| `/api/public/logo/` | Público | Logo PNG subido para el tenant del hostname |
| `/api/tenant/logo/` | OWNER + CSRF | Sube o restaura el logo de la empresa |
| `/api/catalog/categories/` | Privado | Lista/crea categorías del tenant actual |
| `/api/catalog/categories/<uuid>/` | Privado | Consulta/edita una categoría del tenant actual |
| `/api/catalog/products/` | Privado | Lista/crea productos del tenant actual |
| `/api/catalog/products/<uuid>/` | Privado | Consulta/edita/elimina y publica un producto del tenant actual |
| `/api/catalog/industry-segments/` | Privado | Entrega la taxonomía canónica de industrias usada por productos y prospectos |
| `/api/catalog/import/template/` | Privado | Descarga la plantilla Excel `.xlsx` con hoja de ayuda |
| `/api/catalog/import/preview/` | OWNER/ADMIN + CSRF | Valida un Excel `.xlsx` o CSV y genera una vista previa temporal |
| `/api/catalog/import/confirm/` | OWNER/ADMIN + CSRF | Confirma transaccionalmente una vista previa válida |
| `/api/inquiries/public/` | Público limitado | Registra una solicitud para productos publicados del tenant actual |
| `/api/inquiries/orders/public/` | Público limitado | Registra un pedido de productos publicados con precio en pesos enteros |
| `/api/inquiries/orders/` | Privado | Lista pedidos del tenant actual |
| `/api/inquiries/orders/<uuid>/` | Privado | Consulta un pedido; OWNER/ADMIN puede cambiar su estado |
| `/api/inquiries/` | Privado | Lista solicitudes pertenecientes al tenant actual |
| `/api/inquiries/<uuid>/` | Privado | Consulta una solicitud; OWNER/ADMIN puede cambiar su estado |
| `/api/inquiries/<uuid>/quote/` | Privado | Consulta la cotización; OWNER/ADMIN crea o actualiza su borrador |
| `/api/inquiries/<uuid>/quote/issue/` | OWNER/ADMIN + CSRF | Emite y bloquea una cotización vigente |
| `/api/inquiries/<uuid>/quote/follow-up/` | OWNER/ADMIN + CSRF | Registra estado, próximo contacto y notas de una cotización emitida |
| `/api/inquiries/<uuid>/quote/print/` | Privado | Documento imprimible de una cotización emitida |
| `/api/prospects/territories/` | Privado | Lista territorios y cobertura; OWNER/ADMIN puede crear |
| `/api/prospects/territories/<uuid>/` | Privado | Consulta y administra un territorio del tenant actual |
| `/api/prospects/` | Privado | Lista y filtra prospectos; OWNER/ADMIN puede crear |
| `/api/prospects/<uuid>/` | Privado | Consulta un prospecto; OWNER/ADMIN puede editar o eliminar |
| `/api/prospects/opportunities/` | Privado | Lista oportunidades priorizadas y permite filtrarlas por estado, territorio o score |
| `/api/prospects/opportunities/generate/` | OWNER/ADMIN + CSRF | Calcula o actualiza matches explicables entre prospectos y productos |
| `/api/prospects/opportunities/<uuid>/` | Privado | Consulta una oportunidad; OWNER/ADMIN registra su decisión y motivo |
| `/api/tenant/context/` | Privado | Configuración del tenant y rol del usuario actual |
| `/api/tenants/<uuid>/` | Privado | Lectura/edición aislada al tenant del hostname |
| `/api/health/` | Público | Salud de aplicación y base de datos |
| `/admin/` | Administradores | Django Admin |

### Autenticación multiempresa

La autenticación utiliza sesiones de Django y cookies del mismo origen; React no guarda tokens ni contraseñas en `localStorage`. Antes de enviar credenciales, `/app/login/` obtiene un token CSRF desde `/api/auth/session/`. El backend valida el correo y contraseña, el tenant resuelto exclusivamente desde el hostname y una `Membership` activa para ese tenant. Las respuestas de error son deliberadamente genéricas para no permitir enumeración de usuarios.

Una cuenta válida en empresa A no puede iniciar sesión desde el dominio de empresa B. Después del login, cada endpoint privado vuelve a aplicar permisos de tenant y rol: la sesión por sí sola no concede acceso. En producción, las cookies de sesión y CSRF se sirven como seguras mediante las variables ya definidas en `render.yaml`.

### Catálogo comercial

El propietario puede configurar en **Mi marca** el nombre de la empresa, los colores principal y secundario, el correo de contacto y un logo PNG, JPEG o WebP de hasta 2 MB. La API valida la imagen, la ajusta y la guarda en PostgreSQL para conservarla entre despliegues de Render. La landing y las cotizaciones imprimibles usan ese logo; cada hostname solo puede obtener el de su propia empresa. El propietario puede restaurar el logo predeterminado. La landing muestra únicamente productos publicados y disponibles, junto al formulario de contacto/cotización, y adapta el contraste de los botones a los colores elegidos.

En **Marketing**, `OWNER` y `ADMIN` pueden asignar una imagen PNG, JPEG o WebP a cada producto y decidir si aparece en la landing. La API ajusta la imagen, la guarda en PostgreSQL y entrega una versión WebP. Los productos se crean en **Catálogo**; las imágenes de productos sin publicar solo se consultan desde el área privada. La landing pública obtiene cada imagen por el dominio de su empresa. `STAFF` y `VIEWER` pueden revisar la vitrina sin modificarla.

En la landing, el cliente puede buscar productos por nombre o SKU, filtrar por categoría y agregarlos a **Mi selección**. La vista muestra 12 productos por vez y permite cargar más; el resumen mantiene los productos elegidos al cambiar filtros y permite ajustar cantidades. Desde la misma selección puede **Solicitar cotización** o **Comprar ahora**. La cotización usa `/api/inquiries/public/`; la compra registra un pedido con folio `PED-000001` y pago por coordinar. Comprar requiere que todos los productos elegidos tengan precio en pesos enteros y permite hasta 50 productos distintos. El cliente ve el total de productos antes de enviar; el costo de despacho, si corresponde, se coordina aparte. La aplicación no procesa cobros ni envía correos automáticos.

La portada de la landing usa los colores configurados por la empresa y destaca hasta tres fotos de productos publicados. Si todavía no hay fotos, muestra el logo de la empresa. El contenido y las fotos siguen administrándose desde **Mi marca**, **Catálogo** y **Marketing**.

El área privada permite crear categorías y productos, registrar SKU, formato, precio y disponibilidad. Solo `OWNER` y `ADMIN` pueden modificar el catálogo; `STAFF` y `VIEWER` conservan acceso de lectura. La API asigna siempre el tenant desde el hostname resuelto, no desde datos enviados por el navegador, y rechaza categorías pertenecientes a otra empresa. La landing expone únicamente productos publicados, disponibles y asociados a categorías activas.

La carga masiva descarga una plantilla Excel `.xlsx` con la hoja **Productos** y una guía de llenado. Las columnas son `sku,nombre,categoria,descripcion,formato,precio,disponible,publicar`; el importador también admite archivos CSV existentes. El archivo se valida en memoria y muestra acciones, advertencias y errores antes de modificar la base. Una vista previa válida queda asociada temporalmente a la sesión y al tenant; al confirmarla, Django crea o actualiza por SKU dentro de una sola transacción. Repetir una carga actualiza los productos existentes, no elimina productos ausentes y no genera duplicados.

### Solicitudes comerciales

La landing permite seleccionar productos publicados, indicar cantidades y enviar datos de contacto con consentimiento explícito. El backend acepta únicamente productos disponibles del tenant resuelto por hostname, conserva una copia del nombre y SKU solicitados, aplica un límite de solicitudes y utiliza un campo señuelo contra envíos automatizados. El área privada lista exclusivamente las solicitudes del tenant actual; `OWNER` y `ADMIN` pueden marcarlas como nuevas, contactadas o cerradas.

`OWNER` y `ADMIN` pueden abrir una solicitud desde su tarjeta y preparar una cotización, fijando precio unitario en pesos enteros, tasa de impuesto, vigencia y condiciones. El servidor calcula subtotal, impuesto redondeado al peso y total en CLP y conserva una copia de los productos y cantidades solicitados. Cada empresa recibe folios correlativos `COT-000001`, `COT-000002`, etc.; las cotizaciones anteriores reciben folio al aplicar la migración. La pantalla y el documento imprimible muestran montos chilenos sin centavos (`$24.990`). Si una cotización anterior ya tiene precios con centavos, se conservan en la base de datos y se muestran redondeados al peso. El borrador puede actualizarse; al emitirlo queda inmutable y disponible como documento imprimible o PDF mediante el navegador. `STAFF` y `VIEWER` pueden consultarlo, pero no modificarlo. La emisión no envía correos ni constituye aceptación del cliente; el equipo comercial comparte el documento por el canal acordado. La tasa de impuesto debe revisarse según los productos y el tratamiento tributario aplicable.

La sección **Seguimiento** reúne las cotizaciones emitidas y permite filtrarlas por resultado o atención pendiente. `OWNER` y `ADMIN` pueden marcar manualmente una cotización como enviada, aceptada o rechazada, programar el próximo contacto y guardar notas. La fecha de envío se registra al marcarla como enviada; «vencida» se calcula automáticamente cuando termina su vigencia sin resultado final. Marcarla como enviada no envía correos. Los roles de lectura pueden consultar el seguimiento sin cambiarlo.

La sección **Pedidos** muestra los datos del cliente, entrega, productos y total congelado al registrar la compra. `OWNER` y `ADMIN` pueden pasar un pedido de nuevo a confirmado y completado, o cancelarlo; `STAFF` y `VIEWER` solo pueden consultarlo. La empresa confirma disponibilidad, entrega y pago directamente con el cliente. Cambios posteriores en nombres o precios del catálogo no alteran el pedido guardado.

### Prospectos manuales

El área privada usa un menú lateral para separar resumen, catálogo, prospectos, territorios, oportunidades, solicitudes y seguimiento. Permite registrar organizaciones potenciales con rubro, ubicación, contacto, fuente, fecha de verificación, observaciones y estado. La API aísla los registros por tenant y admite filtros por búsqueda, estado, rubro y ciudad. Al guardar, informa coincidencias potenciales por nombre, correo, teléfono o dominio, pero nunca fusiona registros automáticamente. Los territorios agrupan localidades, definen una meta de prospectos y muestran cobertura y cantidad revisada; cada prospecto puede asignarse a una de estas zonas.

### Matching y oportunidades

Cada producto puede configurar industrias objetivo, palabras clave y prioridad comercial. Las industrias no son texto libre: productos y prospectos seleccionan códigos de una taxonomía única entregada por `/api/catalog/industry-segments/`, evitando variantes como “Restaurant”, “Restaurante” o “Restobar” en los análisis. Las palabras clave sí permanecen libres porque representan señales específicas del negocio. Un cálculo iniciado por `OWNER` o `ADMIN` compara esas reglas con los prospectos vigentes y conserva una oportunidad solo cuando existe al menos una señal real de relevancia. La puntuación versionada considera rubro, señales, territorio, contacto, calidad de datos y prioridad; su desglose y explicación quedan persistidos para revisión. La bandeja permite aceptar, postergar o descartar una recomendación, exigiendo un motivo para el descarte. No se utilizan IA, embeddings ni decisiones opacas en esta etapa.

## Pruebas y validaciones

```bash
# Backend
cd backend
pytest
python manage.py makemigrations --check --dry-run
python manage.py check

# Frontend
cd frontend
npm test
npm run build

# Imagen de producción (si Docker está disponible)
cd ..
docker build -t magavi-mvp .

# Higiene del diff
git diff --check
```

La configuración `config.settings.test` usa SQLite en memoria únicamente cuando `DATABASE_URL` no está definida, para pruebas locales rápidas. GitHub Actions proporciona `DATABASE_URL` y ejecuta la misma suite contra un servicio PostgreSQL real.

### Integración continua

`.github/workflows/ci.yml` se ejecuta en cada pull request y push hacia `main`, con tres trabajos independientes:

- **Backend:** Python 3.13, PostgreSQL 16 de servicio, instalación de dependencias, pytest, system checks y verificación de migraciones.
- **Frontend:** Node.js 22 LTS, instalación reproducible mediante `npm ci --no-audit --no-fund`, pruebas Vitest y build Vite/PWA.
- **Docker:** construcción local de la imagen sin autenticarse ni publicarla en ningún registro.

El `package-lock.json` completo se versiona junto con `package.json`; desarrollo, CI y Docker utilizan ese mismo árbol mediante `npm ci`.

## Cómo se sirve React desde Django

1. Vite genera `frontend/dist`.
2. El primer stage del `Dockerfile` compila la PWA.
3. El stage Python copia el resultado a `backend/frontend_dist`.
4. `collectstatic` incorpora los assets versionados.
5. Django reserva `/api/`, `/admin/` y `/static/`; las demás rutas entregan `index.html`.
6. WhiteNoise sirve los archivos estáticos comprimidos y con nombres versionados.

## Despliegue en Render

Los pull requests no despliegan producción. Después de incorporar un cambio a la
rama conectada, Render inicia automáticamente un despliegue del nuevo commit:

1. Conectar el repositorio GitHub a Render y crear un Blueprint desde `render.yaml`.
2. Confirmar que solo se creen `magavi-web` y `magavi-db`.
3. Configurar `CSRF_TRUSTED_ORIGINS` con el URL HTTPS definitivo del servicio.
4. Verificar que `DJANGO_SECRET_KEY` sea generado por Render y que `DATABASE_URL` provenga de `magavi-db`.
5. Comprobar `/api/health/`, `/`, `/admin/` y los logs de migración después del despliegue.

Si la aplicación publicada no coincide con `main`, revisar en **Events** que el
despliegue señale al último commit. **Deploy latest commit** compila los cambios
nuevos; **Redeploy latest deployment** vuelve a publicar la imagen anterior. Una
recarga forzada del navegador solo ayuda después de que el despliegue nuevo haya
finalizado correctamente.

> **Advertencia:** PostgreSQL gratuito de Render expira después de 30 días. Este ambiente solo admite datos sintéticos o demostrativos. No debe alojar datos reales, personales, catálogos confidenciales ni documentos tributarios.

El filesystem del Web Service es efímero. Las imágenes del desarrollo deben estar versionadas en el repositorio; el almacenamiento persistente se decidirá antes del piloto real.

### Dominio personalizado posterior

No hay dominios reales configurados en esta etapa. Cuando se habilite un cliente:

1. agregar el hostname en **Custom Domains** del Web Service de Render;
2. copiar en el proveedor DNS exactamente el registro que Render indique (normalmente CNAME para un subdominio; para un dominio raíz se utilizará la alternativa que muestre Render);
3. esperar la verificación de Render y la emisión automática de TLS;
4. añadir el hostname a `ALLOWED_HOSTS` y su origen HTTPS completo a `CSRF_TRUSTED_ORIGINS` en Render;
5. crear `TenantDomain` con el hostname sin esquema, ruta ni puerto;
6. marcarlo `is_verified=True` solo después de que Render confirme DNS/TLS, y activarlo;
7. configurar un único dominio principal por tenant y validar `/`, `/api/public/landing/` y `/app/`.

La aplicación solo resuelve dominios activos y verificados asociados a tenants activos. Un DNS existente no concede acceso por sí mismo.

## Seguridad inicial

- Producción falla al arrancar si faltan `DJANGO_SECRET_KEY` o `DATABASE_URL`.
- `DEBUG` se controla mediante variable y permanece apagado en producción.
- hosts y orígenes CSRF se configuran externamente.
- las cookies seguras, redirección HTTPS, HSTS, `nosniff` y protección de frames se activan para producción.
- el contenedor ejecuta Django con un usuario sin privilegios.
- el health check no expone credenciales, versiones ni detalles de errores.
- los logs usan mensajes estructurados mínimos y no deben contener datos sensibles.

## Documentación de producto

- [Documento maestro](docs/DOCUMENTO_MAESTRO.md)
- [Plan incremental del MVP](docs/PLAN_IMPLEMENTACION_MVP.md)
