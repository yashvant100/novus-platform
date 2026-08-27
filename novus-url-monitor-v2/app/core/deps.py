from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import jwt
from app.config import get_settings
from app.db.session import get_db
from app.models import User, UserRole
bearer=HTTPBearer(auto_error=False)
def get_current_user(credentials: HTTPAuthorizationCredentials=Depends(bearer), db: Session=Depends(get_db)):
    if not credentials: raise HTTPException(401,"Authentication required")
    try:
        p=jwt.decode(credentials.credentials,get_settings().jwt_secret_key,algorithms=[get_settings().jwt_algorithm])
        if p.get("type")!="access": raise ValueError()
        user=db.get(User,int(p["sub"]))
    except Exception: raise HTTPException(401,"Invalid or expired token")
    if not user or not user.is_active: raise HTTPException(401,"User inactive or not found")
    return user
def require_roles(*roles):
    def dep(user=Depends(get_current_user)):
        if user.role not in roles: raise HTTPException(403,"Insufficient permissions")
        return user
    return dep
