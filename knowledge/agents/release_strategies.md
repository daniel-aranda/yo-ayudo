# Estrategias De Release

## Estado Actual

El producto está en MVP local. Todavía no hay ambientes formales.

## Ambientes Sugeridos

1. Local.
2. Staging.
3. Production.

## Checklist Antes De Merge

- `npm test`
- `npm run start` levanta sin compilar.
- Migración revisada.
- Seed sigue funcionando si cambió schema base.
- README actualizado si cambia setup.
- No hay tokens en código.
- No se generó `package-lock.json`.

## Checklist Antes De Deploy

- Variables de entorno configuradas.
- Migraciones aplicadas.
- `/health` responde.
- Webhook de WhatsApp verifica con Meta.
- Simulación de mensaje funciona en staging.
- Dashboard muestra el negocio demo o el negocio real esperado.

## Migraciones

Para cambios de DB:

1. Agregar migración SQL.
2. Mantener compatibilidad con código viejo cuando sea posible.
3. Deploy migración antes de código si el cambio es expansivo.
4. Deploy código.
5. Agregar constraints o limpieza en migración posterior si hace falta.

## Versionado De Producto

La documentación de roadmap vive en:

```text
knowledge/versions
```

Cada versión puede tener fases:

- `specs_phase_1.md`
- `specs_phase_2.md`
- `specs_phase_3.md`

## Rollback

Mientras no haya producción real:

- Revertir código.
- Restaurar DB local si aplica.

En producción futura:

- Evitar migraciones destructivas.
- Tener backup antes de cambios de schema.
- Documentar pasos de rollback por release.
