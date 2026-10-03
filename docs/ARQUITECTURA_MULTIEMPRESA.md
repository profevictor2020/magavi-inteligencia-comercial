# Arquitectura multiempresa y dominios

## Alcance

Este incremento introduce aislamiento lógico por tenant dentro del monolito Django. No crea bases separadas, subesquemas, servicios ni automatizaciones en segundo plano.

## Modelo

- `Tenant`: identidad y configuración pública de una empresa.
- `Membership`: unión única usuario–tenant con rol `OWNER`, `ADMIN`, `STAFF` o `VIEWER`.
- `TenantDomain`: hostname único, estado principal, verificación y activación.

Los UUID de tenant no se consideran un control de autorización. El tenant efectivo siempre se obtiene del hostname validado y luego se exige una membership activa para APIs privadas.

## Resolución de una solicitud

1. Django valida el encabezado `Host` contra `ALLOWED_HOSTS`.
2. `TenantResolutionMiddleware` normaliza hostname, mayúsculas, punto final y puerto.
3. Se busca una coincidencia case-insensitive en `TenantDomain`.
4. Solo se acepta si dominio, tenant y flags de verificación/actividad son válidos.
5. Se asignan `request.tenant` y `request.tenant_domain`.
6. Sin coincidencia dentro de un hostname permitido, ambos quedan en `None`; la API pública devuelve la demo fija y las APIs privadas deniegan acceso. Un hostname fuera de `ALLOWED_HOSTS` se rechaza antes de resolver tenants.

Nunca se selecciona un tenant por orden de creación, parámetro del navegador ni fallback implícito.

## Superficies públicas y privadas

`GET /api/public/landing/` usa una lista blanca de campos: nombre, descripción, titular, imagen demo local, tema, contacto público y destacados. No devuelve UUID, slug, membresías, dominios, flags internos ni usuarios.

Las APIs privadas combinan:

- sesión autenticada;
- tenant resuelto por hostname;
- membership activa para ese mismo tenant;
- comprobación de objeto;
- rol suficiente para escrituras.

`VIEWER` y `STAFF` son de solo lectura en este incremento. `OWNER` y `ADMIN` pueden editar los campos públicos autorizados. Los cambios de usuarios, dominios o roles siguen restringidos a Django Admin hasta un incremento posterior.

## Landings y rutas

- `/`: landing pública multiempresa.
- `/app/`: shell privado que consulta el contexto seguro.
- `/app/login/`: interfaz de acceso; la autenticación interactiva se implementará después.
- `/api/`: contratos DRF.
- `/admin/`: administración Django.

Django entrega `index.html` en rutas de navegador desconocidas para permitir recargas; React decide qué superficie renderizar según el path.

## Datos e imágenes

`fixtures/demo_tenants.json` contiene dos empresas completamente sintéticas y sus hostnames `.localhost`. Los SVG en `frontend/public/demo/` viven en el repositorio. El modelo valida que las imágenes usen rutas locales `/static/demo/`; no acepta URLs externas.

## Alta futura de un dominio real

1. Registrar el dominio en el Web Service de Render y obtener su instrucción DNS vigente.
2. Crear el registro indicado en el proveedor DNS.
3. Esperar que Render confirme el dominio y TLS.
4. Incorporar el hostname a `ALLOWED_HOSTS` y el origen HTTPS a `CSRF_TRUSTED_ORIGINS`.
5. Crear el `TenantDomain` en Django Admin, inicialmente inactivo/no verificado.
6. Tras validar DNS y propiedad, marcar verificado y activo.
7. Probar aislamiento, landing, API pública, área privada, HTTPS y redirects.

No se deben codificar valores de registros DNS en el repositorio: Render puede presentar instrucciones distintas según apex/subdominio y configuración vigente.
