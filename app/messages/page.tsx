'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import shellStyles from '../page.module.css';
import styles from './page.module.css';

type InboxMessage = {
  id: string;
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
  senderName: string | null;
  courseTitle: string | null;
  badgeName: string | null;
};

export default function MessagesPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/messages', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load messages.');
        if (active) setMessages(payload.messages ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load messages.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn) return null;

  const markRead = async (id: string) => {
    // Optimistically flip to read; the PATCH is idempotent server-side.
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, read: true } : message)));
    try {
      await fetch(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH' });
    } catch (err) {
      console.error('Failed to mark message read', err);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (err) {
      console.error('Failed to sign out', err);
      setIsSigningOut(false);
    }
  };

  return (
    <div className={shellStyles.page}>
      <Sidebar
        navItems={SIDEBAR_NAV}
        displayName={user?.fullName ?? ''}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
      />

      <main className={shellStyles.main}>
        <h1 className={styles.title}>Messages</h1>

        {isLoading ? (
          <p className={styles.muted}>Loading messages…</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : messages.length === 0 ? (
          <p className={styles.muted}>No messages yet.</p>
        ) : (
          <ul className={styles.list}>
            {messages.map((message) => (
              <li
                key={message.id}
                className={`${styles.item} ${message.read ? '' : styles.itemUnread}`}
                onClick={message.read ? undefined : () => void markRead(message.id)}
              >
                <div className={styles.itemHeader}>
                  <span className={styles.itemSubject}>{message.subject}</span>
                  <span className={styles.itemDate}>{new Date(message.createdAt).toLocaleDateString()}</span>
                </div>
                <p className={styles.itemMeta}>
                  To: {message.courseTitle ? `${message.courseTitle} – Students` : 'Students'}
                </p>
                <p className={styles.itemMeta}>From: {message.senderName ?? 'your instructor'}</p>
                <p className={styles.itemBody}>{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
