from django.conf import settings


def test_whitenoise_headers_configuration_is_callable():
    assert callable(settings.WHITENOISE_ADD_HEADERS_FUNCTION)
