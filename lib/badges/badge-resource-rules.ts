// Prisma Accelerate (prod) caps responses at ~5 MB and Bytes travel base64-encoded
// (~1.33x), so 3 MB is the largest PDF that round-trips safely.
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_FAMILY_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_RESOURCES_PER_BADGE = 15;
export const MAX_RESOURCE_TITLE_LENGTH = 200;
export const MAX_LINK_LENGTH = 2048;
const MAX_FILE_NAME_LENGTH = 120;

export class BadgeResourceValidationError extends Error {}

export function normalizeResourceTitle(raw: unknown, fallback: string): string {
  const title = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const resolved = title || fallback;
  if (resolved.length > MAX_RESOURCE_TITLE_LENGTH) {
    throw new BadgeResourceValidationError(`Titles can be at most ${MAX_RESOURCE_TITLE_LENGTH} characters.`);
  }
  return resolved;
}

// Only http(s) links with a real host. The server never fetches the link, so
// there is no SSRF surface; this just keeps javascript:/data: out of an <a href>.
export function normalizeResourceLink(raw: unknown): { url: string; hostname: string } {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    throw new BadgeResourceValidationError('Enter a link.');
  }
  if (trimmed.length > MAX_LINK_LENGTH) {
    throw new BadgeResourceValidationError(`Links can be at most ${MAX_LINK_LENGTH} characters.`);
  }
  // Same leniency as isValidYouTubeUrl: a bare "example.com/page" gets https://.
  // Anything that already carries a scheme ("javascript:", "data:") is kept as-is
  // so the protocol check below rejects it.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new BadgeResourceValidationError('Enter a valid link.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadgeResourceValidationError('Links must start with http:// or https://.');
  }
  if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
    throw new BadgeResourceValidationError('Enter a valid link.');
  }
  return { url: parsed.toString(), hostname: parsed.hostname.replace(/^www\./, '') };
}

export function sanitizePdfFileName(raw: unknown): string {
  const base = (typeof raw === 'string' ? raw : '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // Multipart encoders (browsers, undici) send a quote in a filename as %22.
    .replace(/%22/gi, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"'`<>|*?:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const stem = cleaned
    .replace(/\.pdf$/i, '')
    .slice(0, MAX_FILE_NAME_LENGTH - 4)
    .trim();
  return `${stem || 'resource'}.pdf`;
}

// Checks the bytes themselves, not the browser-declared type: a renamed .txt fails.
export function validatePdf(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw new BadgeResourceValidationError('That file is empty.');
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new BadgeResourceValidationError('PDFs can be at most 3 MB.');
  }
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  if (header !== '%PDF-') {
    throw new BadgeResourceValidationError('Only PDF files can be uploaded.');
  }
}
