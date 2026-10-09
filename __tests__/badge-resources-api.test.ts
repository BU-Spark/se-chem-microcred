/** @jest-environment node */

// Issue #135: badge extra resources (links + PDFs).
import { NextRequest } from 'next/server';

import {
  BadgeResourceValidationError,
  MAX_PDF_BYTES,
  normalizeResourceLink,
  sanitizePdfFileName,
  validatePdf,
} from '../lib/badges/badge-resource-rules';

const mockEnsureCurrentUser = jest.fn();
jest.mock('../app/api/courses/lib/ensure-user', () => ({
  ensureCurrentUser: () => mockEnsureCurrentUser(),
}));

const mockPrisma = {
  badge: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  badgeRequirement: { findMany: jest.fn() },
  badgeResource: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  badgeResourceFile: { findUnique: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

jest.mock('../lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

const USER = { id: 'user-1' };
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%fake but valid header\n');

function badgeParams(badgeId = 'copy-1') {
  return { params: Promise.resolve({ badgeId }) };
}

// A course copy whose family root is "root-1".
function mockFamilyRoot() {
  mockPrisma.badge.findUnique.mockResolvedValue({ id: 'copy-1', sourceBadgeId: 'root-1' });
}

function requirementRow({
  role,
  createdById = 'someone-else',
  availableOn = null,
}: {
  role?: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  createdById?: string;
  availableOn?: Date | null;
}) {
  return {
    badge: { availableOn },
    lesson: { course: { createdById, enrollments: role ? [{ role }] : [] } },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCurrentUser.mockResolvedValue(USER);
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe('resource rules', () => {
  it('adds https:// to a bare domain and keeps http(s) links', () => {
    expect(normalizeResourceLink('example.com/notes')).toEqual({
      url: 'https://example.com/notes',
      hostname: 'example.com',
    });
    expect(normalizeResourceLink(' http://www.chem.edu/a?b=1 ').hostname).toBe('chem.edu');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'https://', ''])(
    'rejects %p',
    (raw) => {
      expect(() => normalizeResourceLink(raw)).toThrow(BadgeResourceValidationError);
    }
  );

  it('sanitizes PDF file names', () => {
    expect(sanitizePdfFileName('../../etc/"notes".pdf')).toBe('notes.pdf');
    expect(sanitizePdfFileName('C:\\Users\\me\\Lab Safety.PDF')).toBe('Lab Safety.pdf');
    expect(sanitizePdfFileName('')).toBe('resource.pdf');
    expect(sanitizePdfFileName('report')).toBe('report.pdf');
    expect(sanitizePdfFileName('Lab %22Safety%22.pdf')).toBe('Lab Safety.pdf');
  });

  it('checks PDF bytes, not the declared type', () => {
    expect(() => validatePdf(PDF_BYTES)).not.toThrow();
    expect(() => validatePdf(new TextEncoder().encode('just text'))).toThrow('Only PDF files');
    expect(() => validatePdf(new Uint8Array())).toThrow('empty');
    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    big.set(PDF_BYTES.subarray(0, 5));
    expect(() => validatePdf(big)).toThrow('3 MB');
  });
});

describe('canViewBadgeResources', () => {
  const load = async () => (await import('../lib/badges/badge-resources')).canViewBadgeResources;
  const NOW = new Date('2026-10-09T12:00:00Z');

  beforeEach(() => {
    mockPrisma.badge.findMany.mockResolvedValue([
      { id: 'root-1', createdById: 'author' },
      { id: 'copy-1', createdById: 'author' },
    ]);
  });

  it('only considers ACTIVE enrollments in courses using the family', async () => {
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);
    const canView = await load();
    await expect(canView('user-1', 'root-1', NOW)).resolves.toBe(false);
    const where = mockPrisma.badgeRequirement.findMany.mock.calls[0][0].where;
    expect(where.badgeId).toEqual({ in: ['root-1', 'copy-1'] });
    expect(JSON.stringify(where)).toContain('"status":"ACTIVE"');
  });

  it('lets a badge owner anywhere in the family view', async () => {
    mockPrisma.badge.findMany.mockResolvedValue([
      { id: 'root-1', createdById: 'author' },
      { id: 'copy-2', createdById: 'user-1' },
    ]);
    const canView = await load();
    await expect(canView('user-1', 'root-1', NOW)).resolves.toBe(true);
    expect(mockPrisma.badgeRequirement.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['course creator', requirementRow({ createdById: 'user-1' }), true],
    ['instructor', requirementRow({ role: 'INSTRUCTOR' }), true],
    ['checker', requirementRow({ role: 'CHECKER', availableOn: new Date('2027-01-01') }), true],
    ['student, always-open badge', requirementRow({ role: 'STUDENT' }), true],
    ['student, released badge', requirementRow({ role: 'STUDENT', availableOn: new Date('2026-09-01') }), true],
    ['student, unreleased badge', requirementRow({ role: 'STUDENT', availableOn: new Date('2026-11-01') }), false],
  ])('%s → %p', async (_label, row, expected) => {
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([row]);
    const canView = await load();
    await expect(canView('user-1', 'root-1', NOW)).resolves.toBe(expected);
  });

  it('never consults StudentBadge status, so LOCKED/COMPLETED/closed students keep access', async () => {
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([requirementRow({ role: 'STUDENT' })]);
    const canView = await load();
    await expect(canView('user-1', 'root-1', NOW)).resolves.toBe(true);
    const select = mockPrisma.badgeRequirement.findMany.mock.calls[0][0].select;
    // Only the release date is read off the badge; no closesOn, no StudentBadge rows.
    expect(select.badge).toEqual({ select: { availableOn: true } });
    expect(JSON.stringify(select)).not.toMatch(/closesOn|neverCloses|studentProgress/);
  });

  it('returns false for an unknown family', async () => {
    mockPrisma.badge.findMany.mockResolvedValue([]);
    const canView = await load();
    await expect(canView('user-1', 'missing', NOW)).resolves.toBe(false);
  });
});

describe('GET /api/badges/[badgeId]/resources', () => {
  const get = async (badgeId = 'copy-1') => {
    const { GET } = await import('../app/api/badges/[badgeId]/resources/route');
    return GET(new NextRequest(`http://localhost/api/badges/${badgeId}/resources`), badgeParams(badgeId));
  };

  it('401s when signed out', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('404s for an unknown badge', async () => {
    mockPrisma.badge.findUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('403s when the user has no enrollment', async () => {
    mockFamilyRoot();
    mockPrisma.badge.findMany.mockResolvedValue([{ id: 'root-1', createdById: 'author' }]);
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);
    expect((await get()).status).toBe(403);
  });

  it('lists the family root resources as metadata only', async () => {
    mockFamilyRoot();
    mockPrisma.badge.findMany.mockResolvedValue([{ id: 'root-1', createdById: 'user-1' }]);
    mockPrisma.badgeResource.findMany.mockResolvedValue([
      { id: 'r1', kind: 'LINK', title: 'Notes', url: 'https://x.org/', sortOrder: 0, file: null },
      { id: 'r2', kind: 'FILE', title: 'Lab', url: null, sortOrder: 1, file: { fileName: 'lab.pdf', sizeBytes: 10 } },
    ]);

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resources).toEqual([
      { id: 'r1', kind: 'LINK', title: 'Notes', url: 'https://x.org/', sortOrder: 0, fileName: null, sizeBytes: null },
      { id: 'r2', kind: 'FILE', title: 'Lab', url: null, sortOrder: 1, fileName: 'lab.pdf', sizeBytes: 10 },
    ]);
    const query = mockPrisma.badgeResource.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ badgeId: 'root-1' });
    expect(JSON.stringify(query.select)).not.toContain('data');
  });
});

describe('POST /api/badges/[badgeId]/resources', () => {
  const post = async (init: { body: BodyInit; headers?: Record<string, string> }) => {
    const { POST } = await import('../app/api/badges/[badgeId]/resources/route');
    return POST(
      new NextRequest('http://localhost/api/badges/copy-1/resources', { method: 'POST', ...init }),
      badgeParams()
    );
  };
  const postLink = (body: unknown) =>
    post({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const postFile = (bytes: Uint8Array, name = 'lab.pdf') => {
    const form = new FormData();
    form.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }), name);
    return post({ body: form });
  };

  beforeEach(() => {
    mockFamilyRoot();
    mockPrisma.badge.findFirst.mockResolvedValue({ id: 'copy-1' });
    mockPrisma.badgeResource.findMany.mockResolvedValue([]);
    mockPrisma.badgeResource.create.mockImplementation(async ({ data }) => ({
      id: 'new-1',
      kind: data.kind,
      title: data.title,
      url: data.url ?? null,
      sortOrder: data.sortOrder,
      file: data.file ? { fileName: data.file.create.fileName, sizeBytes: data.file.create.sizeBytes } : null,
    }));
  });

  it('404s for someone who does not own the badge', async () => {
    mockPrisma.badge.findFirst.mockResolvedValue(null);
    expect((await postLink({ kind: 'LINK', url: 'https://x.org' })).status).toBe(404);
    expect(mockPrisma.badgeResource.create).not.toHaveBeenCalled();
  });

  it('stores a link on the family root, appended after existing resources', async () => {
    mockPrisma.badgeResource.findMany.mockResolvedValue([
      { sortOrder: 0, file: null },
      { sortOrder: 4, file: null },
    ]);
    const response = await postLink({ kind: 'LINK', title: '', url: 'chem.org/guide' });
    expect(response.status).toBe(201);
    expect(mockPrisma.badgeResource.create.mock.calls[0][0].data).toMatchObject({
      badgeId: 'root-1',
      kind: 'LINK',
      title: 'chem.org',
      url: 'https://chem.org/guide',
      sortOrder: 5,
      createdById: 'user-1',
    });
  });

  it('rejects a javascript: link', async () => {
    const response = await postLink({ kind: 'LINK', url: 'javascript:alert(1)' });
    expect(response.status).toBe(400);
    expect(mockPrisma.badgeResource.create).not.toHaveBeenCalled();
  });

  it('enforces the per-badge resource limit', async () => {
    mockPrisma.badgeResource.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) => ({ sortOrder: index, file: null }))
    );
    expect((await postLink({ kind: 'LINK', url: 'https://x.org' })).status).toBe(400);
  });

  it('uploads a PDF with a cleaned name', async () => {
    const response = await postFile(PDF_BYTES, '../Lab "Safety".pdf');
    expect(response.status).toBe(201);
    const data = mockPrisma.badgeResource.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ badgeId: 'root-1', kind: 'FILE', title: 'Lab Safety' });
    expect(data.file.create).toMatchObject({
      fileName: 'Lab Safety.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.byteLength,
    });
  });

  it('rejects a renamed text file', async () => {
    const response = await postFile(new TextEncoder().encode('not a pdf'), 'notes.pdf');
    expect(response.status).toBe(400);
    expect(mockPrisma.badgeResource.create).not.toHaveBeenCalled();
  });

  it('rejects a PDF over 3 MB', async () => {
    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    big.set(PDF_BYTES.subarray(0, 5));
    expect((await postFile(big)).status).toBe(413);
  });

  it('enforces the 25 MB per-family file budget', async () => {
    mockPrisma.badgeResource.findMany.mockResolvedValue([{ sortOrder: 0, file: { sizeBytes: 25 * 1024 * 1024 } }]);
    expect((await postFile(PDF_BYTES)).status).toBe(400);
  });
});

describe('PATCH /api/badges/[badgeId]/resources', () => {
  const patch = async (body: unknown) => {
    const { PATCH } = await import('../app/api/badges/[badgeId]/resources/route');
    return PATCH(
      new NextRequest('http://localhost/api/badges/copy-1/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      badgeParams()
    );
  };

  beforeEach(() => {
    mockFamilyRoot();
    mockPrisma.badge.findFirst.mockResolvedValue({ id: 'copy-1' });
    mockPrisma.badgeResource.findMany.mockResolvedValue([]);
  });

  it('rejects ids from another badge family', async () => {
    mockPrisma.badgeResource.count.mockResolvedValue(1);
    const response = await patch({
      resources: [
        { id: 'mine', sortOrder: 0 },
        { id: 'theirs', sortOrder: 1 },
      ],
    });
    expect(response.status).toBe(400);
    expect(mockPrisma.badgeResource.count.mock.calls[0][0].where.badgeId).toBe('root-1');
    expect(mockPrisma.badgeResource.update).not.toHaveBeenCalled();
  });

  it('reorders resources in one transaction', async () => {
    mockPrisma.badgeResource.count.mockResolvedValue(2);
    const response = await patch({
      resources: [
        { id: 'b', sortOrder: 0, title: 'B' },
        { id: 'a', sortOrder: 1 },
      ],
    });
    expect(response.status).toBe(200);
    expect(mockPrisma.badgeResource.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { sortOrder: 0, title: 'B' },
    });
    expect(mockPrisma.badgeResource.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sortOrder: 1 } });
  });

  it('rejects a non-integer sortOrder', async () => {
    expect((await patch({ resources: [{ id: 'a', sortOrder: 'first' }] })).status).toBe(400);
  });
});

describe('DELETE /api/badges/[badgeId]/resources/[resourceId]', () => {
  const del = async (resourceId = 'r1') => {
    const { DELETE } = await import('../app/api/badges/[badgeId]/resources/[resourceId]/route');
    return DELETE(new NextRequest(`http://localhost/api/badges/copy-1/resources/${resourceId}`, { method: 'DELETE' }), {
      params: Promise.resolve({ badgeId: 'copy-1', resourceId }),
    });
  };

  beforeEach(() => {
    mockFamilyRoot();
    mockPrisma.badge.findFirst.mockResolvedValue({ id: 'copy-1' });
  });

  it('scopes the delete to the family root', async () => {
    mockPrisma.badgeResource.deleteMany.mockResolvedValue({ count: 1 });
    expect((await del()).status).toBe(200);
    expect(mockPrisma.badgeResource.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1', badgeId: 'root-1' } });
  });

  it('404s for a resource in another family', async () => {
    mockPrisma.badgeResource.deleteMany.mockResolvedValue({ count: 0 });
    expect((await del('theirs')).status).toBe(404);
  });

  it('404s for a non-owner', async () => {
    mockPrisma.badge.findFirst.mockResolvedValue(null);
    expect((await del()).status).toBe(404);
    expect(mockPrisma.badgeResource.deleteMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/badge-resources/[resourceId]/file', () => {
  const getFile = async (resourceId = 'r2') => {
    const { GET } = await import('../app/api/badge-resources/[resourceId]/file/route');
    return GET(new NextRequest(`http://localhost/api/badge-resources/${resourceId}/file`), {
      params: Promise.resolve({ resourceId }),
    });
  };

  it('404s for a link resource', async () => {
    mockPrisma.badgeResource.findUnique.mockResolvedValue({ badgeId: 'root-1', kind: 'LINK' });
    expect((await getFile()).status).toBe(404);
  });

  it('403s for a user who cannot view the badge, without loading the bytes', async () => {
    mockPrisma.badgeResource.findUnique.mockResolvedValue({ badgeId: 'root-1', kind: 'FILE' });
    mockPrisma.badge.findMany.mockResolvedValue([{ id: 'root-1', createdById: 'author' }]);
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);
    expect((await getFile()).status).toBe(403);
    expect(mockPrisma.badgeResourceFile.findUnique).not.toHaveBeenCalled();
  });

  it('serves the PDF inline with safe headers', async () => {
    mockPrisma.badgeResource.findUnique.mockResolvedValue({ badgeId: 'root-1', kind: 'FILE' });
    mockPrisma.badge.findMany.mockResolvedValue([{ id: 'root-1', createdById: 'author' }]);
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([requirementRow({ role: 'STUDENT' })]);
    mockPrisma.badgeResourceFile.findUnique.mockResolvedValue({
      fileName: 'Lab Safety.pdf',
      sizeBytes: PDF_BYTES.byteLength,
      data: Buffer.from(PDF_BYTES),
    });

    const response = await getFile();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''Lab%20Safety.pdf");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });
});
