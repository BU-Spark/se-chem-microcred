function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

function normalizeOrigin(value: string) {
  const withProtocol = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  return new URL(withProtocol).origin;
}

export function getConfiguredPublicOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (!configuredOrigin) {
    return null;
  }
  try {
    return normalizeOrigin(configuredOrigin);
  } catch {
    return null;
  }
}

export function getPublicOrigin(request: Request) {
  const configuredOrigin = getConfiguredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto')) || 'https';

  if (forwardedHost) {
    return new URL(`${forwardedProto}://${forwardedHost}`).origin;
  }

  const host = request.headers.get('host')?.trim();
  if (host) {
    return new URL(`${forwardedProto}://${host}`).origin;
  }

  return new URL(request.url).origin;
}
