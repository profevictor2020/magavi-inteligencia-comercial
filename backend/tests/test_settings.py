from config.headers import add_whitenoise_headers


def test_whitenoise_headers_callback_configures_service_worker():
    headers = {}

    add_whitenoise_headers(headers, "/tmp/sw.js", "/static/sw.js")

    assert headers == {"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"}
