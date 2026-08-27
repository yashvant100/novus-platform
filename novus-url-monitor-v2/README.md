# Novus URL Monitor V2

Local-only V2 development foundation for Novus URL Monitor.

## Included
- PostgreSQL-ready SQLAlchemy models
- JWT access authentication + rotating refresh tokens
- ADMIN / URL_MANAGER / VIEWER RBAC
- URL monitor CRUD/read APIs
- Per-URL rolling history limited to 100 records
- Incident model
- Admin-only email provider management
- Encrypted email secrets
- Multiple alert recipients
- Audit log model
- SMTP sending adapter foundation
- Local health endpoint

## Quick start
```bash
cp .env.example .env
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/create_admin.py
uvicorn app.main:app --reload --host 127.0.0.1 --port 8090
```
Open http://127.0.0.1:8090/docs

## Important
This is a V2 development foundation. Provider-specific OAuth/API integrations, production secret-manager integration, queue/retry infrastructure, rate limiting, password reset, email verification, full audit events, and production hardening must be completed and tested before public release.
