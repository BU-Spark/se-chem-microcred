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

const prisma = new PrismaClient();

const placeholderLessonImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=';

async function clearExistingData() {
  await prisma.$transaction([
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
    prisma.user.deleteMany(),
    prisma.course.deleteMany(),
  ]);
}

async function seedDemo() {
  console.log('Seeding demo data...');

  const course = await prisma.course.create({
    data: {
      code: 'CHEM101',
      section: 'K1',
      title: 'Chem 101: Safety Foundations',
      description:
        'Introductory laboratory safety course covering flame safety, waste handling, and ventilation best practices.',
    },
  });

  const student = await prisma.user.create({
    data: {
      email: 'student@example.edu',
      name: 'Student Demo',
      buid: 'U1234567',
      gender: 'Female',
      raceEthnicity: 'Asian',
      parentalEducation: 'Masters degree',
      pellGrantQualified: true,
    },
  });

  await prisma.avatarSetting.create({
    data: {
      studentId: student.id,
      base: AvatarBase.SAPPHIRE,
      face: AvatarFace.SMILE,
      accessory: AvatarAccessory.LEAF,
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      courseId: course.id,
    },
  });

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

  await prisma.studentAnalytics.create({
    data: {
      studentId: student.id,
      hoursLearning: 10,
      badgesCompleted: 4,
      badgesReadyForAssessment: 2,
      badgesNotAttempted: 2,
      questionsAnswered: 30,
      averageAssessmentScore: 70,
      highestAssessmentScore: 92,
    },
  });

  const lessonSeeds = [
    {
      slug: 'bunsen-burners',
      title: 'Bunsen Burners',
      summary: 'Get hands-on with Bunsen burners while reviewing flame safety and lab etiquette.',
      description:
        'This unit walks through each phase of the burner demonstration with instructor checkpoints to confirm understanding.',
      estimatedMinutes: 45,
      dueDate: new Date('2025-03-01T22:00:00.000Z'),
      skills: [
        'Identify burner parts and functions',
        'Adjust flame height for desired heat',
        'Demonstrate proper safety checks',
      ],
      segments: [
        {
          title: 'Ignition & Setup',
          summary: 'Review the equipment and ignite the burner safely.',
          duration: 6,
          videoUrl: 'https://www.youtube.com/watch?v=zxQyTK8quyY',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1521790797524-b2497295b8a0?auto=format&fit=crop&w=200&q=80',
        },
        {
          title: 'Flame Control',
          summary: 'Adjust flame height and color for optimal heat.',
          duration: 7,
          videoUrl: 'https://www.youtube.com/watch?v=Nhk7pyoNf3k',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=200&q=80',
        },
        {
          title: 'Shutdown & Storage',
          summary: 'Properly power down and store burner equipment.',
          duration: 5,
          videoUrl: 'https://www.youtube.com/watch?v=tj5l0y7muf4',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=200&q=80',
        },
      ],
      checkpoints: [
        {
          title: 'Part 1',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 80,
          snapshotUrl: 'https://images.unsplash.com/photo-1513379733131-47fc74b45fc7?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Which step must you complete before opening the gas valve?',
              options: ['Check hose connections', 'Light the match', 'Turn on room ventilation'],
              correctIndex: 0,
            },
            {
              prompt: 'What flame color indicates efficient combustion?',
              options: ['Orange', 'Blue', 'Yellow'],
              correctIndex: 1,
            },
            {
              prompt: 'Where should you point the burner when igniting?',
              options: ['Straight up', 'Toward a heat shield', 'Away from yourself and others'],
              correctIndex: 2,
            },
          ],
        },
        {
          title: 'Part 2',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 1,
          timeOffsetSeconds: 220,
          snapshotUrl: 'https://images.unsplash.com/photo-1495305379050-64540d6ee95a?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'Which control adjusts the flame height on most burners?',
              options: ['Air intake', 'Gas flow knob', 'Spark switch'],
              correctIndex: 1,
            },
            {
              prompt: 'How often should you check the flame while heating?',
              options: ['Constantly', 'Every 5 minutes', 'Only after you start'],
              correctIndex: 0,
            },
            {
              prompt: 'A noisy flame usually means:',
              options: ['Too much gas', 'Too little air', 'Too much air'],
              correctIndex: 2,
            },
          ],
        },
        {
          title: 'Part 3',
          label: 'Final checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 2,
          timeOffsetSeconds: 360,
          snapshotUrl: 'https://images.unsplash.com/photo-1520275126937-9506f7dd123c?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'What should you do before leaving the burner unattended?',
              options: ['Nothing, it is safe', 'Turn off gas and flame', 'Raise the flame to maximum'],
              correctIndex: 1,
            },
            {
              prompt: 'Where do you place hot equipment to cool?',
              options: ['Directly on the bench', 'On a heatproof mat', 'In a cabinet'],
              correctIndex: 1,
            },
            {
              prompt: 'Which log entry is required after completing the lesson?',
              options: ['None', 'Equipment checkout log', 'Waste disposal log'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'waste-handling',
      title: 'Waste Handling',
      summary: 'Separate lab waste streams and dispose of materials safely.',
      description:
        'Break down the handling, labeling, and disposal steps for different waste categories before reassessment.',
      estimatedMinutes: 25,
      dueDate: new Date('2025-03-05T22:00:00.000Z'),
      skills: [
        'Differentiate hazardous vs. non-hazardous waste',
        'Label waste containers accurately',
        'Follow spill response protocol',
      ],
      segments: [
        {
          title: 'Waste Categories Overview',
          summary: 'Understand the main waste streams in the lab.',
          duration: 8,
          videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=200&q=80',
        },
        {
          title: 'Labeling & Storage',
          summary: 'Prepare containers and maintain storage logs.',
          duration: 9,
          videoUrl: 'https://www.youtube.com/watch?v=Hc79sDi3f0U',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1580894899372-64032616e35e?auto=format&fit=crop&w=200&q=80',
        },
      ],
      checkpoints: [
        {
          title: 'Waste Sorting',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 120,
          snapshotUrl: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'A solvent contaminated with heavy metals belongs in which container?',
              options: ['Regular trash', 'Aqueous waste', 'Hazardous organic waste'],
              correctIndex: 2,
            },
            {
              prompt: 'Broken glass without biohazard exposure goes in:',
              options: ['Sharps bin', 'Glass-only disposal box', 'Hazardous waste bag'],
              correctIndex: 1,
            },
            {
              prompt: 'Which symbol indicates biohazardous material?',
              options: ['Radiation trefoil', 'Biohazard icon', 'Explosive sign'],
              correctIndex: 1,
            },
          ],
        },
      ],
    },
    {
      slug: 'vent-hood-safety',
      title: 'Vent Hood Safety',
      summary: 'Maintain proper ventilation practices while working with volatile substances.',
      description:
        'Learn how to set up, operate, and monitor ventilation hoods to keep air quality and pressure in safe ranges.',
      estimatedMinutes: 30,
      dueDate: new Date('2025-03-08T22:00:00.000Z'),
      skills: [
        'Set correct sash height before starting work',
        'Position materials for optimal airflow',
        'Log daily hood inspections',
      ],
      segments: [
        {
          title: 'Hood Setup',
          summary: 'Inspect and prepare the hood for operation.',
          duration: 7,
          videoUrl: 'https://www.youtube.com/watch?v=AEKKd6jM2rI',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=200&q=80',
        },
        {
          title: 'Working Position',
          summary: 'Arrange tools and samples to maintain airflow.',
          duration: 8,
          videoUrl: 'https://www.youtube.com/watch?v=1gHn_tJQAFg',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=200&q=80',
        },
        {
          title: 'Shutdown Checklist',
          summary: 'Leave the hood ready for the next user.',
          duration: 6,
          videoUrl: 'https://www.youtube.com/watch?v=DGKiTCPGr0k',
          muxPlaybackId: 'V7A4p02m9b4Bp027DHBnpyXrEw0101',
          thumbnailUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=200&q=80',
        },
      ],
      checkpoints: [
        {
          title: 'Inspection Review',
          label: 'Checkpoint',
          meta: '3 questions',
          questionCount: 3,
          segmentIndex: 0,
          timeOffsetSeconds: 100,
          snapshotUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=320&q=80',
          questions: [
            {
              prompt: 'What is the ideal sash height indicator?',
              options: ['Yellow mark', 'Green mark', 'Red mark'],
              correctIndex: 1,
            },
            {
              prompt: 'If airflow alarm sounds, you should:',
              options: ['Continue working', 'Lower the sash and pause work', 'Turn off the alarm'],
              correctIndex: 1,
            },
            {
              prompt: 'Which log entry is required after inspection?',
              options: ['User initials and time', 'Daily supply order', 'Sample inventory'],
              correctIndex: 0,
            },
          ],
        },
      ],
    },
  ];

  const lessonRecords = [];

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
      percentComplete: 75,
      startedAt: new Date('2025-02-18T14:00:00.000Z'),
      segments: [
        { order: 0, status: SegmentStatus.COMPLETED },
        { order: 1, status: SegmentStatus.IN_PROGRESS },
        { order: 2, status: SegmentStatus.NOT_STARTED },
      ],
    },
    {
      slug: 'waste-handling',
      status: LessonStatus.NOT_STARTED,
      percentComplete: 0,
      segments: [
        { order: 0, status: SegmentStatus.NOT_STARTED },
        { order: 1, status: SegmentStatus.NOT_STARTED },
      ],
    },
    {
      slug: 'vent-hood-safety',
      status: LessonStatus.NOT_STARTED,
      percentComplete: 0,
      segments: [
        { order: 0, status: SegmentStatus.NOT_STARTED },
        { order: 1, status: SegmentStatus.NOT_STARTED },
        { order: 2, status: SegmentStatus.NOT_STARTED },
      ],
    },
  ];

  for (const progressSeed of lessonProgressSeeds) {
    const lessonEntry = lessonBySlug.get(progressSeed.slug);
    if (!lessonEntry) continue;

    const progress = await prisma.lessonProgress.create({
      data: {
        studentId: student.id,
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
  }

  const badgeSeeds = [
    {
      slug: 'bunsen-burner-badge',
      name: 'Bunsen Burner Badge',
      description: 'Prove safe usage and understanding of flame control.',
      category: BadgeCategory.EQUIPMENT,
      lessonSlug: 'bunsen-burners',
      studentStatus: {
        status: BadgeStatus.COMPLETED,
        awardedAt: new Date('2025-02-22T17:00:00.000Z'),
        score: 92,
      },
    },
    {
      slug: 'vent-hood-badge',
      name: 'Vent Hood Badge',
      description: 'Maintain safe ventilation practices and demonstrate proper hood operation.',
      category: BadgeCategory.SAFETY,
      lessonSlug: 'vent-hood-safety',
      studentStatus: {
        status: BadgeStatus.READY_FOR_ASSESSMENT,
      },
    },
    {
      slug: 'waste-handling-badge',
      name: 'Waste Handling Badge',
      description: 'Organize, store, and monitor chemical waste to maintain compliance.',
      category: BadgeCategory.WASTE,
      lessonSlug: 'waste-handling',
      studentStatus: {
        status: BadgeStatus.LEARNING,
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
        studentId: student.id,
        badgeId: badge.id,
        status: badgeSeed.studentStatus.status,
        awardedAt: badgeSeed.studentStatus.awardedAt,
        score: badgeSeed.studentStatus.score,
      },
    });
  }

  const lessonSurvey = await prisma.surveyPrompt.create({
    data: {
      context: SurveyContext.LESSON,
      lessonId: lessonBySlug.get('bunsen-burners')?.lesson.id,
      question: 'How confident do you feel about your Bunsen burner skills after this lesson?',
    },
  });

  const badgeSurvey = await prisma.surveyPrompt.create({
    data: {
      context: SurveyContext.BADGE,
      badgeId: badgeRecords.find((badge) => badge.slug === 'bunsen-burner-badge')?.id,
      question: 'How satisfied are you with the assessment process for this badge?',
    },
  });

  await prisma.surveyResponse.create({
    data: {
      promptId: lessonSurvey.id,
      studentId: student.id,
      rating: 4,
      comment: 'Feeling much more confident lighting the burner!',
    },
  });

  await prisma.surveyResponse.create({
    data: {
      promptId: badgeSurvey.id,
      studentId: student.id,
      rating: 5,
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
