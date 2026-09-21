# MAGAVI — Inteligencia Comercial Territorial

Base técnica ejecutable del MVP MAGAVI. Esta entrega incorpora una PWA React, una API Django REST Framework, PostgreSQL, resolución multiempresa por hostname, landing pública por empresa, un área privada protegida, Django Admin y health check. **No incluye todavía importación de catálogo, matching, cotizaciones, CRM, ventas ni inteligencia artificial.**

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
- `backend/apps/health/`: comprobación pública y mínima de aplicación/base de datos.
- `backend/apps/tenancy/`: tenants, membresías, dominios, resolución segura, permisos y API pública/privada.
- `Dockerfile`: build multi-stage; compila React y crea una imagen Python no privilegiada.
- `render.yaml`: un Web Service gratuito y una PostgreSQL gratuita.
- `scripts/start.sh`: aplica migraciones y ejecuta Gunicorn.
- `docs/`: línea base funcional y plan incremental.

No se usan Next.js, FastAPI, Redis, Celery, workers, scheduler, PostGIS, pgvector ni servicios externos de IA.

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
npm install --no-audit --no-fund
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
| `/api/public/landing/` | Público | Configuración pública del tenant del hostname |
| `/api/tenant/context/` | Privado | Configuración del tenant y rol del usuario actual |
| `/api/tenants/<uuid>/` | Privado | Lectura/edición aislada al tenant del hostname |
| `/api/health/` | Público | Salud de aplicación y base de datos |
| `/admin/` | Administradores | Django Admin |

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
- **Frontend:** Node.js 22 LTS, instalación temporal mediante `npm install --no-audit --no-fund`, pruebas Vitest y build Vite/PWA.
- **Docker:** construcción local de la imagen sin autenticarse ni publicarla en ningún registro.

El `package-lock.json` anterior fue eliminado porque Codex no pudo acceder al registro npm y el archivo quedó incompleto, sin el árbol de dependencias necesario para `npm ci`. Las dependencias directas continúan fijadas con versiones exactas en `frontend/package.json`. Mientras no exista un lockfile real, CI y Docker usan temporalmente `npm install --no-audit --no-fund`.

Antes del piloto se debe ejecutar `npm install` en un entorno con acceso a npm, versionar el `package-lock.json` completo que genere npm, revisar su diff y volver a utilizar `npm ci` en desarrollo, CI y Docker. No se deben inventar ni editar manualmente hashes o metadatos del lockfile.

## Cómo se sirve React desde Django

1. Vite genera `frontend/dist`.
2. El primer stage del `Dockerfile` compila la PWA.
3. El stage Python copia el resultado a `backend/frontend_dist`.
4. `collectstatic` incorpora los assets versionados.
5. Django reserva `/api/`, `/admin/` y `/static/`; las demás rutas entregan `index.html`.
6. WhiteNoise sirve los archivos estáticos comprimidos y con nombres versionados.

## Despliegue en Render

No desplegar automáticamente durante revisión. Cuando se autorice:

1. Conectar el repositorio GitHub a Render y crear un Blueprint desde `render.yaml`.
2. Confirmar que solo se creen `magavi-web` y `magavi-db`.
3. Configurar `CSRF_TRUSTED_ORIGINS` con el URL HTTPS definitivo del servicio.
4. Verificar que `DJANGO_SECRET_KEY` sea generado por Render y que `DATABASE_URL` provenga de `magavi-db`.
5. Desplegar manualmente y comprobar `/api/health/`, `/`, `/admin/` y los logs de migración.

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
