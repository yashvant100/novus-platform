import base64
from cryptography.fernet import Fernet
from app.config import get_settings
def _fernet():
    raw=bytes.fromhex(get_settings().secret_encryption_key)
    return Fernet(base64.urlsafe_b64encode(raw))
def encrypt_secret(value): return _fernet().encrypt(value.encode()).decode()
def decrypt_secret(value): return _fernet().decrypt(value.encode()).decode()
