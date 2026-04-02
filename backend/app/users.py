"""Simple user accounts with JSON persistence — no auth, just name selection."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .config import settings

log = logging.getLogger(__name__)

_DATA_FILE = settings.data_dir / "users.json"

# Default users
DEFAULT_USERS = {
    "matt": {
        "id": "matt",
        "name": "Matt",
        "avatar": "M",
        "color": "#5ea4f7",
    },
    "zuki": {
        "id": "zuki",
        "name": "Zuki",
        "avatar": "Z",
        "color": "#f0a8d0",
    },
}

_users: dict = {}


def _save() -> None:
    _DATA_FILE.write_text(json.dumps(_users, indent=2))


def _load() -> None:
    global _users
    if _DATA_FILE.exists():
        try:
            _users = json.loads(_DATA_FILE.read_text())
            log.info("Loaded %d users from disk", len(_users))
        except Exception as e:
            log.warning("Failed to load users: %s", e)
            _users = dict(DEFAULT_USERS)
            _save()
    else:
        _users = dict(DEFAULT_USERS)
        _save()


_load()


def get_users() -> list[dict]:
    return list(_users.values())


def get_user(user_id: str) -> dict | None:
    return _users.get(user_id)
