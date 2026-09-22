def add_whitenoise_headers(headers, path, url) -> None:
    """Allow the generated service worker to control the application root."""

    if url.endswith("/sw.js"):
        headers["Service-Worker-Allowed"] = "/"
        headers["Cache-Control"] = "no-cache"
