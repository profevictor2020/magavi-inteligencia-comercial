import importlib.util
import io
from pathlib import Path
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "trigger_discovery.py"
spec = importlib.util.spec_from_file_location("trigger_discovery", SCRIPT)
trigger_discovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trigger_discovery)


def test_cron_uses_existing_endpoint_without_logging_token(monkeypatch, capsys):
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-secret")
    monkeypatch.setenv("MAGAVI_BASE_URL", "https://magavi-web-vaaa.onrender.com")
    calls = []

    class Response:
        def __enter__(self):
            return io.BytesIO(b'{"status":"PENDING","created":0,"tenant":"private-id"}')

        def __exit__(self, *_):
            pass

    monkeypatch.setattr(trigger_discovery, "urlopen", lambda request, timeout: (calls.append((request, timeout)) or Response()))
    assert trigger_discovery.main() == 0
    request, timeout = calls[0]
    assert request.full_url == "https://magavi-web-vaaa.onrender.com/api/prospects/discovery/run/"
    assert request.get_header("Authorization") == "Bearer test-secret"
    assert timeout == 115
    output = capsys.readouterr()
    assert '"status": "PENDING"' in output.out
    assert "test-secret" not in output.out + output.err
    assert "private-id" not in output.out + output.err


def test_cron_rejects_missing_token_and_reports_http_error_safely(monkeypatch, capsys):
    monkeypatch.delenv("AUTOMATION_TOKEN", raising=False)
    assert trigger_discovery.main() == 1
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-secret")
    monkeypatch.setattr(trigger_discovery, "urlopen", lambda request, timeout: (_ for _ in ()).throw(
        HTTPError(request.full_url, 502, "upstream error", {}, None)))
    assert trigger_discovery.main() == 1
    assert "HTTP 502" in capsys.readouterr().err
