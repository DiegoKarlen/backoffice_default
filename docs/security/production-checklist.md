# Checklist — producción (seguridad)

Usar antes de exponer el sistema públicamente.

## Secrets y configuración

- [ ] `JWT_SECRET` — mínimo 32 caracteres aleatorios; **no** valor de dev (fail-fast en prod — Fase 4)
- [ ] `NODE_ENV=production`
- [ ] `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — credenciales fuertes únicas (no `ChangeMe123!`)
- [ ] No ejecutar `npm run db:seed` con defaults en prod sin rotar password
- [x] `WEBHOOK_STUB_ENABLED=0` (Fase 2) — fail-fast si =1 en prod
- [x] `PAYMENTS_WEBHOOK_STUB_SECRET` / `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` (Fase 2)
- [ ] `MAX_MANUAL_CREDIT_CENTS` — límite por crédito manual BO (default 10_000_000 centavos)

## RBAC

- [ ] Usuarios operativos con roles **sin** permisos de más
- [ ] Solo admins con `bo.users.manage`, `bo.players.manage`, `bo.bingo.manage` según necesidad
- [ ] Verificar 403 en API con usuario de prueba limitado (Fase 1)

## Red

- [ ] `CORS_ORIGINS` — solo dominios reales del BO, portal y display
- [ ] HTTPS en todos los frontends y API
- [ ] Webhooks: IP allowlist del provider si aplica (Fase 2)

## Post-deploy (smoke)

```bash
# Sin token → 401
curl -s -o /dev/null -w "%{http_code}" https://<api>/backoffice/players

# Token BO sin permiso → 403 (cuando exista user de prueba)
# Webhook stub sin secret → 401 (Fase 2)
```

## Rotación de secrets (Fase 4)

1. Generar nuevo `JWT_SECRET` (≥32 chars aleatorios); actualizar env en todos los nodos.
2. Reiniciar API — **todos los JWT emitidos antes quedan inválidos** (usuarios deben re-login).
3. Rotar `PAYMENTS_WEBHOOK_*_SECRET` coordinando con el PSP; probar webhook en staging antes de prod.
4. No commitear `.env`; usar vault o variables del orchestrator.

## Pendiente (ver action-plan.md)

- Fase 5: Integridad sorteo (mutex, auditoría)
