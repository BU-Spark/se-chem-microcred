const ALLOWED_QUESTION_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'code']);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeQuestionRichText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  if (!/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return `<p>${escapeHtml(trimmed).replace(/\r?\n/g, '<br>')}</p>`;
  }

  return trimmed
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_QUESTION_TAGS.has(name)) return '';
      if (tag.startsWith('</')) return name === 'br' ? '' : `</${name}>`;
      return name === 'br' ? '<br>' : `<${name}>`;
    });
}

export function hasVisibleQuestionText(value?: string | null) {
  return (
    sanitizeQuestionRichText(value)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim().length > 0
  );
}
