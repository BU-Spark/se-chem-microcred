'use client';

import { useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import BackButton from '@/app/components/BackButton/BackButton';
import checkdLogo from '../../public/assets/checked_logo.png';
import sapphire from '../../public/edit_avatar/sapphire.svg';
import ruby from '../../public/edit_avatar/ruby.svg';
import emerald from '../../public/edit_avatar/emerald.svg';
import amethyst from '../../public/edit_avatar/amethyst.svg';
import styles from './page.module.css';

const RACE_OPTIONS = [
  'Asian/Pacific Islander',
  'Black/African American',
  'Hispanic/Latino',
  'Native American/Alaskan Native',
  'White/Caucasian',
  'Other',
  'Prefer not to say',
];

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];

const EDUCATION_OPTIONS = [
  'Less than high school',
  'High school diploma or GED',
  'Some college',
  'Associate degree',
  'Bachelors degree',
  'Masters degree',
  'Doctorate or professional degree',
  'Prefer not to say',
];

const PELL_OPTIONS = ['Yes', 'No', 'Not sure', 'Prefer not to say'];

const AVATARS: Array<{ base: string; src: StaticImageData; label: string }> = [
  { base: 'SAPPHIRE', src: sapphire, label: 'Sapphire' },
  { base: 'RUBY', src: ruby, label: 'Ruby' },
  { base: 'EMERALD', src: emerald, label: 'Emerald' },
  { base: 'AMETHYST', src: amethyst, label: 'Amethyst' },
];

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();

  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [races, setRaces] = useState<string[]>([]);
  const [gender, setGender] = useState('');
  const [education, setEducation] = useState('');
  const [pell, setPell] = useState('');
  const [avatarBase, setAvatarBase] = useState<string>('SAPPHIRE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Prefill name from the Clerk profile when available.
  useEffect(() => {
    if (!user) return;
    setFirstName((prev) => prev || user.firstName || '');
    setLastName((prev) => prev || user.lastName || '');
  }, [user]);

  const selectedAvatar = useMemo(() => AVATARS.find((a) => a.base === avatarBase) ?? AVATARS[0], [avatarBase]);
  const fullName = useMemo(() => [firstName.trim(), lastName.trim()].filter(Boolean).join(' '), [firstName, lastName]);

  if (!isLoaded || !isSignedIn) return null;

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleRace = (value: string) => {
    setRaces((prev) => (prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]));
  };

  const handleFinish = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender: gender || null,
          raceEthnicity: races.length ? races.join(', ') : null,
          parentalEducation: education || null,
          pellGrantQualified: pell === 'Yes' ? true : pell === 'No' ? false : null,
          avatarBase,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to complete onboarding.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <Image src={checkdLogo} alt="checkd." className={styles.logo} priority />
      <p className={styles.welcome}>Welcome! Let&apos;s get you started.</p>

      <section className={styles.card}>
        {/* Step 0 — Your Information */}
        {step === 0 ? (
          <>
            <h2 className={styles.cardTitle}>Your Information</h2>
            <div className={styles.fieldList}>
              <input
                className={styles.underlineInput}
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className={styles.underlineInput}
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {/* Step 1 — Demographics: race + gender */}
        {step === 1 ? (
          <>
            <h2 className={styles.cardTitle}>Demographic Information</h2>
            <div className={styles.questionBlock}>
              <p className={styles.question}>Which of the following best describes your race/ethnicity?</p>
              <div className={styles.checkList}>
                {RACE_OPTIONS.map((option) => (
                  <label key={option} className={styles.checkRow}>
                    <input type="checkbox" checked={races.includes(option)} onChange={() => toggleRace(option)} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.questionBlock}>
              <p className={styles.question}>Which of the following best describes your gender?</p>
              <select className={styles.select} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Make selection</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {/* Step 2 — Demographics: education + Pell */}
        {step === 2 ? (
          <>
            <h2 className={styles.cardTitle}>Demographic Information</h2>
            <div className={styles.questionBlock}>
              <p className={styles.question}>
                What is the highest degree of education completed by one of your parents?
              </p>
              <select className={styles.select} value={education} onChange={(e) => setEducation(e.target.value)}>
                <option value="">Make selection</option>
                {EDUCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.questionBlock}>
              <p className={styles.question}>Do you qualify for Pell Grant in your financial aid package?</p>
              <select className={styles.select} value={pell} onChange={(e) => setPell(e.target.value)}>
                <option value="">Make selection</option>
                {PELL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {/* Step 3 — Choose your character */}
        {step === 3 ? (
          <>
            <h2 className={styles.cardTitle}>Choose your character</h2>
            <p className={styles.cardSubtitle}>You can edit this later.</p>
            <div className={styles.avatarGrid}>
              {AVATARS.map((avatar) => {
                const isSelected = avatar.base === avatarBase;
                return (
                  <button
                    key={avatar.base}
                    type="button"
                    className={`${styles.avatarOption} ${isSelected ? styles.avatarOptionSelected : ''}`}
                    onClick={() => setAvatarBase(avatar.base)}
                    aria-pressed={isSelected}
                    aria-label={avatar.label}
                  >
                    <Image src={avatar.src} alt={avatar.label} width={96} height={96} className={styles.avatarImage} />
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {/* Step 4 — All set */}
        {step === 4 ? (
          <div className={styles.allSet}>
            <h2 className={styles.allSetTitle}>You&apos;re ready to start learning.</h2>
            <div className={styles.allSetAvatar}>
              <Image src={selectedAvatar.src} alt={selectedAvatar.label} width={200} height={200} />
            </div>
            <p className={styles.allSetName}>{fullName || 'Your Name'}</p>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button type="button" className={styles.letsGo} onClick={handleFinish} disabled={isSubmitting}>
              {isSubmitting ? 'Setting up…' : "Let's go!"}
            </button>
          </div>
        ) : null}

        {/* Footer nav (hidden on the final step, which has its own CTA) */}
        {step < 4 ? (
          <div className={styles.cardFooter}>
            {step > 0 ? <BackButton inline onClick={goBack} /> : null}
            <button type="button" className={styles.nextButton} onClick={goNext}>
              Next
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
