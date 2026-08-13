// Escape de HTML minimo (sem lib externa) -- usado nas paginas
// administrativas que interpolam valor vindo de fora (query string, campo
// do Google) dentro de HTML cru.
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
