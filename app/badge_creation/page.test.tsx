import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import BadgeCreationPage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();
const mockFetch = jest.fn();

let mockSearchParams = new URLSearchParams('courseId=course-1');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/badge_creation',
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

jest.mock('../hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

function createClerkState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: 'Professor Demo',
      primaryEmailAddress: { emailAddress: 'prof@example.edu' },
    },
    ...overrides,
  };
}

describe('Badge creation page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue({ signOut: jest.fn() });
    mockUseStudentData.mockReturnValue({
      data: { student: { name: 'Professor Demo' } },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Badge created successfully.',
        badge: { id: 'badge-1' },
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('starts a new video with no checkpoints', async () => {
    render(<BadgeCreationPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByRole('button', { name: /Edit Checkpoint/i })).not.toBeInTheDocument();
  });

  it('submits the badge draft to the badge creation API with the course id', async () => {
    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), {
      target: { value: 'Bunsen Burner' },
    });
    fireEvent.change(screen.getByLabelText('Badge Description'), {
      target: { value: 'Students demonstrate safe burner setup.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Paste YouTube link here'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' },
    });
    fireEvent.change(screen.getByLabelText('Video Title'), {
      target: { value: 'Burner safety lesson' },
    });
    fireEvent.change(screen.getByLabelText('Length'), {
      target: { value: '00:20:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Checkpoints are authored in a per-checkpoint modal opened from the rail
    // node or auto-opened when a new checkpoint is added via the video "+".
    fireEvent.click(screen.getByRole('button', { name: 'Add a checkpoint at the current time' }));
    fireEvent.change(screen.getByLabelText('Question prompt'), {
      target: { value: 'What should you check first?' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choice 1'), {
      target: { value: 'Gas valve is off' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choice 2'), {
      target: { value: 'Bench is wet' },
    });
    fireEvent.click(screen.getByLabelText('Choice 2 is correct'));
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add a checkpoint at the current time' }));
    fireEvent.change(screen.getByLabelText('Question prompt'), {
      target: { value: 'What temperature range is acceptable?' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 question type'), {
      target: { value: 'shortAnswer' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 exact numeric answer'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 accepted minimum'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 accepted maximum'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Rubric item 1'), {
      target: { value: 'Student performs setup and shutdown safely.' },
    });
    // The rubric list auto-numbers: pressing Enter on a filled row spawns the next.
    fireEvent.keyDown(screen.getByLabelText('Rubric item 1'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Rubric item 2'), {
      target: { value: 'Student explains the safety reason for each step.' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1'), {
      target: { value: 'Technique' },
    });
    fireEvent.change(screen.getByPlaceholderText('Selection option 1'), {
      target: { value: 'Needs support' },
    });
    fireEvent.change(screen.getByPlaceholderText('Selection option 2'), {
      target: { value: 'Meets expectations' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Criterion' }));
    fireEvent.change(screen.getByLabelText('Criterion 2'), {
      target: { value: 'Safety explanation' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Badge' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/badges',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body).toEqual(
      expect.objectContaining({
        courseId: 'course-1',
        badgeName: 'Bunsen Burner',
        badgeDescription: 'Students demonstrate safe burner setup.',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
        videoTitle: 'Burner safety lesson',
      })
    );
    expect(body.checkpoints[0]).toEqual(
      expect.objectContaining({
        questionType: 'multipleChoice',
        question: 'What should you check first?',
        options: ['Gas valve is off', 'Bench is wet', '', ''],
        correctIndices: [0, 1],
      })
    );
    expect(body.checkpoints[1]).toEqual(
      expect.objectContaining({
        questionType: 'shortAnswer',
        question: 'What temperature range is acceptable?',
        numericAnswer: '42',
        numericRangeMin: '40',
        numericRangeMax: '45',
      })
    );

    expect(body.rubricItems).toEqual([
      { id: 'rubric-item-1', text: 'Student performs setup and shutdown safely.' },
      expect.objectContaining({ text: 'Student explains the safety reason for each step.' }),
    ]);
    expect(body.rubricCriteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: 'Technique',
          options: ['Needs support', 'Meets expectations', ''],
        }),
        expect.objectContaining({
          prompt: 'Safety explanation',
          options: ['', '', ''],
        }),
      ])
    );

    expect(await screen.findByRole('dialog', { name: 'Badge created successfully.' })).toBeInTheDocument();
    expect(screen.getByText('This badge was created and assigned to the selected course.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close success message' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Badge created successfully.' })).not.toBeInTheDocument();
    });
  });

  it('can create a badge without assigning it to a course', async () => {
    mockSearchParams = new URLSearchParams();

    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), {
      target: { value: 'Standalone Badge' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Badge' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/badges', expect.any(Object));
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body).toEqual(
      expect.objectContaining({
        courseId: null,
        badgeName: 'Standalone Badge',
      })
    );
    expect(
      await screen.findByText('This badge was created independently and can be assigned to a course later.')
    ).toBeInTheDocument();
  });

  it('loads an existing badge and saves updates from the creation page', async () => {
    mockSearchParams = new URLSearchParams('badgeId=badge-1&courseId=course-1');
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          badges: [
            {
              id: 'badge-1',
              name: 'Original Badge',
              description: 'Original description.',
              category: 'SAFETY',
              requirements: [
                {
                  displayText: 'Original rubric item.',
                  rubricItems: [{ number: 1, text: 'Original rubric item.' }],
                  gradingCriteria: [{ number: 1, criterion: 'Technique', options: ['Needs support', 'Ready'] }],
                  checkpoints: [
                    {
                      title: 'Checkpoint 1',
                      time: '00:01:00',
                      points: 5,
                      question: 'What should students check?',
                      questionType: 'multipleChoice',
                      options: ['Gas valve', 'Bench'],
                      correctIndices: [0],
                      segmentLabel: 'Segment 1 Starts 00:01:00',
                    },
                  ],
                  lesson: {
                    title: 'Original lesson',
                    description: 'Original description.',
                    dueDate: '2025-03-01T00:00:00.000Z',
                    estimatedMinutes: 10,
                    segment: {
                      title: 'Original video',
                      duration: 600,
                      videoUrl: 'https://www.youtube.com/watch?v=abc123',
                    },
                  },
                },
              ],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Badge updated successfully.',
          badge: { id: 'badge-1' },
        }),
      });

    render(<BadgeCreationPage />);

    expect(await screen.findByRole('heading', { name: 'Edit Badge' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Original Badge')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Badge Name'), {
      target: { value: 'Updated Badge' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Badge' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/badges',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const [, options] = mockFetch.mock.calls[1];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body).toEqual(
      expect.objectContaining({
        id: 'badge-1',
        courseId: 'course-1',
        badgeName: 'Updated Badge',
      })
    );
    expect(await screen.findByRole('dialog', { name: 'Badge updated successfully.' })).toBeInTheDocument();
  });

  it('captures skills and short-answer unit/feedback in the submitted draft', async () => {
    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), { target: { value: 'Pipetting' } });
    fireEvent.change(screen.getByLabelText('Add skill'), { target: { value: 'Precision' } });
    fireEvent.keyDown(screen.getByLabelText('Add skill'), { key: 'Enter' });
    expect(screen.getByText('Precision')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> video
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> checkpoints

    fireEvent.click(screen.getByRole('button', { name: /Add checkpoint/i }));
    fireEvent.change(screen.getByLabelText('Question prompt'), { target: { value: 'What volume?' } });
    fireEvent.change(screen.getByLabelText('Checkpoint 1 question type'), { target: { value: 'shortAnswer' } });
    fireEvent.change(screen.getByLabelText('Checkpoint 1 exact numeric answer'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Checkpoint 1 unit'), { target: { value: 'mL' } });
    fireEvent.click(screen.getByLabelText('Checkpoint 1 add incorrect-answer feedback'));
    fireEvent.change(screen.getByLabelText('Checkpoint 1 incorrect-answer feedback'), {
      target: { value: 'Re-measure carefully.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> rubric
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> review
    fireEvent.click(screen.getByRole('button', { name: 'Create Badge' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/badges', expect.objectContaining({ method: 'POST' }));
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.skills).toEqual(['Precision']);
    expect(body.checkpoints[0]).toEqual(
      expect.objectContaining({
        questionType: 'shortAnswer',
        numericAnswer: '10',
        unit: 'mL',
        incorrectFeedback: 'Re-measure carefully.',
        incorrectFeedbackEnabled: true,
      })
    );
  });

  it('blocks advancing past the video step when the YouTube link is invalid', async () => {
    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), { target: { value: 'Burner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> video

    fireEvent.change(screen.getByLabelText('Paste YouTube link here'), { target: { value: 'a' } });
    expect(screen.getByText('Enter a valid YouTube link.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Fix the highlighted video fields before continuing.')).toBeInTheDocument();
    // Still on the video step (link field remains visible).
    expect(screen.getByLabelText('Paste YouTube link here')).toBeInTheDocument();
  });
});
