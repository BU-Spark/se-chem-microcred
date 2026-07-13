'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import styles from './page.module.css';
import { useDatabaseDisplayNameContext } from '@/app/components/Profile/DatabaseDisplayNameProvider';

type AvatarOption = {
  id: 'ruby' | 'emerald' | 'sapphire' | 'amethyst';
  label: string;
  image: string;
  base: string;
};

const avatarOptions: AvatarOption[] = [
  { id: 'ruby', label: 'Ruby', image: '/edit_avatar/ruby.svg', base: 'RUBY' },
  { id: 'emerald', label: 'Emerald', image: '/edit_avatar/emerald.svg', base: 'EMERALD' },
  { id: 'sapphire', label: 'Sapphire', image: '/edit_avatar/sapphire.svg', base: 'SAPPHIRE' },
  { id: 'amethyst', label: 'Amethyst', image: '/edit_avatar/amethyst.svg', base: 'AMETHYST' },
];

export default function EditAvatarPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { setAvatarBase } = useDatabaseDisplayNameContext();
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption['id'] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const handleSave = async () => {
    if (!selectedAvatar || isSaving) {
      return;
    }
    const base = avatarOptions.find((option) => option.id === selectedAvatar)?.base;
    if (!base) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base }),
      });
      if (!response.ok) {
        throw new Error('Failed to save avatar');
      }
      // Warm the shared cache so /profile shows the new avatar on arrival.
      setAvatarBase(base);
      router.push('/profile');
    } catch (err) {
      console.error('Failed to save avatar', err);
      setError('Could not save your avatar. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.backdropPattern} aria-hidden="true" />
      <div className={styles.modal}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Choose an avatar</h1>
        </div>

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

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <Link href="/profile" className={styles.cancelButton}>
            Cancel
          </Link>
          <button
            type="button"
            className={styles.nextButton}
            onClick={handleSave}
            disabled={!selectedAvatar || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
