import CoursesPage from './page';

const mockRedirect = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe('Courses page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects the retired courses listing route to home', () => {
    CoursesPage();

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
