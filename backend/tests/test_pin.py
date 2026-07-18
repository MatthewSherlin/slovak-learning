"""Tests for user PIN hashing — salted PBKDF2 with legacy SHA-256 migration."""

from __future__ import annotations

import hashlib

import pytest

from app.database import (
    remove_user_pin,
    set_user_pin,
    user_has_pin,
    verify_user_pin,
)


pytestmark = pytest.mark.asyncio


async def _stored_hash(db, user_id: str) -> str | None:
    cursor = await db.execute("SELECT pin_hash FROM users WHERE id = ?", (user_id,))
    row = await cursor.fetchone()
    return row["pin_hash"] if row else None


class TestPinHashing:
    async def test_set_and_verify(self, db):
        assert await set_user_pin(db, "sam", "1234")
        assert await verify_user_pin(db, "sam", "1234")
        assert not await verify_user_pin(db, "sam", "4321")

    async def test_hash_is_salted_pbkdf2(self, db):
        """Stored hash must be salt$hash, not a bare SHA-256 digest."""
        await set_user_pin(db, "sam", "1234")
        stored = await _stored_hash(db, "sam")
        assert "$" in stored, "hash must embed a salt"
        assert stored != hashlib.sha256(b"1234").hexdigest()

    async def test_same_pin_different_users_different_hashes(self, db):
        """Per-user salts: identical PINs must not produce identical hashes."""
        await set_user_pin(db, "sam", "1234")
        await set_user_pin(db, "eva", "1234")
        assert await _stored_hash(db, "sam") != await _stored_hash(db, "eva")

    async def test_verify_wrong_user_or_no_pin(self, db):
        await db.execute("UPDATE users SET pin_hash = NULL WHERE id = 'jan'")
        await db.commit()
        assert not await verify_user_pin(db, "jan", "1234")
        assert not await verify_user_pin(db, "nonexistent_user", "1234")

    async def test_remove_pin(self, db):
        await set_user_pin(db, "sam", "1234")
        assert await remove_user_pin(db, "sam")
        assert not await user_has_pin(db, "sam")
        assert not await verify_user_pin(db, "sam", "1234")


class TestLegacyPinMigration:
    async def test_legacy_sha256_hash_still_verifies(self, db):
        """PINs stored as bare SHA-256 by the old code must keep working."""
        legacy = hashlib.sha256(b"5678").hexdigest()
        await db.execute("UPDATE users SET pin_hash = ? WHERE id = 'eva'", (legacy,))
        await db.commit()
        assert await verify_user_pin(db, "eva", "5678")
        assert not await verify_user_pin(db, "eva", "0000")

    async def test_legacy_hash_upgraded_on_successful_verify(self, db):
        """A successful verify against a legacy hash rewrites it as salted PBKDF2."""
        legacy = hashlib.sha256(b"5678").hexdigest()
        await db.execute("UPDATE users SET pin_hash = ? WHERE id = 'eva'", (legacy,))
        await db.commit()

        assert await verify_user_pin(db, "eva", "5678")

        stored = await _stored_hash(db, "eva")
        assert stored != legacy, "legacy hash should have been upgraded"
        assert "$" in stored
        # And the upgraded hash still verifies
        assert await verify_user_pin(db, "eva", "5678")

    async def test_failed_verify_does_not_touch_legacy_hash(self, db):
        legacy = hashlib.sha256(b"5678").hexdigest()
        await db.execute("UPDATE users SET pin_hash = ? WHERE id = 'eva'", (legacy,))
        await db.commit()

        assert not await verify_user_pin(db, "eva", "1111")
        assert await _stored_hash(db, "eva") == legacy
