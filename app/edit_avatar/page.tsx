'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import BackButton from '../_components/BackButton';
import styles from './page.module.css';

type Step = 'base' | 'face' | 'accessory';

type AvatarOption = {
  id: 'ruby' | 'emerald' | 'sapphire' | 'amethyst';
  label: string;
  image: string;
};

type FaceExpression = 'smile' | 'surprised' | 'mischief';

type FaceOption = {
  id: string;
  label: string;
  tagline: string;
  baseColor: string;
  highlightColor: string;
  accentColor: string;
  expression: FaceExpression;
};

type AccessoryKind = 'leaf' | 'fedora' | 'propeller';

type AccessoryOption = {
  id: string;
  label: string;
  tagline: string;
  kind: AccessoryKind;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
};

const steps: Step[] = ['base', 'face', 'accessory'];

const avatarOptions: AvatarOption[] = [
  { id: 'ruby', label: 'Ruby', image: '/edit_avatar/ruby.svg' },
  { id: 'emerald', label: 'Emerald', image: '/edit_avatar/emerald.svg' },
  { id: 'sapphire', label: 'Sapphire', image: '/edit_avatar/sapphire.svg' },
  { id: 'amethyst', label: 'Amethyst', image: '/edit_avatar/amethyst.svg' },
];

const faceOptions: Record<AvatarOption['id'], FaceOption[]> = {
  ruby: [
    {
      id: 'ruby-glow',
      label: 'Ruby Glow',
      tagline: 'Bright smiles and ready to learn.',
      baseColor: '#e65b7a',
      highlightColor: '#f7a3b7',
      accentColor: '#7b203a',
      expression: 'smile',
    },
    {
      id: 'ruby-wow',
      label: 'Ruby Wonder',
      tagline: 'Curious and full of surprise.',
      baseColor: '#e65b7a',
      highlightColor: '#f7a3b7',
      accentColor: '#7b203a',
      expression: 'surprised',
    },
    {
      id: 'ruby-spark',
      label: 'Ruby Spark',
      tagline: 'Playful with a dash of sass.',
      baseColor: '#e65b7a',
      highlightColor: '#f7a3b7',
      accentColor: '#7b203a',
      expression: 'mischief',
    },
  ],
  emerald: [
    {
      id: 'emerald-happy',
      label: 'Emerald Beam',
      tagline: 'Calm, cool, and confident.',
      baseColor: '#48b678',
      highlightColor: '#9be5bd',
      accentColor: '#1d6141',
      expression: 'smile',
    },
    {
      id: 'emerald-curious',
      label: 'Emerald Wonder',
      tagline: 'Always asking the next question.',
      baseColor: '#48b678',
      highlightColor: '#9be5bd',
      accentColor: '#1d6141',
      expression: 'surprised',
    },
    {
      id: 'emerald-clever',
      label: 'Emerald Clever',
      tagline: 'Strategic with a sly grin.',
      baseColor: '#48b678',
      highlightColor: '#9be5bd',
      accentColor: '#1d6141',
      expression: 'mischief',
    },
  ],
  sapphire: [
    {
      id: 'sapphire-bright',
      label: 'Sapphire Shine',
      tagline: 'Optimistic and upbeat.',
      baseColor: '#4a88dc',
      highlightColor: '#a4cbff',
      accentColor: '#1f4a84',
      expression: 'smile',
    },
    {
      id: 'sapphire-curious',
      label: 'Sapphire Wonder',
      tagline: 'Wide-eyed and ready.',
      baseColor: '#4a88dc',
      highlightColor: '#a4cbff',
      accentColor: '#1f4a84',
      expression: 'surprised',
    },
    {
      id: 'sapphire-witty',
      label: 'Sapphire Witty',
      tagline: 'A quick thinker with humor.',
      baseColor: '#4a88dc',
      highlightColor: '#a4cbff',
      accentColor: '#1f4a84',
      expression: 'mischief',
    },
  ],
  amethyst: [
    {
      id: 'amethyst-soft',
      label: 'Amethyst Calm',
      tagline: 'Soft-hearted and warm.',
      baseColor: '#8a6add',
      highlightColor: '#c4b3f3',
      accentColor: '#463290',
      expression: 'smile',
    },
    {
      id: 'amethyst-astonish',
      label: 'Amethyst Astonished',
      tagline: 'Surprised and delighted.',
      baseColor: '#8a6add',
      highlightColor: '#c4b3f3',
      accentColor: '#463290',
      expression: 'surprised',
    },
    {
      id: 'amethyst-quirk',
      label: 'Amethyst Quirk',
      tagline: 'Quirky with personality.',
      baseColor: '#8a6add',
      highlightColor: '#c4b3f3',
      accentColor: '#463290',
      expression: 'mischief',
    },
  ],
};

const baseAccessoryOptions: AccessoryOption[] = [
  {
    id: 'leaf',
    label: 'Leaf Sprout',
    tagline: 'A hint of nature and growth.',
    kind: 'leaf',
    primaryColor: '#7dcf71',
    secondaryColor: '#53b85b',
  },
  {
    id: 'fedora',
    label: 'Field Fedora',
    tagline: 'Sharp focus with classic style.',
    kind: 'fedora',
    primaryColor: '#2f2f2f',
    secondaryColor: '#5c4b3c',
    accentColor: '#f5d18c',
  },
  {
    id: 'propeller',
    label: 'Whirly Cap',
    tagline: 'Playful energy and motion.',
    kind: 'propeller',
    primaryColor: '#3f82f0',
    secondaryColor: '#f8c24f',
    accentColor: '#e65b7a',
  },
];

const accessoryOptions: Record<AvatarOption['id'], AccessoryOption[]> = avatarOptions.reduce(
  (acc, avatar) => ({
    ...acc,
    [avatar.id]: baseAccessoryOptions.map((option) => ({
      ...option,
      id: `${avatar.id}-${option.id}`,
    })),
  }),
  {} as Record<AvatarOption['id'], AccessoryOption[]>
);

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className={styles.arrowIcon} viewBox="0 0 24 24" fill="none" stroke="#2e6aa9" strokeWidth={2}>
      {direction === 'left' ? (
        <path d="M14.5 5 8.5 12l6 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9.5 5 15.5 12l-6 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function FacePreview({ option, large = false }: { option: FaceOption; large?: boolean }) {
  const className = [styles.facePreview, large ? styles.facePreviewLarge : ''].filter(Boolean).join(' ');
  const mouth = (() => {
    switch (option.expression) {
      case 'smile':
        return (
          <path
            d="M50 105 Q80 125 110 105"
            fill="none"
            stroke={option.accentColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'surprised':
        return <ellipse cx={80} cy={110} rx={12} ry={14} fill={option.accentColor} />;
      case 'mischief':
        return (
          <path
            d="M52 108 Q80 126 108 110"
            fill="none"
            stroke={option.accentColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="rotate(-5 80 110)"
          />
        );
      default:
        return null;
    }
  })();

  const leftBrow = option.expression === 'mischief' ? 'M45 70 L65 65' : 'M45 68 L65 68';
  const rightBrow = option.expression === 'mischief' ? 'M95 65 L115 70' : 'M95 68 L115 68';

  return (
    <svg className={className} viewBox="0 0 160 160" role="img" aria-hidden>
      <circle cx={80} cy={80} r={70} fill={option.baseColor} />
      <ellipse cx={55} cy={55} rx={38} ry={26} fill={option.highlightColor} opacity={0.35} />
      <ellipse cx={60} cy={90} rx={18} ry={13} fill="#ffffff" />
      <ellipse cx={100} cy={90} rx={18} ry={13} fill="#ffffff" />
      <circle cx={60} cy={92} r={7} fill={option.accentColor} />
      <circle cx={100} cy={92} r={7} fill={option.accentColor} />
      <path d={leftBrow} stroke={option.accentColor} strokeWidth={4} strokeLinecap="round" />
      <path d={rightBrow} stroke={option.accentColor} strokeWidth={4} strokeLinecap="round" />
      {mouth}
    </svg>
  );
}

function HatPreview({ option, large = false }: { option: AccessoryOption; large?: boolean }) {
  const className = [styles.hatPreview, large ? styles.hatPreviewLarge : ''].filter(Boolean).join(' ');
  if (option.kind === 'leaf') {
    return (
      <svg className={className} viewBox="0 0 160 160" role="img" aria-hidden>
        <path d="M80 130 C78 110 82 86 80 70" stroke={option.secondaryColor} strokeWidth={6} strokeLinecap="round" />
        <path
          d="M80 60 C120 35 125 15 110 30 C95 45 90 55 92 70 C88 65 75 60 65 55 C50 47 35 58 50 70 C65 82 70 88 70 100"
          fill={option.primaryColor}
          opacity={0.8}
        />
      </svg>
    );
  }
  if (option.kind === 'fedora') {
    return (
      <svg className={className} viewBox="0 0 160 160" role="img" aria-hidden>
        <ellipse cx={80} cy={112} rx={58} ry={16} fill={option.secondaryColor} />
        <path d="M54 88 L106 88 L118 116 L42 116 Z" fill={option.primaryColor} />
        <rect x={46} y={92} width={68} height={10} fill={option.accentColor ?? '#f5d18c'} />
        <path d="M62 70 L98 70 L106 92 L54 92 Z" fill={option.primaryColor} />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 160 160" role="img" aria-hidden>
      <ellipse cx={80} cy={122} rx={50} ry={14} fill={option.secondaryColor} />
      <circle cx={80} cy={92} r={32} fill={option.primaryColor} />
      <path d="M70 62 H90" stroke={option.accentColor ?? '#ffffff'} strokeWidth={6} strokeLinecap="round" />
      <path d="M80 62 V42" stroke={option.accentColor ?? '#ffffff'} strokeWidth={6} strokeLinecap="round" />
      <path d="M60 44 L72 52" stroke={option.accentColor ?? '#ffffff'} strokeWidth={6} strokeLinecap="round" />
      <path d="M88 52 L100 44" stroke={option.accentColor ?? '#ffffff'} strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
}

export default function EditAvatarPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption['id'] | null>(null);
  const [selectedFaces, setSelectedFaces] = useState<Record<string, string>>({});
  const [selectedAccessories, setSelectedAccessories] = useState<Record<string, string>>({});

  const step = steps[stepIndex];

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (stepIndex > 0 && !selectedAvatar) {
      setStepIndex(0);
    }
  }, [stepIndex, selectedAvatar]);

  const selectedFaceId = selectedAvatar ? selectedFaces[selectedAvatar] : undefined;
  const selectedAccessoryId = selectedAvatar ? selectedAccessories[selectedAvatar] : undefined;

  useEffect(() => {
    if (step === 'face' && selectedAvatar) {
      const options = faceOptions[selectedAvatar] ?? [];
      if (options.length && (!selectedFaceId || !options.some((option) => option.id === selectedFaceId))) {
        setSelectedFaces((prev) => ({ ...prev, [selectedAvatar]: options[0].id }));
      }
    }
  }, [step, selectedAvatar, selectedFaceId]);

  useEffect(() => {
    if (step === 'accessory' && selectedAvatar) {
      const options = accessoryOptions[selectedAvatar] ?? [];
      if (options.length && (!selectedAccessoryId || !options.some((option) => option.id === selectedAccessoryId))) {
        setSelectedAccessories((prev) => ({ ...prev, [selectedAvatar]: options[0].id }));
      }
    }
  }, [step, selectedAvatar, selectedAccessoryId]);

  const faceData = useMemo(() => {
    if (!selectedAvatar) {
      return { options: [] as FaceOption[], selected: null, prev: null, next: null, index: 0 };
    }
    const options = faceOptions[selectedAvatar] ?? [];
    if (!options.length) {
      return { options, selected: null, prev: null, next: null, index: 0 };
    }
    const fallbackId =
      selectedFaceId && options.some((option) => option.id === selectedFaceId) ? selectedFaceId : options[0].id;
    const index = Math.max(
      options.findIndex((option) => option.id === fallbackId),
      0
    );
    const selected = options[index];
    const prev = options[(index - 1 + options.length) % options.length];
    const next = options[(index + 1) % options.length];
    return { options, selected, prev, next, index };
  }, [selectedAvatar, selectedFaceId]);

  const accessoryData = useMemo(() => {
    if (!selectedAvatar) {
      return { options: [] as AccessoryOption[], selected: null, prev: null, next: null, index: 0 };
    }
    const options = accessoryOptions[selectedAvatar] ?? [];
    if (!options.length) {
      return { options, selected: null, prev: null, next: null, index: 0 };
    }
    const fallbackId =
      selectedAccessoryId && options.some((option) => option.id === selectedAccessoryId)
        ? selectedAccessoryId
        : options[0].id;
    const index = Math.max(
      options.findIndex((option) => option.id === fallbackId),
      0
    );
    const selected = options[index];
    const prev = options[(index - 1 + options.length) % options.length];
    const next = options[(index + 1) % options.length];
    return { options, selected, prev, next, index };
  }, [selectedAvatar, selectedAccessoryId]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const nextDisabled =
    step === 'base' ? !selectedAvatar : step === 'face' ? !faceData.selected : !accessoryData.selected;
  const nextLabel = step === 'accessory' ? 'Save' : 'Next';

  const handleNext = () => {
    if (step === 'accessory') {
      router.push('/profile');
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const cycleFace = (direction: -1 | 1) => {
    if (!selectedAvatar || !faceData.selected || faceData.options.length <= 1) {
      return;
    }
    const { options, index } = faceData;
    const nextIndex = (index + direction + options.length) % options.length;
    setSelectedFaces((prev) => ({ ...prev, [selectedAvatar]: options[nextIndex].id }));
  };

  const cycleAccessory = (direction: -1 | 1) => {
    if (!selectedAvatar || !accessoryData.selected || accessoryData.options.length <= 1) {
      return;
    }
    const { options, index } = accessoryData;
    const nextIndex = (index + direction + options.length) % options.length;
    setSelectedAccessories((prev) => ({ ...prev, [selectedAvatar]: options[nextIndex].id }));
  };

  const copy = {
    base: { title: 'Choose an avatar' },
    face: { title: 'Select a face' },
    accessory: { title: 'Pick a fun hat!' },
  }[step];

  const baseLabel = avatarOptions.find((option) => option.id === selectedAvatar)?.label ?? '';

  return (
    <div className={styles.page}>
      <div className={styles.backdropPattern} aria-hidden="true" />
      <div className={styles.modal}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{copy.title}</h1>
        </div>

        {step === 'base' && (
          <div className={styles.avatarGrid}>
            {avatarOptions.map((option) => {
              const isSelected = option.id === selectedAvatar;
              const buttonClass = [styles.avatarButton, isSelected ? styles.avatarButtonSelected : '']
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  type="button"
                  key={option.id}
                  className={buttonClass}
                  onClick={() => setSelectedAvatar(option.id)}
                >
                  <span className={styles.avatarPreviewRing}>
                    <Image
                      src={option.image}
                      alt={`${option.label} avatar`}
                      width={192}
                      height={192}
                      className={styles.avatarPreview}
                    />
                  </span>
                  <span className={isSelected ? styles.avatarLabelSelected : styles.avatarLabel}>{option.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'face' && selectedAvatar && faceData.selected && (
          <div className={styles.stepContent}>
            <div className={styles.carousel}>
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => cycleFace(-1)}
                disabled={faceData.options.length <= 1}
                aria-label="Previous face option"
              >
                <ArrowIcon direction="left" />
              </button>
              <div className={styles.carouselTrack}>
                {faceData.options.length > 1 ? (
                  <button
                    type="button"
                    className={styles.optionShell}
                    onClick={() => setSelectedFaces((prev) => ({ ...prev, [selectedAvatar]: faceData.prev!.id }))}
                    aria-label={`Choose ${faceData.prev!.label}`}
                  >
                    <FacePreview option={faceData.prev!} />
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className={[styles.optionShell, styles.optionShellPrimary].join(' ')}>
                  <FacePreview option={faceData.selected} large />
                </div>
                {faceData.options.length > 1 ? (
                  <button
                    type="button"
                    className={styles.optionShell}
                    onClick={() => setSelectedFaces((prev) => ({ ...prev, [selectedAvatar]: faceData.next!.id }))}
                    aria-label={`Choose ${faceData.next!.label}`}
                  >
                    <FacePreview option={faceData.next!} />
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => cycleFace(1)}
                disabled={faceData.options.length <= 1}
                aria-label="Next face option"
              >
                <ArrowIcon direction="right" />
              </button>
            </div>
            <div className={styles.optionLabel}>{baseLabel}</div>
          </div>
        )}

        {step === 'accessory' && selectedAvatar && accessoryData.selected && (
          <div className={styles.stepContent}>
            <div className={styles.carousel}>
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => cycleAccessory(-1)}
                disabled={accessoryData.options.length <= 1}
                aria-label="Previous accessory option"
              >
                <ArrowIcon direction="left" />
              </button>
              <div className={styles.carouselTrack}>
                {accessoryData.options.length > 1 ? (
                  <button
                    type="button"
                    className={styles.optionShell}
                    onClick={() =>
                      setSelectedAccessories((prev) => ({ ...prev, [selectedAvatar]: accessoryData.prev!.id }))
                    }
                    aria-label={`Choose ${accessoryData.prev!.label}`}
                  >
                    <HatPreview option={accessoryData.prev!} />
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className={[styles.optionShell, styles.optionShellPrimary].join(' ')}>
                  <HatPreview option={accessoryData.selected} large />
                </div>
                {accessoryData.options.length > 1 ? (
                  <button
                    type="button"
                    className={styles.optionShell}
                    onClick={() =>
                      setSelectedAccessories((prev) => ({ ...prev, [selectedAvatar]: accessoryData.next!.id }))
                    }
                    aria-label={`Choose ${accessoryData.next!.label}`}
                  >
                    <HatPreview option={accessoryData.next!} />
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
              <button
                type="button"
                className={styles.arrowButton}
                onClick={() => cycleAccessory(1)}
                disabled={accessoryData.options.length <= 1}
                aria-label="Next accessory option"
              >
                <ArrowIcon direction="right" />
              </button>
            </div>
            <div className={styles.optionLabel}>{baseLabel}</div>
          </div>
        )}

        <div className={styles.footer}>
          {step === 'base' ? (
            <>
              <Link href="/profile" className={styles.cancelButton}>
                Cancel
              </Link>
              <button type="button" className={styles.nextButton} onClick={handleNext} disabled={nextDisabled}>
                Next
              </button>
            </>
          ) : (
            <>
              <BackButton inline onClick={handleBack} />
              <button type="button" className={styles.nextButton} onClick={handleNext} disabled={nextDisabled}>
                {nextLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
