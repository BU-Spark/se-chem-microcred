import type { ResourceDraft } from '../types';

export type ResourceDto = {
  id: string;
  kind: 'LINK' | 'FILE';
  title: string;
  url: string | null;
  sortOrder: number;
  fileName: string | null;
  sizeBytes: number | null;
};

export function newResourceTempId() {
  return `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resourcesFromApi(dtos: ResourceDto[]): ResourceDraft[] {
  return dtos.map((dto) =>
    dto.kind === 'LINK'
      ? { tempId: dto.id, existingId: dto.id, kind: 'LINK', title: dto.title, url: dto.url ?? '' }
      : {
          tempId: dto.id,
          existingId: dto.id,
          kind: 'FILE',
          title: dto.title,
          fileName: dto.fileName ?? 'resource.pdf',
          sizeBytes: dto.sizeBytes ?? 0,
        }
  );
}

// A localStorage draft cannot hold a File, so a restored, never-uploaded PDF is
// gone. Drop it and report how many so the instructor can re-attach them.
// Also tolerates drafts saved before resources existed (no `resources` key).
export function dropUnsavedFileResources(resources: unknown): { kept: ResourceDraft[]; dropped: number } {
  if (!Array.isArray(resources)) return { kept: [], dropped: 0 };
  const kept: ResourceDraft[] = [];
  let dropped = 0;
  for (const entry of resources as ResourceDraft[]) {
    if (!entry || (entry.kind !== 'LINK' && entry.kind !== 'FILE')) continue;
    if (entry.kind === 'FILE' && !entry.existingId && !(entry.file instanceof File)) {
      dropped += 1;
      continue;
    }
    kept.push(entry);
  }
  return { kept, dropped };
}

// The draft JSON sent to /api/badges must not carry File objects.
export function stripResourcesForSave<T extends { resources: ResourceDraft[] }>(draft: T): Omit<T, 'resources'> {
  const { resources: _resources, ...rest } = draft;
  void _resources;
  return rest;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function errorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
}

export type ResourceSyncResult = { failures: string[] };

export async function syncBadgeResources(
  badgeId: string,
  resources: ResourceDraft[],
  removedIds: string[]
): Promise<ResourceSyncResult> {
  const base = `/api/badges/${encodeURIComponent(badgeId)}/resources`;
  const failures: string[] = [];

  for (const id of removedIds) {
    const response = await fetch(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    // Already gone counts as success.
    if (!response.ok && response.status !== 404) {
      failures.push(await errorMessage(response, 'Could not remove a resource.'));
    }
  }

  const orderedIds: Array<{ id: string; title: string }> = [];
  for (const resource of resources) {
    if (resource.existingId) {
      orderedIds.push({ id: resource.existingId, title: resource.title });
      continue;
    }

    let response: Response;
    if (resource.kind === 'LINK') {
      response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'LINK', title: resource.title, url: resource.url }),
      });
    } else {
      if (!resource.file) continue;
      const form = new FormData();
      form.append('file', resource.file, resource.fileName);
      form.append('title', resource.title);
      response = await fetch(base, { method: 'POST', body: form });
    }

    if (!response.ok) {
      failures.push(`${resource.title}: ${await errorMessage(response, 'upload failed.')}`);
      continue;
    }
    const payload = (await response.json().catch(() => ({}))) as { resource?: ResourceDto };
    if (payload.resource) orderedIds.push({ id: payload.resource.id, title: resource.title });
  }

  if (orderedIds.length > 0) {
    const response = await fetch(base, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resources: orderedIds.map((entry, index) => ({ id: entry.id, title: entry.title, sortOrder: index })),
      }),
    });
    if (!response.ok) {
      failures.push(await errorMessage(response, 'Could not save the resource order.'));
    }
  }

  return { failures };
}
