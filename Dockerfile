# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --no-audit --no-fund --strict-ssl=true; \
    else npm ci --no-audit --no-fund --strict-ssl=true; fi
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=8000

WORKDIR /app

RUN addgroup --system magavi && adduser --system --ingroup magavi magavi

COPY backend/requirements.txt /app/backend/requirements.txt
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      PIP_CERT=/run/secrets/proxy_ca pip install --no-cache-dir --requirement /app/backend/requirements.txt; \
    else pip install --no-cache-dir --requirement /app/backend/requirements.txt; fi

COPY backend/ /app/backend/
COPY --from=frontend-builder /build/frontend/dist/ /app/backend/frontend_dist/
COPY scripts/start.sh /app/scripts/start.sh
COPY scripts/trigger_discovery.py /app/scripts/trigger_discovery.py

RUN DJANGO_SETTINGS_MODULE=config.settings.development \
    python /app/backend/manage.py collectstatic --noinput \
    && chmod +x /app/scripts/start.sh \
    && chown -R magavi:magavi /app

# Fail the image build if production middleware (including WhiteNoise) cannot boot.
RUN DJANGO_SETTINGS_MODULE=config.settings.production \
    DJANGO_SECRET_KEY=build-only-secret-key-not-for-production \
    DATABASE_URL=postgresql://magavi:magavi@localhost:5432/magavi \
    python -c "import sys; sys.path.insert(0, '/app/backend'); import config.wsgi"

USER magavi
EXPOSE 8000

CMD ["/app/scripts/start.sh"]
