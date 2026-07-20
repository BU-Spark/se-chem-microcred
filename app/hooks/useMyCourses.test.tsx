import { renderHook, waitFor } from '@testing-library/react';

import { SWRTestProvider } from './test-utils';
import { useMyCourses, type MyCoursesResponse } from './useMyCourses';

const coursesResponse: MyCoursesResponse = {
  user: { name: 'Student Demo', email: 'student@example.edu' },
  created: { count: 1, courses: [{ id: 'created-1' }] },
  enrolled: { count: 1, enrollments: [{ id: 'enrolled-1' }] },
  assessor: { count: 0, enrollments: [] },
};

describe('useMyCourses', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('does not request courses while disabled', () => {
    const { result } = renderHook(() => useMyCourses(false), { wrapper: SWRTestProvider });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves the consolidated course return values', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(coursesResponse),
    } as unknown as Response);

    const { result } = renderHook(() => useMyCourses(true), { wrapper: SWRTestProvider });

    await waitFor(() => expect(result.current.data).toEqual(coursesResponse));
    expect(result.current.created).toEqual(coursesResponse.created);
    expect(result.current.enrolled).toEqual(coursesResponse.enrolled);
    expect(result.current.assessor).toEqual(coursesResponse.assessor);
    expect(result.current.error).toBeUndefined();
    expect(result.current.mutate).toEqual(expect.any(Function));
  });
});
