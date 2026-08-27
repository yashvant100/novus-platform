# Novus URL Monitor V2 Scope

- ADMIN / URL_MANAGER / VIEWER
- JWT access + rotating refresh tokens
- Argon2id password hashing
- PostgreSQL-ready schema
- URL monitoring
- 100 latest checks per URL
- Incidents
- Admin-only email provider management
- Encrypted email secrets
- Multiple recipients model
- Audit log model
- SMTP adapter foundation

Before public production release: complete provider-specific OAuth/API adapters, email queue/retries, rate limiting, password reset, email verification, complete audit events, production secret manager/KMS, CSRF strategy for browser auth, migrations, backups, monitoring, dependency scanning, load testing and deployment/rollback procedures.
