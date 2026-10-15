import hashlib
import hmac
import secrets

ROUNDS = 600_000

def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Contrasena vacia")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ROUNDS)
    return f"pbkdf2_sha256${ROUNDS}${salt.hex()}${digest.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256" or int(rounds) != ROUNDS:
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        if len(salt) != 16 or len(expected) != 32:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ROUNDS)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, AttributeError):
        return False
