"""Invoke one due discovery run from a Render Cron Job."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    token = os.getenv("AUTOMATION_TOKEN", "")
    base_url = os.getenv("MAGAVI_BASE_URL", "https://magavi-web-vaaa.onrender.com").rstrip("/")
    parsed = urlsplit(base_url)
    if not token or parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query:
        print("El cron requiere AUTOMATION_TOKEN y MAGAVI_BASE_URL con una URL HTTPS válida.", file=sys.stderr)
        return 1
    request = Request(
        f"{base_url}/api/prospects/discovery/run/",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=115) as response:
            result = json.load(response)
    except HTTPError as error:
        print(f"La búsqueda automática respondió HTTP {error.code}.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, ValueError) as error:
        print(f"No se pudo consultar la búsqueda automática ({type(error).__name__}).", file=sys.stderr)
        return 1
    if not isinstance(result, dict):
        print("La búsqueda automática devolvió una respuesta inválida.", file=sys.stderr)
        return 1
    print(json.dumps({key: result[key] for key in ("status", "created", "profiles_found") if key in result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
