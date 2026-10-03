#!/usr/bin/env sh
set -eu

python backend/manage.py migrate --noinput

exec gunicorn \
  --chdir backend \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile - \
  config.wsgi:application
