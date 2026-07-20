import { act, renderHook, waitFor } from '@testing-library/react';

import { SWRTestProvider } from './test-utils';
import { useStudentData } from './useStudentData';

const studentResponse = {
  student: { id: 'student-1', email: 'student@example.edu', name: 'Student Demo' },
  course: null,
  analytics: {},
  lessons: { catalog: [] },
  badges: [],
  surveys: [],
};

describe('useStudentData', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('does not fetch without an email', () => {
    const { result } = renderHook(() => useStudentData(null, 'course-1'), { wrapper: SWRTestProvider });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads student data using the email and course key', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(studentResponse),
    } as unknown as Response);

    const { result } = renderHook(() => useStudentData('student@example.edu', 'course 1'), {
      wrapper: SWRTestProvider,
    });

    await waitFor(() => expect(result.current.data).toEqual(studentResponse));
    expect(global.fetch).toHaveBeenCalledWith('/api/demo/student?email=student%40example.edu&courseId=course+1', {
      method: 'GET',
      signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json' },
    });
  });

  it('preserves string errors and clears failed data', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'Unable to load student data.' }),
    } as unknown as Response);

    const { result } = renderHook(() => useStudentData('failure@example.edu'), { wrapper: SWRTestProvider });

    await waitFor(() => expect(result.current.error).toBe('Unable to load student data.'));
    expect(result.current.data).toBeNull();
  });

  it('refreshes the current student request', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(studentResponse),
    } as unknown as Response);

    const { result } = renderHook(() => useStudentData('refresh@example.edu'), { wrapper: SWRTestProvider });
    await waitFor(() => expect(result.current.data).toEqual(studentResponse));

    act(() => result.current.refresh());
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
