from django.conf import settings

from config.headers import add_whitenoise_headers


def test_whitenoise_headers_configuration_is_callable():
    assert callable(settings.WHITENOISE_ADD_HEADERS_FUNCTION)
    assert settings.WHITENOISE_ADD_HEADERS_FUNCTION is add_whitenoise_headers
