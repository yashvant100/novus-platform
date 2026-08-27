from datetime import datetime, timedelta, timezone
import hashlib, secrets, jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from app.config import get_settings
ph=PasswordHasher(); settings=get_settings()
def hash_password(password): return ph.hash(password)
def verify_password(password, password_hash):
    try: return ph.verify(password_hash,password)
    except VerifyMismatchError: return False
def create_access_token(user_id, role):
    now=datetime.now(timezone.utc)
    return jwt.encode({"sub":str(user_id),"role":role,"type":"access","iat":now,"exp":now+timedelta(minutes=settings.access_token_minutes),"jti":secrets.token_hex(16)},settings.jwt_secret_key,algorithm=settings.jwt_algorithm)
def new_refresh_token():
    raw=secrets.token_urlsafe(48); return raw,hashlib.sha256(raw.encode()).hexdigest()
def hash_refresh_token(raw): return hashlib.sha256(raw.encode()).hexdigest()
