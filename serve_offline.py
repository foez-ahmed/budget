#!/usr/bin/env python

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class BudgetHandler(SimpleHTTPRequestHandler):
    url_prefix = "/budget"

    def translate_path(self, path: str) -> str:
        parsed_path = urlsplit(path).path
        if parsed_path == self.url_prefix:
            parsed_path = f"{self.url_prefix}/"
        if parsed_path.startswith(f"{self.url_prefix}/"):
            parsed_path = parsed_path[len(self.url_prefix):]
        return super().translate_path(parsed_path)

    def do_GET(self) -> None:
        request_path = urlsplit(self.path).path
        if request_path == "/":
            self.send_response(302)
            self.send_header("Location", f"{self.url_prefix}/")
            self.end_headers()
            return

        if request_path == self.url_prefix:
            self.send_response(301)
            self.send_header("Location", f"{self.url_prefix}/")
            self.end_headers()
            return

        if request_path.startswith(f"{self.url_prefix}/"):
            requested_file = Path(self.translate_path(self.path))
            if not requested_file.is_file() and "." not in requested_file.name:
                self.path = f"{self.url_prefix}/"

        super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the built budget app locally.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    dist_directory = Path(__file__).parent / "dist"
    if not (dist_directory / "index.html").is_file():
        raise SystemExit("dist/index.html is missing. Run `npm run build` first.")

    handler = partial(BudgetHandler, directory=str(dist_directory))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving the budget app at http://127.0.0.1:{args.port}/budget/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()