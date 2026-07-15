export async function fetcher<Data>(url: string, init?: RequestInit, includeCredentials = true): Promise<Data> {
  const response = await fetch(url, {
    ...init,
    ...(includeCredentials ? { credentials: 'include' as const } : {}),
    headers: { Accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) },
  });

  const payload = (await response.json().catch(() => null)) as Data | { error?: unknown } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as Data;
}
