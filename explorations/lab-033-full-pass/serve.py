#!/usr/bin/env python3
"""lab 033 no-cache server — python3 serve.py [port]"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4033


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'lab 033 → http://localhost:{PORT}/index.html')
        httpd.serve_forever()
