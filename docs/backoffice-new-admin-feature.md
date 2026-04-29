# Nueva pantalla de administración (backoffice 2026)

Guía de referencia para añadir una **funcionalidad de administración** (lista + crear/editar, permisos, i18n) alineada con lo ya hecho en **Usuarios**, **Roles** y **Funcionalidades**.

## 1. Archivos que suelen tocarse

| Área | Ruta (desde la raíz del repo) |
|------|------------------------------|
| Página HTML | `backoffice/src/admin-<nombre>.html` |
| Navegación y permiso de menú | `backoffice/src/assets/scripts/2026/Shell.js` (`NAV`, item con `href`, `key`, `func` opcional) |
| Lógica de la página (API, UI) | `backoffice/src/assets/scripts/2026/admin-pages.js` |
| Cadenas EN / ES | `backoffice/src/assets/scripts/2026/locales/en.js`, `es.js` |
| Migas y títulos por `data-bo-page` | `backoffice/src/assets/scripts/2026/bo-i18n.js` (`crumbsStringForPage`, claves `*.breadcrumb` si aplica) |
| Estilos responsive del shell / cards | `backoffice/src/assets/styles/2026/_responsive.scss`, `_shell.scss`, `_components.scss` |

Tras cambiar SCSS o JS, ejecutar **`npm run build`** dentro de `backoffice/` para regenerar `dist/`.

## 2. Plantilla de página HTML

- `body` con `data-active="<nav-key>"` y **`data-bo-page="<slug>"`** (el mismo slug que usarás en i18n y permisos).
- Estructura shell: `div.shell` → placeholder sidebar → `div.main` → placeholders topbar/footer → **`main.content`** con las vistas (lista, paneles crear/editar).
- Patrones ya usados:
  - Card de lista con `.card-head`: `.card-title-wrap` (`.eyebrow` + `.card-title`) y botón primario a la derecha en desktop.
  - Formularios tipo perfil: clase **`bo-form-profile`** y rejilla **`bo-form-profile__grid`** donde corresponda.
  - Tablas con contenedor `overflow:auto` si hay muchas columnas.

Copiar una página existente (`admin-users.html`, `admin-roles.html`) y renombrar ids/`data-bo-*` evita olvidar piezas.

## 3. Shell.js (menú lateral)

En el array **`NAV`**, dentro del área que corresponda (p. ej. `nav.areas.admin`):

- `key`: coincide con `data-active` del HTML.
- `textKey`: clave en `locales` (`nav.items.*`).
- `href`: `admin-<nombre>.html`.
- **`func`** (opcional): código de permiso Backoffice (p. ej. `bo.users.manage`). Si falta, el ítem puede mostrarse siempre según la lógica actual de permisos.

## 4. admin-pages.js

- Registrar **`init`** de la nueva página: comprobar **función de permiso** con la API/config existente; si no hay permiso, ocultar contenido o redirigir según el patrón de `users` / `roles`.
- Reutilizar patrones de **lista**, mensajes de error (`#bo-*-msg`), **toast**/**field-help**, y destrucción de listeners al salir si hay SPA interna.
- Si usas **pickers** (roles, funcionalidades), seguir el mismo patrón que en usuarios/roles (`mountItemPicker`, etc.).

## 5. Internacionalización (i18n)

- Añadir claves en **`en.js`** y **`es.js`** (misma estructura).
- Migas: extender **`crumbsStringForPage`** en `bo-i18n.js` si hace falta un nuevo `data-bo-page`.
- Usar **`data-i18n`** (y placeholders con `data-i18n-placeholder` si aplica) en el HTML para textos estáticos.

## 6. Comportamiento responsive (decisiones ya acordadas)

- **No hay barra intermedia** de solo iconos (72px): por **`max-width: 1100px`** el layout pasa de **menú completo** a **drawer** (sidebar fuera de pantalla + **hamburguesa** en el topbar).
- El **shell** usa una columna y el aside va **`position: fixed`**; el contenido usa todo el ancho. Detalles técnicos: `minmax(0, 1fr)` en el grid, **`min-width: 0`** en `.d-sidebar` para no hinchar la columna “0”.
- En cabeceras de card (**`.card-head`**) en viewport estrecho: el bloque pasa a columna; el **botón primario** no debe ser ancho completo: **`align-self: flex-end`**, **`width: auto`**, **`white-space: nowrap`** (ver `_responsive.scss` en el bloque `max-width: 1100px`).

## 7. Checklist rápido

- [ ] HTML + `data-bo-page` + ids coherentes
- [ ] Entrada en `Shell.js` (`NAV`) + `func` si aplica
- [ ] `init` en `admin-pages.js` + permisos + llamadas API
- [ ] Claves en `en.js` / `es.js` + migas en `bo-i18n.js` si hace falta
- [ ] Probar ancho **> 1100px** y **≤ 1100px** (drawer, tabla, botón “crear”)
- [ ] `npm run build` en `backoffice/`

## 8. Dónde está la regla del asistente

En **`.cursor/rules/backoffice-admin-feature.mdc`** hay un resumen para Cursor (activación por archivos del backoffice admin). Esta guía es la versión extendida para personas y para revisión en PR.
