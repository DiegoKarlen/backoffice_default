/**
 * Mantener en sync con `packages/shared` (`escapeHtml`).
 * Webpack 2026 no transpila TS de @shared aún; este módulo evita duplicar lógica en cada admin-*.js.
 */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
