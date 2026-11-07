# Reads the stub's log and decides. Usage: check.py <requests.jsonl> <port>
#
# PASS needs three things, and the third is what makes it a test:
#   1. an app request to /api/... carrying Origin capacitor://localhost AND
#      X-Client-Platform ios, the two signals the backend reads
#      (apps/backend/src/services/entitlement/clientPlatform.ts);
#   2. the control: a request from a web page in the same simulator's Safari,
#      to the same stub, arriving with Origin http://127.0.0.1:<port> and no
#      platform header;
#   3. the predicate used for (1) rejects the control request, so the check
#      can tell the app from a web page.
import json
import sys

log_path, port = sys.argv[1], sys.argv[2]
lines = [json.loads(line) for line in open(log_path) if line.strip()]
print(f"requests logged: {len(lines)}")
for r in lines:
    print(f"  {r['t']} {r['method']:7} {r['path']:32} origin={r['origin']} "
          f"x-client-platform={r['x_client_platform']} acrh={r['acr_headers']} auth={r['has_authorization']}")


def is_ios_app_api_request(r):
    return (r["method"] != "OPTIONS" and r["path"].startswith("/api/")
            and r["origin"] == "capacitor://localhost"
            and (r["x_client_platform"] or "").lower() == "ios")


app = [r for r in lines if is_ios_app_api_request(r)]
control = [r for r in lines if r["path"] == "/api/control-probe" and r["method"] == "GET"]
preflight = [r for r in lines if r["method"] == "OPTIONS" and r["origin"] == "capacitor://localhost"
             and "x-client-platform" in (r["acr_headers"] or "").lower()]

fails = []
if not app:
    fails.append("no app request to /api/ carried both Origin capacitor://localhost and X-Client-Platform ios")
if not preflight:
    fails.append("no preflight from capacitor://localhost asked for x-client-platform")
if not control:
    fails.append("HARNESS: the Safari control request never arrived, so the check cannot show it discriminates")
else:
    c = control[0]
    want = f"http://127.0.0.1:{port}"
    if c["origin"] != want:
        fails.append(f"control: expected Origin {want} from the Safari page, got {c['origin']}")
    if c["x_client_platform"]:
        fails.append(f"control: a web page sent X-Client-Platform {c['x_client_platform']}")
    if is_ios_app_api_request(c):
        fails.append("control: the predicate accepted a request from a web page, so it proves nothing")

print(f"app requests matching: {len(app)} | preflights asking for x-client-platform: {len(preflight)} "
      f"| control requests: {len(control)}")
for f in fails:
    print("FAIL:", f)
if fails:
    sys.exit(1)
print("ORIGIN CHECK PASSED: the iOS app's own API requests carry Origin capacitor://localhost and "
      "X-Client-Platform ios; a web page in the same simulator reaches the same stub with Origin "
      f"http://127.0.0.1:{port} and no platform header, and the check rejects it")
