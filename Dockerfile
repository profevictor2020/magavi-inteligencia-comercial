# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
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
RUN pip install --no-cache-dir --requirement /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-builder /build/frontend/dist/ /app/backend/frontend_dist/
COPY scripts/start.sh /app/scripts/start.sh

RUN DJANGO_SETTINGS_MODULE=config.settings.development \
    python /app/backend/manage.py collectstatic --noinput \
    && chmod +x /app/scripts/start.sh \
    && chown -R magavi:magavi /app

USER magavi
EXPOSE 8000

CMD ["/app/scripts/start.sh"]
