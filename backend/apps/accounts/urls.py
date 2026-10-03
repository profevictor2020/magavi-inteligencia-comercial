from django.urls import path

from .views import LoginView, LogoutView, SessionView

urlpatterns = [
    path("session/", SessionView.as_view(), name="auth-session"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
