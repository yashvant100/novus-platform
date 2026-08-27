import getpass
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models import User,UserRole
from app.core.security import hash_password
email=input("Admin email: ").strip().lower(); password=getpass.getpass("Admin password (12+ chars): ")
if len(password)<12: raise SystemExit("Password must be at least 12 characters.")
with SessionLocal() as db:
    if db.scalar(select(User).where(User.email==email)): raise SystemExit("User already exists.")
    db.add(User(email=email,password_hash=hash_password(password),role=UserRole.ADMIN)); db.commit()
print("Admin created successfully.")
