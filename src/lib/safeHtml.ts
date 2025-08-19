// src/lib/safeHtml.ts
// Escape ทุกอย่าง แล้วค่อยอนุญาตเฉพาะ <mark> ให้กลับเป็นแท็กจริง
// --- Safe HTML helpers: escape everything and allow only <mark> tags ---
const escapeHtml = (input: string) => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const allowMarkOnly = (input?: string | null) => {
  if (!input) return '';
  const escaped = escapeHtml(String(input));
  return escaped
    .replace(/&lt;mark&gt;/gi, '<mark>')
    .replace(/&lt;\/mark&gt;/gi, '</mark>');
};
