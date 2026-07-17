#!/usr/bin/env python3
"""gallery-lab-001 dev server: no-store cache headers so round bumps always
load fresh lane modules (python http.server heuristically caches otherwise).
Usage: python3 serve.py [port]  (default 4173), then open /index.html."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler)
    print(f"gallery-lab-001 → http://127.0.0.1:{PORT}/index.html")
    server.serve_forever()
