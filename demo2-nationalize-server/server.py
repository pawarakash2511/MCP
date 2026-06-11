from mcp.server.fastmcp import FastMCP
import requests
import threading
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

#  1 - Initialization
server = FastMCP("Nationalize Service")


# 2 - Tool Definition
@server.tool()
def predict_nationality(name: str) -> dict:
    """
    Predict the nationality of a person based on their name.
    """
    url = f"https://api.nationalize.io/?name={name}"

    response = requests.get(url, timeout=15)
    return response.json()


# 3 - HTTP server on port 3002 for the browser frontend
class NationalityHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access logs

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            if parsed.path == "/nationality":
                name = params.get("name", [""])[0]
                if not name:
                    self.wfile.write(json.dumps({"error": "name is required"}).encode())
                    return
                result = predict_nationality(name)
                result["server"] = "Nationalize Service (MCP · server.py)"
                self.wfile.write(json.dumps(result).encode())
            else:
                self.wfile.write(json.dumps({"error": "Not found"}).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())


def _start_http():
    HTTPServer(("", 3002), NationalityHandler).serve_forever()


if __name__ == "__main__":
    t = threading.Thread(target=_start_http, daemon=True)
    t.start()
    import sys
    print("HTTP server on :3002", file=sys.stderr)
    server.run()