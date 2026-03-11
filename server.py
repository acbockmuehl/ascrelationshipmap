import json
import os
import sqlite3
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "relationships.db"))
PORT = int(os.environ.get("PORT", "8000"))


def ensure_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                authority TEXT NOT NULL,
                region TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()


def list_contacts() -> list[dict]:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT id, name, role, authority, region
            FROM contacts
            ORDER BY created_at DESC, rowid DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def create_contact(payload: dict) -> dict:
    contact = {
        "id": str(uuid.uuid4()),
        "name": payload["name"].strip(),
        "role": payload["role"].strip(),
        "authority": payload["authority"].strip(),
        "region": payload["region"].strip(),
    }
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO contacts (id, name, role, authority, region)
            VALUES (:id, :name, :role, :authority, :region)
            """,
            contact,
        )
        connection.commit()
    return contact


def delete_contact(contact_id: str) -> bool:
    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        connection.commit()
        return cursor.rowcount > 0


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/contacts":
            self.send_json(HTTPStatus.OK, list_contacts())
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/contacts":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        payload = self.read_json_body()
        if payload is None:
            return

        required_fields = ["name", "role", "authority", "region"]
        if any(not str(payload.get(field, "")).strip() for field in required_fields):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "All contact fields are required."})
            return

        created = create_contact(payload)
        self.send_json(HTTPStatus.CREATED, created)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/contacts/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        contact_id = parsed.path.removeprefix("/api/contacts/").strip()
        if not contact_id:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return

        deleted = delete_contact(contact_id)
        if not deleted:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Contact not found."})
            return

        self.send_json(HTTPStatus.OK, {"deleted": True})

    def read_json_body(self) -> dict | None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid Content-Length header."})
            return None

        body = self.rfile.read(content_length)
        try:
            return json.loads(body or b"{}")
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return None

    def send_json(self, status: HTTPStatus, payload: dict | list) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> None:
    ensure_database()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), AppHandler)
    print(f"Serving on http://0.0.0.0:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
