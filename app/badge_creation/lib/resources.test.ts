import { dropUnsavedFileResources, stripResourcesForSave, syncBadgeResources } from './resources';
import type { ResourceDraft } from '../types';

const link: ResourceDraft = { tempId: 't1', kind: 'LINK', title: 'Guide', url: 'https://x.org/' };
const savedPdf: ResourceDraft = {
  tempId: 'r9',
  existingId: 'r9',
  kind: 'FILE',
  title: 'Saved',
  fileName: 'saved.pdf',
  sizeBytes: 10,
};

describe('dropUnsavedFileResources', () => {
  it('tolerates drafts saved before resources existed', () => {
    expect(dropUnsavedFileResources(undefined)).toEqual({ kept: [], dropped: 0 });
  });

  it('drops never-uploaded PDFs whose File did not survive localStorage', () => {
    // JSON.stringify turns a File into {}.
    const restored = JSON.parse(
      JSON.stringify([
        link,
        savedPdf,
        { tempId: 't2', kind: 'FILE', title: 'Lost', fileName: 'lost.pdf', sizeBytes: 5, file: {} },
      ])
    );
    expect(dropUnsavedFileResources(restored)).toEqual({ kept: [link, savedPdf], dropped: 1 });
  });
});

it('strips resources (and their File objects) from the badge save payload', () => {
  expect(stripResourcesForSave({ badgeName: 'B', resources: [link] })).toEqual({ badgeName: 'B' });
});

describe('syncBadgeResources', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body });

  it('deletes removed ids, creates new ones, then saves the final order', async () => {
    fetchMock
      .mockResolvedValueOnce(ok()) // DELETE gone-1
      .mockResolvedValueOnce(ok({ resource: { id: 'new-1' } })) // POST link
      .mockResolvedValueOnce(ok()); // PATCH order

    const result = await syncBadgeResources('badge-1', [link, savedPdf], ['gone-1']);

    expect(result.failures).toEqual([]);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/badges/badge-1/resources/gone-1', { method: 'DELETE' }]);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    const order = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(order.resources).toEqual([
      { id: 'new-1', title: 'Guide', sortOrder: 0 },
      { id: 'r9', title: 'Saved', sortOrder: 1 },
    ]);
  });

  it('reports a failed upload without throwing', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Only PDF files can be uploaded.' }),
      })
      .mockResolvedValueOnce(ok());
    const result = await syncBadgeResources('badge-1', [link, savedPdf], []);
    expect(result.failures).toEqual(['Guide: Only PDF files can be uploaded.']);
  });
});
