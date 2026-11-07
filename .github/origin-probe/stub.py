# The stub the iOS origin check talks to (ios-audit.yml, job "origin").
# One local server stands in for both Supabase and the API, reachable as
# 127.0.0.1 and as localhost, so a page on one host can call the other
# cross-origin. Every request is logged as one JSON line carrying the two
# headers the check reads. It answers CORS for any origin, so the browser
# lets each request through to the log; it accepts nothing and stores nothing.
import http.server
import json
import sys
import time

log_path, port = sys.argv[1], int(sys.argv[2])

USER = {
    "id": "00000000-0000-4000-8000-000000000001",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "origin-check@example.invalid",
    "app_metadata": {"provider": "email", "providers": ["email"]},
    "user_metadata": {},
    "created_at": "2026-01-01T00:00:00Z",
}

STATS = {
    "plan": "FREE", "pendingCount": 0, "totalCount": 0, "averageConfidence": 0,
    "statusBreakdown": {}, "monthlySeries": [], "periods": {},
}

LEDGER = {
    "month": "2026-11", "timeZone": "UTC", "currencies": [],
    "excluded": {"status": 0, "duplicate": 0, "noAmount": 0},
}

# The control: a web page in the simulator's Safari, served from 127.0.0.1,
# calling the stub on localhost. WebKit sends Origin http://127.0.0.1:<port>
# and no platform header.
CONTROL_PAGE = (
    "<!doctype html><meta charset=\"utf-8\"><title>origin check control</title>"
    "<body>A request from a web page, not the app."
    "<script>fetch('http://localhost:%d/api/control-probe')"
    ".then(function (r) { document.body.append(' sent ' + r.status); });</script>" % port
).encode()


class Handler(http.server.BaseHTTPRequestHandler):
    def _log(self, status):
        line = {
            "t": time.strftime("%H:%M:%S", time.gmtime()),
            "method": self.command,
            "path": self.path.split("?")[0],
            "host": self.headers.get("Host"),
            "origin": self.headers.get("Origin"),
            "x_client_platform": self.headers.get("X-Client-Platform"),
            "acr_headers": self.headers.get("Access-Control-Request-Headers"),
            "has_authorization": bool(self.headers.get("Authorization")),
            "status": status,
        }
        with open(log_path, "a") as out:
            out.write(json.dumps(line) + "\n")

    def _send(self, status, body, ctype="application/json"):
        self._log(status)
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers") or "*")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/control.html":
            return self._send(200, CONTROL_PAGE, "text/html; charset=utf-8")
        if path.endswith("/auth/v1/user"):
            return self._send(200, json.dumps(USER).encode())
        if path.endswith("/documents/stats"):
            return self._send(200, json.dumps(STATS).encode())
        if path.startswith("/api/ledger"):
            return self._send(200, json.dumps(LEDGER).encode())
        if path.startswith("/api/documents"):
            return self._send(200, b"[]")
        return self._send(200, b"{}")

    def do_POST(self):
        self._send(200, b"{}")

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


Server(("0.0.0.0", port), Handler).serve_forever()
