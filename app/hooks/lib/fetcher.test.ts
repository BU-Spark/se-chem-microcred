import { fetcher } from './fetcher';

describe('fetcher', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests and returns JSON data', async () => {
    const payload = { courseId: 'course-1' };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    } as unknown as Response);

    await expect(fetcher<typeof payload>('/api/course')).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api/course', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });

  it('uses the API error message when a request fails', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({ error: 'You cannot view this course.' }),
    } as unknown as Response);

    await expect(fetcher('/api/course')).rejects.toThrow('You cannot view this course.');
  });

  it('uses the response status when an error body is unavailable', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as unknown as Response);

    await expect(fetcher('/api/course')).rejects.toThrow('Request failed with status 500');
  });
});
