/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  AvatarAccessory,
  AvatarBase,
  AvatarFace,
  BadgeCategory,
  BadgeStatus,
  CourseContactType,
  LessonStatus,
  SegmentStatus,
  SurveyContext,
} = require('@prisma/client');

const { CourseRole } = require('@prisma/client');

const prisma = new PrismaClient();

const placeholderLessonImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=';

async function clearExistingData() {
  await prisma.$transaction([
    prisma.assessmentCriterionResponse.deleteMany(),
    prisma.assessmentAttempt.deleteMany(),
    prisma.checkpointResponse.deleteMany(),
    prisma.checkpointAttempt.deleteMany(),
    prisma.checkpointQuestion.deleteMany(),
    prisma.lessonCheckpoint.deleteMany(),
    prisma.segmentProgress.deleteMany(),
    prisma.lessonProgress.deleteMany(),
    prisma.lessonSkill.deleteMany(),
    prisma.lessonSegment.deleteMany(),
    prisma.surveyResponse.deleteMany(),
    prisma.surveyPrompt.deleteMany(),
    prisma.studentBadge.deleteMany(),
    prisma.badgeRequirement.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.studentAnalytics.deleteMany(),
    prisma.avatarSetting.deleteMany(),
    prisma.courseContact.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.courseSettings?.deleteMany ? prisma.courseSettings.deleteMany() : prisma.$executeRaw`SELECT 1`,
    prisma.course.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function seedDemo() {
  console.log('Seeding demo data...');

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'jacksoncg730@gmail.com',
        name: 'John Doe',
        buid: 'U1234567',
        gender: 'Male',
        raceEthnicity: 'White',
        parentalEducation: 'Bachelors degree',
        pellGrantQualified: false,
      },
    }),
    prisma.user.create({
      data: {
        email: 'student1@bu.edu',
        name: 'Jane Student',
        buid: 'U7654321',
        gender: 'Female',
        raceEthnicity: 'White',
        parentalEducation: 'Masters degree',
        pellGrantQualified: false,
      },
    }),
    prisma.user.create({
      data: {
        email: 'checker1@bu.edu',
        name: 'Alex Checker',
        buid: 'U1112223',
        gender: 'Female',
        raceEthnicity: 'White',
        parentalEducation: 'Bachelors degree',
        pellGrantQualified: true,
      },
    }),
  ]);

  const instructor = users[0];
  const studentUser = users[1];
  const checkerUser = users[2];

  const course = await prisma.course.create({
    data: {
      code: 'CHEM101',
      section: 'K1',
      title: 'Chem 101: Safety Foundations',
      sectionCount: 2,
      description:
        'Introductory laboratory safety course covering flame safety, waste handling, and ventilation best practices.',
      createdById: instructor.id,
      settings: {
        create: {
          allowCooldownOverride: true,
          allowAssessorMessages: true,
          allowCrossSectionView: true,
        },
      },
    },
  });

  for (const user of users) {
    await prisma.avatarSetting.create({
      data: {
        studentId: user.id,
        base: AvatarBase.SAPPHIRE,
        face: AvatarFace.SMILE,
        accessory: AvatarAccessory.LEAF,
      },
    });

    const enrollmentRole =
      user.id === instructor.id
        ? CourseRole.INSTRUCTOR
        : user.id === checkerUser.id
          ? CourseRole.CHECKER
          : CourseRole.STUDENT;

    await prisma.enrollment.create({
      data: {
        studentId: user.id,
        courseId: course.id,
        role: enrollmentRole,
        sections:
          enrollmentRole === CourseRole.INSTRUCTOR
            ? undefined
            : {
                create: [{ section: 'K1' }],
              },
      },
    });

    await prisma.studentAnalytics.create({
      data: {
        studentId: user.id,
        hoursLearning: 6,
        badgesCompleted: 1,
        badgesReadyForAssessment: 1,
        badgesNotAttempted: 0,
        questionsAnswered: 6,
        averageAssessmentScore: 0,
        highestAssessmentScore: 0,
      },
    });
  }

  await prisma.courseContact.createMany({
    data: [
      {
        courseId: course.id,
        type: CourseContactType.INSTRUCTOR,
        name: 'Last Name, First Name',
        email: 'prof@bu.edu',
        avatarUrl: '/edit_avatar/emerald.svg',
      },
      {
        courseId: course.id,
        type: CourseContactType.CHECKER,
        name: 'Last Name, First Name',
        email: 'ta@bu.edu',
        avatarUrl: '/edit_avatar/amethyst.svg',
      },
    ],
  });

  const lessonSeeds = [
    {
      slug: 'bunsen-burners',
      title: 'Bunsen Burners',
      summary: 'Hands-on practice lighting and controlling a burner safely.',
      description: 'Learn the ignition checklist, flame control, and shutdown steps shown in the demo video.',
      estimatedMinutes: 20,
      dueDate: new Date('2025-03-01T22:00:00.000Z'),
      skills: ['Inspect burner setup', 'Control flame height', 'Shut down safely'],
      segments: [
        {
          title: 'Bunsen Burner Demo',
          summary: 'Walk through the full burner setup and ignition.',
          duration: 7,
          videoUrl: 'https://www.youtube.com/watch?v=p67ZwO6PdeI',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Burner Basics',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 60,
          snapshotUrl: 'https://images.unsplash.com/photo-1513379733131-47fc74b45fc7?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Which step must you complete before opening the gas valve?',
              options: ['Check hose connections', 'Light the match', 'Lower the room lights'],
              correctIndex: 0,
            },
            {
              prompt: 'What flame color indicates efficient combustion?',
              options: ['Orange', 'Blue', 'Yellow'],
              correctIndex: 1,
            },
            {
              prompt: 'Target flame height in cm when heating a beaker? (numeric)',
              options: {
                type: 'shortAnswer',
                expectedAnswer: 2,
                tolerancePercent: 20,
              },
              correctIndex: null,
            },
          ],
        },
        {
          title: 'Shutdown Steps',
          label: 'Checkpoint',
          meta: '2 questions',
          questionCount: 2,
          segmentIndex: 0,
          timeOffsetSeconds: 140,
          snapshotUrl: 'https://images.unsplash.com/photo-1521790797524-b2497295b8a0?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'What do you close first when shutting down?',
              options: ['Air intake', 'Gas valve', 'Spark igniter'],
              correctIndex: 1,
            },
            {
              prompt: 'Where should the burner cool after shutdown?',
              options: ['In a drawer', 'On a heat-safe surface', 'In the sink'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'general-lab-safety',
      title: 'General Lab Safety',
      summary: 'Core safety habits for every lab session.',
      description: 'Review PPE, housekeeping, and emergency basics from the lab safety video.',
      estimatedMinutes: 15,
      dueDate: new Date('2025-03-04T22:00:00.000Z'),
      skills: ['Select PPE', 'Keep benches clear', 'Know emergency steps'],
      segments: [
        {
          title: 'Safety Overview',
          summary: 'Common lab safety expectations and why they matter.',
          duration: 8,
          videoUrl: 'https://www.youtube.com/watch?v=nZ2_FmLPAow',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Safety Checkpoint',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 70,
          snapshotUrl: 'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'What should you do with loose hair before starting?',
              options: ['Leave it as is', 'Tie it back', 'Wear a hat'],
              correctIndex: 1,
            },
            {
              prompt: 'Which item is always required near the bench?',
              options: ['Calculator', 'Lab coat and goggles', 'Snack'],
              correctIndex: 1,
            },
            {
              prompt: 'What is the first step if a spill reaches your skin?',
              options: ['Ignore it', 'Rinse with water immediately', 'Tell a friend'],
              correctIndex: 1,
            },
          ],
        },
        {
          title: 'Emergency Basics',
          label: 'Checkpoint',
          meta: '2 questions',
          questionCount: 2,
          segmentIndex: 0,
          timeOffsetSeconds: 140,
          snapshotUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Where is the first place to look for chemical emergency guidance?',
              options: ['Safety Data Sheet', 'Class notes', 'Random website'],
              correctIndex: 0,
            },
            {
              prompt: 'What should you do before evacuating for a fire alarm?',
              options: ['Finish the experiment', 'Shut off burners/equipment if safe', 'Take a photo'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'top-loading-balance',
      title: 'Top-loading Balance',
      summary: 'Accurate mass measurements with proper balance technique.',
      description: 'Follow the setup, taring, and cleanup process shown in the balance video.',
      estimatedMinutes: 12,
      dueDate: new Date('2025-03-07T22:00:00.000Z'),
      skills: ['Level and tare a balance', 'Avoid drafts and vibration', 'Record measurements'],
      segments: [
        {
          title: 'Balance Operation',
          summary: 'Step-by-step use of the top-loading balance.',
          duration: 6,
          videoUrl: 'https://www.youtube.com/watch?v=SIr53DdFflk',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Balance Basics',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 65,
          snapshotUrl: 'https://images.unsplash.com/photo-1509223197845-458d87318791?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Why do you close the balance draft shield?',
              options: ['Keep dust out', 'Reduce air currents', 'Look professional'],
              correctIndex: 1,
            },
            {
              prompt: 'When should you tare the balance?',
              options: ['Only at the end', 'After placing the container', 'Never'],
              correctIndex: 1,
            },
            {
              prompt: 'What is 1 + 1? (numeric)',
              options: {
                type: 'shortAnswer',
                expectedAnswer: 2,
                tolerancePercent: 1,
              },
              correctIndex: null,
            },
          ],
        },
      ],
    },
    {
      slug: 'graduated-cylinder',
      title: 'Graduated Cylinder',
      summary: 'Measure liquid volumes accurately with a graduated cylinder.',
      description: 'Learn how to read the meniscus and avoid parallax using the cylinder video.',
      estimatedMinutes: 10,
      dueDate: new Date('2025-03-10T22:00:00.000Z'),
      skills: ['Read the meniscus', 'Select proper cylinder size', 'Avoid parallax error'],
      segments: [
        {
          title: 'Cylinder Technique',
          summary: 'Demonstration of correct volume reading.',
          duration: 5,
          videoUrl: 'https://www.youtube.com/watch?v=BeJ5Ez66gS8',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Volume Reading',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 50,
          snapshotUrl: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Where should your eyes be when reading volume?',
              options: ['Above the meniscus', 'Level with the meniscus', 'Below the bench'],
              correctIndex: 1,
            },
            {
              prompt: 'Which part of the meniscus do you read?',
              options: ['Top', 'Bottom', 'Middle'],
              correctIndex: 1,
            },
            {
              prompt: 'Why choose the smallest cylinder that fits the volume?',
              options: ['Looks nicer', 'Improves precision', 'Heats faster'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'lab-notebook',
      title: 'Preparing the Lab Notebook',
      summary: 'Set up a clean, compliant lab notebook before experiments.',
      description: 'Number pages, add headers, and capture objectives following the video walkthrough.',
      estimatedMinutes: 8,
      dueDate: new Date('2025-03-12T22:00:00.000Z'),
      skills: ['Organize pre-lab notes', 'Record objectives clearly', 'Keep pages traceable'],
      segments: [
        {
          title: 'Notebook Setup',
          summary: 'How to format and prep your lab notebook.',
          duration: 6,
          videoUrl: 'https://www.youtube.com/watch?v=ZeHpfedmvBM',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Notebook Basics',
          label: 'Checkpoint',
          meta: '2 questions',
          questionCount: 2,
          segmentIndex: 0,
          timeOffsetSeconds: 40,
          snapshotUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Where do you write the date for each entry?',
              options: ['Back cover', 'Top of the page', 'Side margin'],
              correctIndex: 1,
            },
            {
              prompt: 'Why number pages before starting?',
              options: ['For fun', 'To keep entries traceable', 'To change page order later'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'volumetric-stock-solutions',
      title: 'Preparing Stock Solutions in a Volumetric Flask',
      summary: 'Make accurate stock solutions using volumetric glassware.',
      description: 'Follow the rinse, dissolve, and bring-to-line steps from the demo.',
      estimatedMinutes: 14,
      dueDate: new Date('2025-03-15T22:00:00.000Z'),
      skills: ['Use volumetric flasks', 'Dissolve solute safely', 'Mix to final volume'],
      segments: [
        {
          title: 'Volumetric Prep',
          summary: 'Step-by-step prep of a stock solution.',
          duration: 9,
          videoUrl: 'https://www.youtube.com/watch?v=BclII1sSe8w',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Solution Prep',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 70,
          snapshotUrl: 'https://images.unsplash.com/photo-1509223197845-458d87318791?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Why rinse the flask with a small amount of solution?',
              options: ['Cool it down', 'Condition the walls', 'Save time'],
              correctIndex: 1,
            },
            {
              prompt: 'When do you bring the meniscus to the calibration line?',
              options: ['Before dissolving solute', 'After most mixing is done', 'Never necessary'],
              correctIndex: 1,
            },
            {
              prompt: 'Best way to mix after filling to the line?',
              options: ['Shake vigorously', 'Invert gently several times', 'Stir with a rod'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'general-waste-handling',
      title: 'General Waste Handling',
      summary: 'Collect and segregate common lab waste streams safely.',
      description: 'Identify container types and labeling requirements as shown in the video.',
      estimatedMinutes: 12,
      dueDate: new Date('2025-03-18T22:00:00.000Z'),
      skills: ['Choose correct waste container', 'Label waste properly', 'Store waste safely'],
      segments: [
        {
          title: 'Waste Handling Basics',
          summary: 'Overview of segregation and labeling.',
          duration: 8,
          videoUrl: 'https://www.youtube.com/watch?v=pDSe4DNSXLo',
          muxPlaybackId: null,
          thumbnailUrl: null,
        },
      ],
      checkpoints: [
        {
          title: 'Waste Sorting',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 60,
          snapshotUrl: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Where should halogenated solvents go?',
              options: ['Regular trash', 'Non-halogenated waste', 'Halogenated waste container'],
              correctIndex: 2,
            },
            {
              prompt: 'What must be on every waste label?',
              options: ['Container color', 'Contents and hazards', 'Instructor name'],
              correctIndex: 1,
            },
            {
              prompt: 'Where should full waste containers be stored?',
              options: ['Near exits', 'In secondary containment', 'On the floor'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
  ];

  const lessonRecords = [];
  const lessonProgressByUser = new Map();

  for (const [index, lessonSeed] of lessonSeeds.entries()) {
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        slug: lessonSeed.slug,
        title: lessonSeed.title,
        summary: lessonSeed.summary,
        description: lessonSeed.description,
        thumbnailUrl: placeholderLessonImage,
        estimatedMinutes: lessonSeed.estimatedMinutes,
        dueDate: lessonSeed.dueDate,
        sortOrder: index,
      },
    });

    const segmentRecords = [];
    for (const [segmentIndex, segmentSeed] of lessonSeed.segments.entries()) {
      const segment = await prisma.lessonSegment.create({
        data: {
          lessonId: lesson.id,
          sortOrder: segmentIndex,
          title: segmentSeed.title,
          summary: segmentSeed.summary,
          duration: segmentSeed.duration,
          videoUrl: segmentSeed.videoUrl,
          muxPlaybackId: segmentSeed.muxPlaybackId,
          thumbnailUrl: segmentSeed.thumbnailUrl,
        },
      });
      segmentRecords.push(segment);
    }

    for (const [skillIndex, skillText] of lessonSeed.skills.entries()) {
      await prisma.lessonSkill.create({
        data: {
          lessonId: lesson.id,
          sortOrder: skillIndex,
          text: skillText,
        },
      });
    }

    for (const [checkpointIndex, checkpointSeed] of lessonSeed.checkpoints.entries()) {
      const linkedSegment = checkpointSeed.segmentIndex != null ? segmentRecords[checkpointSeed.segmentIndex] : null;
      const checkpoint = await prisma.lessonCheckpoint.create({
        data: {
          lessonId: lesson.id,
          segmentId: linkedSegment ? linkedSegment.id : undefined,
          sortOrder: checkpointIndex,
          title: checkpointSeed.title,
          label: checkpointSeed.label,
          meta: checkpointSeed.meta,
          questionCount: checkpointSeed.questionCount,
          timeOffsetSeconds: checkpointSeed.timeOffsetSeconds ?? checkpointIndex * 60,
          snapshotUrl: checkpointSeed.snapshotUrl,
        },
      });

      for (const [questionIndex, questionSeed] of checkpointSeed.questions.entries()) {
        await prisma.checkpointQuestion.create({
          data: {
            checkpointId: checkpoint.id,
            sortOrder: questionIndex,
            prompt: questionSeed.prompt,
            options: questionSeed.options,
            correctIndex: questionSeed.correctIndex,
          },
        });
      }
    }

    lessonRecords.push({ lesson, segments: segmentRecords });
  }

  const lessonBySlug = new Map(lessonRecords.map((entry) => [entry.lesson.slug, entry]));

  const lessonProgressSeeds = [
    {
      slug: 'bunsen-burners',
      status: LessonStatus.IN_PROGRESS,
      percentComplete: 60,
      startedAt: new Date('2025-02-18T14:00:00.000Z'),
      completedCheckpointIndices: [0],
      segments: [{ order: 0, status: SegmentStatus.IN_PROGRESS }],
    },
    {
      slug: 'general-lab-safety',
      status: LessonStatus.IN_PROGRESS,
      percentComplete: 35,
      segments: [{ order: 0, status: SegmentStatus.IN_PROGRESS }],
      completedCheckpointIndices: [0],
    },
    {
      slug: 'top-loading-balance',
      status: LessonStatus.IN_PROGRESS,
      percentComplete: 15,
      segments: [{ order: 0, status: SegmentStatus.IN_PROGRESS }],
      completedCheckpointIndices: [],
    },
    {
      slug: 'graduated-cylinder',
      status: LessonStatus.NOT_STARTED,
      percentComplete: 0,
      segments: [{ order: 0, status: SegmentStatus.NOT_STARTED }],
    },
    {
      slug: 'lab-notebook',
      status: LessonStatus.COMPLETED,
      percentComplete: 100,
      segments: [{ order: 0, status: SegmentStatus.COMPLETED }],
      completedCheckpointIndices: 'all',
    },
    {
      slug: 'volumetric-stock-solutions',
      status: LessonStatus.COMPLETED,
      percentComplete: 100,
      segments: [{ order: 0, status: SegmentStatus.COMPLETED }],
      completedCheckpointIndices: 'all',
    },
    {
      slug: 'general-waste-handling',
      status: LessonStatus.COMPLETED,
      percentComplete: 100,
      segments: [{ order: 0, status: SegmentStatus.COMPLETED }],
      completedCheckpointIndices: 'all',
    },
  ];

  const learningUsers = [studentUser];

  for (const user of learningUsers) {
    const perUserMap = new Map();

    for (const progressSeed of lessonProgressSeeds) {
      const lessonEntry = lessonBySlug.get(progressSeed.slug);
      if (!lessonEntry) continue;

      const progress = await prisma.lessonProgress.create({
        data: {
          studentId: user.id,
          lessonId: lessonEntry.lesson.id,
          status: progressSeed.status,
          percentComplete: progressSeed.percentComplete,
          startedAt: progressSeed.startedAt,
        },
      });

      for (const segmentProgress of progressSeed.segments) {
        const segment = lessonEntry.segments[segmentProgress.order];
        if (!segment) continue;

        await prisma.segmentProgress.create({
          data: {
            lessonProgressId: progress.id,
            segmentId: segment.id,
            status: segmentProgress.status,
          },
        });
      }

      perUserMap.set(progressSeed.slug, progress);
    }

    lessonProgressByUser.set(user.id, perUserMap);
  }

  for (const user of learningUsers) {
    for (const progressSeed of lessonProgressSeeds) {
      if (!progressSeed.completedCheckpointIndices) continue;

      const lessonEntry = lessonBySlug.get(progressSeed.slug);
      if (!lessonEntry) continue;

      const checkpoints = await prisma.lessonCheckpoint.findMany({
        where: { lessonId: lessonEntry.lesson.id },
        orderBy: { sortOrder: 'asc' },
        include: {
          questions: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const indices =
        progressSeed.completedCheckpointIndices === 'all'
          ? checkpoints.map((_, idx) => idx)
          : progressSeed.completedCheckpointIndices;

      const lessonProgress = lessonProgressByUser.get(user.id)?.get(progressSeed.slug) ?? null;

      for (const idx of indices) {
        const checkpoint = checkpoints[idx];
        if (!checkpoint) continue;

        await prisma.checkpointAttempt.create({
          data: {
            checkpointId: checkpoint.id,
            userId: user.id,
            lessonProgressId: lessonProgress?.id ?? null,
            isPassing: true,
            completedAt: new Date(),
            responses: {
              create: checkpoint.questions.map((question) => ({
                checkpointId: checkpoint.id,
                questionId: question.id,
                studentId: user.id,
                lessonProgressId: lessonProgress?.id ?? null,
                selectedIndex: question.correctIndex ?? 0,
                isCorrect: true,
              })),
            },
          },
        });
      }
    }
  }

  const badgeSeeds = [
    {
      slug: 'bunsen-burner-badge',
      name: 'Bunsen Burner Badge',
      description: 'Prove safe usage and understanding of flame control.',
      category: BadgeCategory.EQUIPMENT,
      lessonSlug: 'bunsen-burners',
      studentStatus: {
        status: BadgeStatus.LEARNING,
      },
    },
    {
      slug: 'general-safety-badge',
      name: 'General Lab Safety Badge',
      description: 'Show core lab safety readiness and PPE habits.',
      category: BadgeCategory.SAFETY,
      lessonSlug: 'general-lab-safety',
      studentStatus: {
        status: BadgeStatus.LEARNING,
      },
    },
    {
      slug: 'top-loading-balance-badge',
      name: 'Top-loading Balance Badge',
      description: 'Operate balances accurately and record measurements correctly.',
      category: BadgeCategory.EQUIPMENT,
      lessonSlug: 'top-loading-balance',
      studentStatus: {
        status: BadgeStatus.LEARNING,
      },
    },
    {
      slug: 'graduated-cylinder-badge',
      name: 'Graduated Cylinder Badge',
      description: 'Measure volumes precisely using the correct meniscus technique.',
      category: BadgeCategory.SAFETY,
      lessonSlug: 'graduated-cylinder',
      studentStatus: {
        status: BadgeStatus.LEARNING,
      },
    },
    {
      slug: 'lab-notebook-badge',
      name: 'Lab Notebook Badge',
      description: 'Set up and maintain a compliant lab notebook.',
      category: BadgeCategory.OTHER,
      lessonSlug: 'lab-notebook',
      studentStatus: {
        status: BadgeStatus.READY_FOR_ASSESSMENT,
      },
    },
    {
      slug: 'volumetric-stock-badge',
      name: 'Volumetric Stock Solutions Badge',
      description: 'Prepare accurate stock solutions with volumetric glassware.',
      category: BadgeCategory.EQUIPMENT,
      lessonSlug: 'volumetric-stock-solutions',
      studentStatus: {
        status: BadgeStatus.READY_FOR_FINALIZATION,
        score: 92,
      },
    },
    {
      slug: 'general-waste-badge',
      name: 'General Waste Handling Badge',
      description: 'Segregate and label lab waste correctly.',
      category: BadgeCategory.WASTE,
      lessonSlug: 'general-waste-handling',
      studentStatus: {
        status: BadgeStatus.COMPLETED,
        awardedAt: new Date('2025-02-20T17:00:00.000Z'),
        score: 96,
      },
    },
  ];

  const badgeRecords = [];

  for (const badgeSeed of badgeSeeds) {
    const badge = await prisma.badge.create({
      data: {
        slug: badgeSeed.slug,
        name: badgeSeed.name,
        description: badgeSeed.description,
        category: badgeSeed.category,
      },
    });

    badgeRecords.push(badge);

    const lessonEntry = lessonBySlug.get(badgeSeed.lessonSlug);
    if (lessonEntry) {
      await prisma.badgeRequirement.create({
        data: {
          badgeId: badge.id,
          lessonId: lessonEntry.lesson.id,
          summary: `Complete ${lessonEntry.lesson.title} checkpoints with instructor sign-off.`,
        },
      });
    }

    await prisma.studentBadge.create({
      data: {
        studentId: studentUser.id,
        badgeId: badge.id,
        status: badgeSeed.studentStatus.status,
        awardedAt: badgeSeed.studentStatus.awardedAt,
        score: badgeSeed.studentStatus.score,
      },
    });
  }

  const lessonSurveyQuestions = [
    {
      lessonSlug: 'bunsen-burners',
      question: 'How confident do you feel about your Bunsen burner skills after this lesson?',
    },
    { lessonSlug: 'general-lab-safety', question: 'How was the General Lab Safety lesson?' },
    { lessonSlug: 'top-loading-balance', question: 'How was the Top-loading Balance lesson?' },
    { lessonSlug: 'graduated-cylinder', question: 'How was the Graduated Cylinder lesson?' },
    { lessonSlug: 'lab-notebook', question: 'How was the Lab Notebook lesson?' },
    { lessonSlug: 'volumetric-stock-solutions', question: 'How was the Stock Solutions lesson?' },
    { lessonSlug: 'general-waste-handling', question: 'How was the Waste Handling lesson?' },
  ];

  const lessonSurveyPrompts = [];
  for (const survey of lessonSurveyQuestions) {
    const lessonId = lessonBySlug.get(survey.lessonSlug)?.lesson.id;
    if (!lessonId) continue;

    const prompt = await prisma.surveyPrompt.create({
      data: {
        context: SurveyContext.LESSON,
        lessonId,
        question: survey.question,
      },
    });

    lessonSurveyPrompts.push(prompt);
  }

  const badgeSurveyPrompt = await prisma.surveyPrompt.create({
    data: {
      context: SurveyContext.BADGE,
      badgeId: badgeRecords.find((badge) => badge.slug === 'bunsen-burner-badge')?.id,
      question: 'How satisfied are you with the assessment process for this badge?',
    },
  });

  const incompleteLessonSlugs = new Set([
    'bunsen-burners',
    'general-lab-safety',
    'top-loading-balance',
    'graduated-cylinder',
  ]);

  for (const prompt of lessonSurveyPrompts) {
    const lessonSlug = lessonRecords.find((lr) => lr.lesson.id === prompt.lessonId)?.lesson.slug;
    if (!lessonSlug || incompleteLessonSlugs.has(lessonSlug)) continue;

    await prisma.surveyResponse.create({
      data: {
        promptId: prompt.id,
        studentId: studentUser.id,
        rating: 4,
        comment: 'Feeling much more confident!',
      },
    });
  }

  await prisma.surveyResponse.create({
    data: {
      promptId: badgeSurveyPrompt.id,
      studentId: studentUser.id,
      rating: 4,
      comment: 'Demo badge survey response.',
    },
  });

  console.log('Demo data seeded successfully.');
}

async function main() {
  try {
    await clearExistingData();
    await seedDemo();
  } catch (error) {
    console.error('Failed to seed database', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
