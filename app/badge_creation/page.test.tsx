import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

jest.mock(
  '@/app/components/RichText/RichTextEditor',
  () =>
    function MockRichTextEditor({
      ariaLabel,
      initialHTML,
      onChange,
    }: {
      ariaLabel?: string;
      initialHTML?: string;
      onChange?: (html: string) => void;
    }) {
      return (
        <textarea
          aria-label={ariaLabel}
          value={initialHTML ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );
    }
);

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

  it('renumbers checkpoints after deleting one', async () => {
    render(<BadgeCreationPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(screen.getByRole('button', { name: /Add checkpoint/i }));
    expect(screen.getByRole('dialog', { name: 'Checkpoint 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: /Add checkpoint/i }));
    expect(screen.getByRole('dialog', { name: 'Checkpoint 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Checkpoint 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove checkpoint' }));

    expect(screen.getByRole('button', { name: 'Edit Checkpoint 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Checkpoint 2' })).not.toBeInTheDocument();
    expect(screen.getByText('Segment 1')).toBeInTheDocument();
  });

  it('submits the badge draft to the badge creation API with the course id', async () => {
    const user = userEvent.setup();
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
    await user.type(screen.getByLabelText('Question 1 prompt'), 'What should you check first?');
    fireEvent.change(screen.getByPlaceholderText('Choice 1'), {
      target: { value: 'Gas valve is off' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choice 2'), {
      target: { value: 'Bench is wet' },
    });
    fireEvent.click(screen.getByLabelText('Question 1 choice 2 is correct'));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    expect(screen.getByRole('button', { name: 'Add choice' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    await user.type(screen.getByLabelText('Question 2 prompt'), 'What color should the flame be?');
    fireEvent.change(screen.getAllByPlaceholderText('Choice 1')[1], {
      target: { value: 'Orange' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('Choice 2')[1], {
      target: { value: 'Blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add a checkpoint at the current time' }));
    await user.type(screen.getByLabelText('Question 1 prompt'), 'What temperature range is acceptable?');
    fireEvent.change(screen.getByLabelText('Checkpoint 2 question 1 type'), {
      target: { value: 'shortAnswer' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 question 1 exact numeric answer'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 question 1 accepted minimum'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 2 question 1 accepted maximum'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Rubric goal name'), {
      target: { value: 'Safe burner operation' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 title'), {
      target: { value: 'Setup and shutdown' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 task 1'), {
      target: { value: 'Student performs setup and shutdown safely.' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 task 1 points'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 pass threshold points'), {
      target: { value: '3' },
    });
    // Add a second subgoal (with its default single task).
    fireEvent.click(screen.getByRole('button', { name: 'Add subgoal' }));
    fireEvent.change(screen.getByLabelText('Subgoal 2 title'), {
      target: { value: 'Explains safety' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 2 task 1'), {
      target: { value: 'Student explains the safety reason for each step.' },
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
        options: ['Gas valve is off', 'Bench is wet', '', '', '', '', '', ''],
        correctIndices: [0, 1],
      })
    );
    expect(body.checkpoints[0].questions).toEqual([
      expect.objectContaining({
        question: 'What should you check first?',
        options: ['Gas valve is off', 'Bench is wet', '', '', '', '', '', ''],
        correctIndices: [0, 1],
      }),
      expect.objectContaining({
        question: 'What color should the flame be?',
        options: ['Orange', 'Blue'],
      }),
    ]);
    expect(body.checkpoints[1]).toEqual(
      expect.objectContaining({
        questionType: 'shortAnswer',
        question: 'What temperature range is acceptable?',
        numericAnswer: '42',
        numericRangeMin: '40',
        numericRangeMax: '45',
      })
    );

    expect(body.rubricGoal).toEqual(
      expect.objectContaining({
        name: 'Safe burner operation',
        subgoals: [
          expect.objectContaining({
            text: 'Setup and shutdown',
            passThreshold: 3,
            tasks: [expect.objectContaining({ text: 'Student performs setup and shutdown safely.', points: 3 })],
          }),
          expect.objectContaining({
            text: 'Explains safety',
            passThreshold: 1,
            tasks: [expect.objectContaining({ text: 'Student explains the safety reason for each step.', points: 1 })],
          }),
        ],
      })
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

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> video
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> checkpoints
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> rubric
    fireEvent.change(screen.getByLabelText('Rubric goal name'), {
      target: { value: 'Demonstrate the skill' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 title'), {
      target: { value: 'Perform the skill' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 task 1'), {
      target: { value: 'Student demonstrates the skill.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> review
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
              rubricGoal: {
                id: 'goal-1',
                name: 'Original goal',
                subgoals: [
                  {
                    id: 'subgoal-1',
                    text: 'Original subgoal.',
                    passThreshold: 2,
                    sortOrder: 0,
                    tasks: [{ id: 'task-1', text: 'Original task.', points: 2, sortOrder: 0 }],
                  },
                ],
              },
              requirements: [
                {
                  displayText: 'Original goal',
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
        rubricGoal: {
          name: 'Original goal',
          taInstructions: '',
          subgoals: [
            {
              id: 'subgoal-1',
              text: 'Original subgoal.',
              passThreshold: 2,
              tasks: [{ id: 'task-1', text: 'Original task.', points: 2 }],
            },
          ],
        },
      })
    );
    expect(await screen.findByRole('dialog', { name: 'Badge updated successfully.' })).toBeInTheDocument();
  });

  it('captures skills and short-answer unit/feedback in the submitted draft', async () => {
    const user = userEvent.setup();
    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), { target: { value: 'Pipetting' } });
    fireEvent.change(screen.getByLabelText('Add skill'), { target: { value: 'Precision' } });
    fireEvent.keyDown(screen.getByLabelText('Add skill'), { key: 'Enter' });
    expect(screen.getByText('Precision')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> video
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> checkpoints

    fireEvent.click(screen.getByRole('button', { name: /Add checkpoint/i }));
    await user.type(screen.getByLabelText('Question 1 prompt'), 'What volume?');
    fireEvent.change(screen.getByLabelText('Checkpoint 1 question 1 type'), { target: { value: 'shortAnswer' } });
    fireEvent.change(screen.getByLabelText('Checkpoint 1 question 1 exact numeric answer'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint 1 question 1 unit'), { target: { value: 'mL' } });
    fireEvent.click(screen.getByLabelText('Checkpoint 1 question 1 add incorrect-answer feedback'));
    fireEvent.change(screen.getByLabelText('Checkpoint 1 question 1 incorrect-answer feedback'), {
      target: { value: 'Re-measure carefully.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close question editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> rubric
    fireEvent.change(screen.getByLabelText('Rubric goal name'), {
      target: { value: 'Pipette accurately' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 title'), {
      target: { value: 'Measure precisely' },
    });
    fireEvent.change(screen.getByLabelText('Subgoal 1 task 1'), {
      target: { value: 'Student pipettes the target volume.' },
    });
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

  it('blocks advancing past the rubric step until goal, subgoal, and task text are provided', async () => {
    render(<BadgeCreationPage />);

    fireEvent.change(screen.getByLabelText('Badge Name'), { target: { value: 'Burner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> video
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> checkpoints
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // -> rubric

    // 1. Leaving the goal name blank blocks the step and surfaces an error.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Add a rubric goal name before continuing.')).toBeInTheDocument();
    // Still on the rubric step (the goal name field remains visible).
    expect(screen.getByLabelText('Rubric goal name')).toBeInTheDocument();

    // 2. Goal name given, but the default blank subgoal title still blocks.
    fireEvent.change(screen.getByLabelText('Rubric goal name'), { target: { value: 'Operate the burner safely' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Subgoals can not be blank')).toBeInTheDocument();
    expect(screen.getByLabelText('Rubric goal name')).toBeInTheDocument();

    // 3. A whitespace-only subgoal title is still treated as blank.
    fireEvent.change(screen.getByLabelText('Subgoal 1 title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Subgoals can not be blank')).toBeInTheDocument();

    // 4. Subgoal titled, but the default blank task still blocks.
    fireEvent.change(screen.getByLabelText('Subgoal 1 title'), { target: { value: 'Setup and shutdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Tasks must contain text')).toBeInTheDocument();
    expect(screen.getByLabelText('Rubric goal name')).toBeInTheDocument();

    // 5. With goal, subgoal, and task text all filled, advancing to review is unblocked.
    fireEvent.change(screen.getByLabelText('Subgoal 1 task 1'), {
      target: { value: 'Student sets up and shuts down the burner safely.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Create Badge' })).toBeInTheDocument();
  });
});
