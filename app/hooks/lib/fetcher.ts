export async function fetcher<Data>(url: string): Promise<Data> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
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
