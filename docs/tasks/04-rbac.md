# Milestone 4 – RBAC

## Goal
Dynamic permission-based authorization.

---

## Tasks

### DB
[✅] Role model
[✅] Permission model
[✅] RolePermission mapping
[✅] Seed admin role

---

### Middleware
[✅] requirePermission()
[✅] 403 when lacking permission

---

## Test Cases

[✅] Admin can access protected route
[✅] User without permission gets 403
[✅] Hardcoded role check not used