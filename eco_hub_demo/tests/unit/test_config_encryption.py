from __future__ import annotations

from services import config_encryption
from services.config_encryption import ConfigEncryption


def test_encrypt_decrypt_roundtrip(tmp_path):
    key_file = tmp_path / "config.key"
    enc = ConfigEncryption(str(key_file))
    token = enc.encrypt("secret-value")
    assert token
    assert enc.decrypt(token) == "secret-value"
    assert key_file.exists()


def test_encrypt_and_decrypt_empty_values(tmp_path):
    enc = ConfigEncryption(str(tmp_path / "config.key"))
    assert enc.encrypt("") == ""
    assert enc.decrypt("") == ""


def test_decrypt_invalid_token_returns_empty(tmp_path):
    enc = ConfigEncryption(str(tmp_path / "config.key"))
    assert enc.decrypt("not-valid-base64") == ""


def test_get_encryptor_returns_singleton(tmp_path):
    config_encryption._encryptor = None
    key_file = str(tmp_path / "a.key")
    e1 = config_encryption.get_encryptor(key_file)
    e2 = config_encryption.get_encryptor("another.key")
    assert e1 is e2
