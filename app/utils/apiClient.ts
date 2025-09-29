export interface ApiClientOptions {
  headers?: HeadersInit;
}

export async function apiClient<T>(input: RequestInfo | URL, init?: RequestInit, options?: ApiClientOptions): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
