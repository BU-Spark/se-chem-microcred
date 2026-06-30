/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Additive CHEM101 seed.
 *
 * Creates a self-contained "CHEM101" course with three users — one per role —
 * so you can sign in to Clerk and walk every flow (instructor / student /
 * assessor) end to end. It does NOT wipe the database: it only ever touches
 * the CHEM101 course, seeded badges/lessons, and the three
 * test users below. Everything else in the (shared) DB is left untouched.
 *
 * Idempotent — safe to re-run. Users / course / enrollments are upserted
 * (their ids stay stable, so existing Clerk links keep working); the lesson
 * and badge content is torn down (scoped) and rebuilt fresh each run.
 *
 * Run with: npm run db:seed
 *
 * The instructor email comes from SEEDED_DEMO_EMAIL when provided. The student
 * and assessor use Clerk test emails.
 * instance you can sign each of them up with the fixed OTP 424242 — no real
 */

// DATABASE_URL lives in .env.local (Next.js convention); load it so `node`
// picks it up — the Prisma CLI only auto-loads .env, not .env.local.
require('dotenv').config({ path: '.env.local' });

const {
  PrismaClient,
  AvatarAccessory,
  AvatarBase,
  AvatarFace,
  BadgeCategory,
  BadgeStatus,
  CourseContactType,
  CourseRole,
  LessonStatus,
  SegmentStatus,
  SurveyContext,
} = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Tunables — edit the instructor email to your real address if you'd rather
// be the instructor under an existing Clerk account.
// ---------------------------------------------------------------------------
const COURSE_CODE = 'CHEM101';
const ASSESSOR_CODE = 'CHECK101';
const COURSE_SECTION = 'K1';
const LEGACY_PLAYTEST_CODE = 'PLAYTEST';
const LEGACY_SLUG_PREFIX = 'pt-';
const seedSlug = (slug) => slug;
const SEEDED_DEMO_EMAIL = process.env.SEEDED_DEMO_EMAIL?.trim().toLowerCase() || 'instructor+clerk_test@gmail.com';

const PEOPLE = {
  instructor: {
    email: SEEDED_DEMO_EMAIL,
    name: 'Instructor(Spark!)',
    buid: 'CHEM-INSTR',
    gender: 'Prefer not to say',
    raceEthnicity: 'Prefer not to say',
    parentalEducation: 'Prefer not to say',
    pellGrantQualified: false,
  },
  student: {
    email: 'student+clerk_test@bu.edu',
    name: 'Jane Student',
    buid: 'CHEM-STUD',
    gender: 'Female',
    raceEthnicity: 'White',
    parentalEducation: 'Masters degree',
    pellGrantQualified: false,
  },
  checker: {
    email: 'checker+clerk_test@bu.edu',
    name: 'Alex Checker',
    buid: 'CHEM-CHKR',
    gender: 'Female',
    raceEthnicity: 'White',
    parentalEducation: 'Bachelors degree',
    pellGrantQualified: true,
  },
};

const placeholderLessonImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// Content data for the canonical CHEM101 course.
// ---------------------------------------------------------------------------
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

const badgeSeeds = [
  {
    slug: 'bunsen-burner-badge',
    name: 'Bunsen Burner Badge',
    description: 'Prove safe usage and understanding of flame control.',
    category: BadgeCategory.EQUIPMENT,
    lessonSlug: 'bunsen-burners',
    studentStatus: { status: BadgeStatus.LEARNING },
  },
  {
    slug: 'general-safety-badge',
    name: 'General Lab Safety Badge',
    description: 'Show core lab safety readiness and PPE habits.',
    category: BadgeCategory.SAFETY,
    lessonSlug: 'general-lab-safety',
    studentStatus: { status: BadgeStatus.LEARNING },
  },
  {
    slug: 'top-loading-balance-badge',
    name: 'Top-loading Balance Badge',
    description: 'Operate balances accurately and record measurements correctly.',
    category: BadgeCategory.EQUIPMENT,
    lessonSlug: 'top-loading-balance',
    studentStatus: { status: BadgeStatus.LEARNING },
  },
  {
    slug: 'graduated-cylinder-badge',
    name: 'Graduated Cylinder Badge',
    description: 'Measure volumes precisely using the correct meniscus technique.',
    category: BadgeCategory.SAFETY,
    lessonSlug: 'graduated-cylinder',
    studentStatus: { status: BadgeStatus.LEARNING },
  },
  {
    slug: 'lab-notebook-badge',
    name: 'Lab Notebook Badge',
    description: 'Set up and maintain a compliant lab notebook.',
    category: BadgeCategory.OTHER,
    lessonSlug: 'lab-notebook',
    // Ready for the assessor to grade — this is the assessor's queue.
    studentStatus: { status: BadgeStatus.READY_FOR_ASSESSMENT },
  },
  {
    slug: 'volumetric-stock-badge',
    name: 'Volumetric Stock Solutions Badge',
    description: 'Prepare accurate stock solutions with volumetric glassware.',
    category: BadgeCategory.EQUIPMENT,
    lessonSlug: 'volumetric-stock-solutions',
    // Passed assessment — student still owes the finalization survey.
    studentStatus: { status: BadgeStatus.READY_FOR_FINALIZATION, score: 92 },
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

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function upsertPeople() {
  const result = {};
  for (const [key, person] of Object.entries(PEOPLE)) {
    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [{ email: person.email }, { buid: person.buid }],
      },
    });
    const userByEmail = existingUsers.find((user) => user.email === person.email);
    const userByBuid = existingUsers.find((user) => user.buid === person.buid);
    const existingUser = userByEmail ?? userByBuid;
    const buidBelongsToAnotherUser = Boolean(userByEmail && userByBuid && userByEmail.id !== userByBuid.id);
    const userData = {
      email: person.email,
      name: person.name,
      gender: person.gender,
      raceEthnicity: person.raceEthnicity,
      parentalEducation: person.parentalEducation,
      pellGrantQualified: person.pellGrantQualified,
      ...(buidBelongsToAnotherUser ? {} : { buid: person.buid }),
    };

    if (buidBelongsToAnotherUser) {
      console.warn(
        `[seed] ${key}: email ${person.email} and BUID ${person.buid} belong to different users; ` +
          `keeping existing email user ${userByEmail.id} and leaving BUID owner ${userByBuid.id} unchanged.`
      );
    }

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: userData,
        })
      : await prisma.user.create({
          data: { ...userData, buid: person.buid },
        });

    await prisma.avatarSetting.upsert({
      where: { studentId: user.id },
      update: {
        base: AvatarBase.SAPPHIRE,
        face: AvatarFace.SMILE,
        accessory: AvatarAccessory.LEAF,
      },
      create: {
        studentId: user.id,
        base: AvatarBase.SAPPHIRE,
        face: AvatarFace.SMILE,
        accessory: AvatarAccessory.LEAF,
      },
    });

    result[key] = user;
  }
  return result;
}

async function ensureCourse(instructor) {
  let course = await prisma.course.findFirst({
    where: { code: COURSE_CODE },
  });

  if (!course) {
    course = await prisma.course.create({
      data: {
        code: COURSE_CODE,
        assessorCode: ASSESSOR_CODE,
        section: COURSE_SECTION,
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
  } else {
    course = await prisma.course.update({
      where: { id: course.id },
      data: {
        assessorCode: ASSESSOR_CODE,
        section: COURSE_SECTION,
        title: 'Chem 101: Safety Foundations',
        sectionCount: 2,
        description:
          'Introductory laboratory safety course covering flame safety, waste handling, and ventilation best practices.',
        createdById: instructor.id,
      },
    });

    await prisma.courseSettings.upsert({
      where: { courseId: course.id },
      update: {
        allowCooldownOverride: true,
        allowAssessorMessages: true,
        allowCrossSectionView: true,
      },
      create: {
        courseId: course.id,
        allowCooldownOverride: true,
        allowAssessorMessages: true,
        allowCrossSectionView: true,
      },
    });
  }

  return course;
}

async function ensureEnrollments(course, people) {
  const plan = [
    { user: people.instructor, role: CourseRole.INSTRUCTOR },
    { user: people.student, role: CourseRole.STUDENT },
    { user: people.checker, role: CourseRole.CHECKER },
  ];

  for (const { user, role } of plan) {
    const sections = role === CourseRole.INSTRUCTOR ? [] : [{ section: COURSE_SECTION }];
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: user.id, courseId: course.id } },
      update: { role, status: 'ACTIVE', sections: { deleteMany: {}, create: sections } },
      create: { studentId: user.id, courseId: course.id, role, status: 'ACTIVE', sections: { create: sections } },
    });
  }
}

async function pruneSeedCourseEnrollments(course, people) {
  const seededUserIds = Object.values(people).map((user) => user.id);
  await prisma.enrollment.deleteMany({
    where: {
      courseId: course.id,
      studentId: { notIn: seededUserIds },
    },
  });
}

/**
 * Scoped teardown deletes only the seeded content graph so the rebuild
 * below starts clean. There are no cascade rules on this graph, so children
 * are removed before parents.
 */
async function teardownContent(course, badgeIds) {
  const lessons = await prisma.lesson.findMany({
    where: { courseId: course.id },
    select: { id: true },
  });
  const lessonIds = lessons.map((l) => l.id);

  const checkpoints = await prisma.lessonCheckpoint.findMany({
    where: { lessonId: { in: lessonIds } },
    select: { id: true },
  });
  const checkpointIds = checkpoints.map((c) => c.id);

  const lessonProgresses = await prisma.lessonProgress.findMany({
    where: { lessonId: { in: lessonIds } },
    select: { id: true },
  });
  const lessonProgressIds = lessonProgresses.map((p) => p.id);

  const prompts = await prisma.surveyPrompt.findMany({
    where: { OR: [{ lessonId: { in: lessonIds } }, { badgeId: { in: badgeIds } }] },
    select: { id: true },
  });
  const promptIds = prompts.map((p) => p.id);

  // Checkpoint answer/attempt graph
  await prisma.checkpointResponse.deleteMany({ where: { checkpointId: { in: checkpointIds } } });
  await prisma.checkpointAttempt.deleteMany({ where: { checkpointId: { in: checkpointIds } } });
  await prisma.checkpointQuestion.deleteMany({ where: { checkpointId: { in: checkpointIds } } });
  await prisma.lessonCheckpoint.deleteMany({ where: { lessonId: { in: lessonIds } } });

  // Lesson progress graph
  await prisma.segmentProgress.deleteMany({ where: { lessonProgressId: { in: lessonProgressIds } } });
  await prisma.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });

  // Lesson detail rows
  await prisma.lessonSkill.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await prisma.lessonSegment.deleteMany({ where: { lessonId: { in: lessonIds } } });

  // Surveys (lesson- or badge-scoped)
  await prisma.surveyResponse.deleteMany({ where: { promptId: { in: promptIds } } });
  await prisma.surveyPrompt.deleteMany({ where: { id: { in: promptIds } } });

  // Badge graph (assessmentAttempt cascades to its criterion responses)
  await prisma.assessmentAttempt.deleteMany({ where: { badgeId: { in: badgeIds } } });
  await prisma.studentBadge.deleteMany({ where: { badgeId: { in: badgeIds } } });
  await prisma.badgeRequirement.deleteMany({ where: { badgeId: { in: badgeIds } } });
  await prisma.badge.deleteMany({ where: { id: { in: badgeIds } } });

  // Course contacts (recreated below)
  await prisma.courseContact.deleteMany({ where: { courseId: course.id } });

  // Finally the lessons themselves
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
}

async function seededBadgeIdsForCourse(courseId, extraSlugWhere = []) {
  const requirements = await prisma.badgeRequirement.findMany({
    where: { lesson: { is: { courseId } } },
    select: { badgeId: true },
  });
  const badges = await prisma.badge.findMany({
    where: {
      OR: [{ id: { in: requirements.map((requirement) => requirement.badgeId) } }, ...extraSlugWhere],
    },
    select: { id: true },
  });

  return badges.map((badge) => badge.id);
}

async function cleanupLegacyPlaytestCourse() {
  const legacyCourse = await prisma.course.findFirst({
    where: { code: LEGACY_PLAYTEST_CODE },
    select: { id: true },
  });

  if (!legacyCourse) return;

  const legacyBadgeIds = await seededBadgeIdsForCourse(legacyCourse.id, [{ slug: { startsWith: LEGACY_SLUG_PREFIX } }]);
  await teardownContent(legacyCourse, legacyBadgeIds);
  await prisma.message.deleteMany({ where: { courseId: legacyCourse.id } });
  await prisma.courseContact.deleteMany({ where: { courseId: legacyCourse.id } });
  await prisma.enrollment.deleteMany({ where: { courseId: legacyCourse.id } });
  await prisma.courseSettings.deleteMany({ where: { courseId: legacyCourse.id } });
  await prisma.course.delete({ where: { id: legacyCourse.id } });
}

async function buildLessons(course) {
  const lessonBySlug = new Map();

  for (const [index, lessonSeed] of lessonSeeds.entries()) {
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        slug: seedSlug(lessonSeed.slug),
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
        data: { lessonId: lesson.id, sortOrder: skillIndex, text: skillText },
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

    lessonBySlug.set(lessonSeed.slug, { lesson, segments: segmentRecords });
  }

  return lessonBySlug;
}

async function buildLessonProgress(student, lessonBySlug) {
  const progressBySlug = new Map();

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

    progressBySlug.set(progressSeed.slug, progress);
  }

  // Checkpoint attempts for completed checkpoints
  for (const progressSeed of lessonProgressSeeds) {
    if (!progressSeed.completedCheckpointIndices) continue;
    const lessonEntry = lessonBySlug.get(progressSeed.slug);
    if (!lessonEntry) continue;

    const checkpoints = await prisma.lessonCheckpoint.findMany({
      where: { lessonId: lessonEntry.lesson.id },
      orderBy: { sortOrder: 'asc' },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    const indices =
      progressSeed.completedCheckpointIndices === 'all'
        ? checkpoints.map((_, idx) => idx)
        : progressSeed.completedCheckpointIndices;

    const lessonProgress = progressBySlug.get(progressSeed.slug) ?? null;

    for (const idx of indices) {
      const checkpoint = checkpoints[idx];
      if (!checkpoint) continue;

      await prisma.checkpointAttempt.create({
        data: {
          checkpointId: checkpoint.id,
          userId: student.id,
          lessonProgressId: lessonProgress?.id ?? null,
          isPassing: true,
          completedAt: new Date(),
          responses: {
            create: checkpoint.questions.map((question) => ({
              checkpointId: checkpoint.id,
              questionId: question.id,
              studentId: student.id,
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

async function buildBadges(student, lessonBySlug) {
  const badgeBySlug = new Map();

  for (const badgeSeed of badgeSeeds) {
    const badge = await prisma.badge.create({
      data: {
        slug: seedSlug(badgeSeed.slug),
        name: badgeSeed.name,
        description: badgeSeed.description,
        category: badgeSeed.category,
      },
    });
    badgeBySlug.set(badgeSeed.slug, badge);

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

  return badgeBySlug;
}

async function buildCourseContacts(course) {
  await prisma.courseContact.createMany({
    data: [
      {
        courseId: course.id,
        type: CourseContactType.INSTRUCTOR,
        name: 'Gilstrap, Jackson',
        email: PEOPLE.instructor.email,
        avatarUrl: '/edit_avatar/emerald.svg',
      },
      {
        courseId: course.id,
        type: CourseContactType.CHECKER,
        name: 'Checker, Alex',
        email: PEOPLE.checker.email,
        avatarUrl: '/edit_avatar/amethyst.svg',
      },
    ],
  });
}

async function buildSurveys(student, lessonBySlug, badgeBySlug) {
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

  const promptBySlug = new Map();
  for (const survey of lessonSurveyQuestions) {
    const lessonId = lessonBySlug.get(survey.lessonSlug)?.lesson.id;
    if (!lessonId) continue;
    const prompt = await prisma.surveyPrompt.create({
      data: { context: SurveyContext.LESSON, lessonId, question: survey.question },
    });
    promptBySlug.set(survey.lessonSlug, prompt);
  }

  const badgeSurveyPrompt = await prisma.surveyPrompt.create({
    data: {
      context: SurveyContext.BADGE,
      badgeId: badgeBySlug.get('bunsen-burner-badge')?.id,
      question: 'How satisfied are you with the assessment process for this badge?',
    },
  });

  const incompleteLessonSlugs = new Set([
    'bunsen-burners',
    'general-lab-safety',
    'top-loading-balance',
    'graduated-cylinder',
  ]);

  for (const [slug, prompt] of promptBySlug.entries()) {
    if (incompleteLessonSlugs.has(slug)) continue;
    await prisma.surveyResponse.create({
      data: { promptId: prompt.id, studentId: student.id, rating: 4, comment: 'Feeling much more confident!' },
    });
  }

  await prisma.surveyResponse.create({
    data: { promptId: badgeSurveyPrompt.id, studentId: student.id, rating: 4, comment: 'Demo badge survey response.' },
  });
}

async function ensureAnalytics(people) {
  await prisma.studentAnalytics.upsert({
    where: { studentId: people.student.id },
    update: {
      hoursLearning: 6,
      badgesCompleted: 1,
      badgesReadyForAssessment: 1,
      badgesNotAttempted: 0,
      questionsAnswered: 6,
    },
    create: {
      studentId: people.student.id,
      hoursLearning: 6,
      badgesCompleted: 1,
      badgesReadyForAssessment: 1,
      badgesNotAttempted: 0,
      questionsAnswered: 6,
      averageAssessmentScore: 0,
      highestAssessmentScore: 0,
    },
  });

  for (const key of ['instructor', 'checker']) {
    await prisma.studentAnalytics.upsert({
      where: { studentId: people[key].id },
      update: {},
      create: { studentId: people[key].id },
    });
  }
}

async function main() {
  console.log('Seeding additive CHEM101 demo data...');

  const people = await upsertPeople();
  await cleanupLegacyPlaytestCourse();
  const course = await ensureCourse(people.instructor);
  await ensureEnrollments(course, people);
  await pruneSeedCourseEnrollments(course, people);

  const seededBadgeSlugs = badgeSeeds.map((badge) => seedSlug(badge.slug));
  const existingBadgeIds = await seededBadgeIdsForCourse(course.id, [
    { slug: { in: seededBadgeSlugs } },
    { slug: { startsWith: LEGACY_SLUG_PREFIX } },
  ]);
  await teardownContent(course, existingBadgeIds);

  const lessonBySlug = await buildLessons(course);
  await buildLessonProgress(people.student, lessonBySlug);
  const badgeBySlug = await buildBadges(people.student, lessonBySlug);
  await buildCourseContacts(course);
  await buildSurveys(people.student, lessonBySlug, badgeBySlug);
  await ensureAnalytics(people);

  console.log('\nCHEM101 seed complete.');
  console.log(`  Course: ${course.title} (${COURSE_CODE} ${COURSE_SECTION})  id=${course.id}`);
  console.log(`  Shared course code: ${COURSE_CODE}`);
  console.log('  Sign in to Clerk with these emails (dev OTP 424242):');
  console.log(`    INSTRUCTOR  ${people.instructor.email}  id=${people.instructor.id}`);
  console.log(`    STUDENT     ${people.student.email}  id=${people.student.id}`);
  console.log(`    ASSESSOR    ${people.checker.email}  id=${people.checker.id}`);
}

main()
  .catch((error) => {
    console.error('CHEM101 seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
