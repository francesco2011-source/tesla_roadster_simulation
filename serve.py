#!/usr/bin/env python3
"""Tiny static server: python3 serve.py [port]  ->  http://localhost:8000"""
import http.server, socketserver, sys, webbrowser, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.glb': 'model/gltf-binary'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
for p in range(port, port + 20):
    try:
        s = socketserver.ThreadingTCPServer(('127.0.0.1', p), H); break
    except OSError:
        continue
else:
    sys.exit('No free port')
print(f'Roadster 3D on http://localhost:{p}  (Ctrl+C to stop)')
webbrowser.open(f'http://localhost:{p}')
try:
    s.serve_forever()
except KeyboardInterrupt:
    pass
