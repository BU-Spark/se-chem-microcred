'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import { notifyMessagesRead } from '@/app/hooks/useUnreadMessages';
import shellStyles from '../page.module.css';
import styles from './page.module.css';

type Audience = 'DIRECT' | 'ALL_STUDENTS' | 'BADGE_INCOMPLETE';

type InboxMessage = {
  id: string;
  subject: string;
  body: string;
  audience: Audience;
  read: boolean;
  createdAt: string;
  senderName: string | null;
  courseTitle: string | null;
  badgeName: string | null;
};

type SentMessage = {
  id: string;
  subject: string;
  body: string;
  audience: Audience;
  createdAt: string;
  courseTitle: string | null;
  badgeName: string | null;
  recipientName: string | null;
  recipientCount: number;
  readCount: number;
};

type Box = 'received' | 'sent';
type Order = 'newest' | 'oldest';

// Who a message went to, from the receiver's side. A DIRECT message reached
// only them; the blasts name the group so a copied instructor can tell at a
// glance that they were not the target.
function receivedAudienceLabel(message: InboxMessage) {
  const course = message.courseTitle;
  switch (message.audience) {
    case 'ALL_STUDENTS':
      return course ? `${course} – all students` : 'All students';
    case 'BADGE_INCOMPLETE':
      return message.badgeName
        ? `${course ?? 'Course'} – students without ${message.badgeName}`
        : `${course ?? 'Course'} – students without the badge`;
    default:
      return course ? `${course} – you` : 'You';
  }
}

function sentAudienceLabel(message: SentMessage) {
  const course = message.courseTitle;
  switch (message.audience) {
    case 'ALL_STUDENTS':
      return course ? `${course} – all students` : 'All students';
    case 'BADGE_INCOMPLETE':
      return message.badgeName
        ? `${course ?? 'Course'} – students without ${message.badgeName}`
        : `${course ?? 'Course'} – students without the badge`;
    default:
      return message.recipientName ?? 'One student';
  }
}

export default function MessagesPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [box, setBox] = useState<Box>('received');
  const [order, setOrder] = useState<Order>('newest');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [sent, setSent] = useState<SentMessage[]>([]);
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
    // Refetch on every switch rather than caching: read counts move while the
    // page is open, and a stale "3 of 20 read" is worse than a second request.
    setIsLoading(true);
    setError('');
    (async () => {
      try {
        const query = new URLSearchParams();
        if (box === 'sent') query.set('box', 'sent');
        if (order === 'oldest') query.set('order', 'oldest');
        const suffix = query.toString();
        const response = await fetch(suffix ? `/api/messages?${suffix}` : '/api/messages', {
          headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load messages.');
        if (!active) return;
        if (box === 'sent') {
          setSent(payload.messages ?? []);
        } else {
          setMessages(payload.messages ?? []);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load messages.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, box, order]);

  const markRead = useCallback(async (id: string) => {
    // Optimistically flip to read; the PATCH is idempotent server-side.
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, read: true } : message)));
    notifyMessagesRead(-1);
    try {
      await fetch(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH' });
    } catch (err) {
      console.error('Failed to mark message read', err);
      // Put the badge back: the message is still unread on the server.
      notifyMessagesRead(1);
    }
  }, []);

  if (!isLoaded || !isSignedIn) return null;

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

  const isEmpty = box === 'sent' ? sent.length === 0 : messages.length === 0;

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

        <div className={styles.tabs} role="tablist" aria-label="Message boxes">
          <button
            type="button"
            role="tab"
            aria-selected={box === 'received'}
            className={`${styles.tab} ${box === 'received' ? styles.tabActive : ''}`}
            onClick={() => setBox('received')}
          >
            Received
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={box === 'sent'}
            className={`${styles.tab} ${box === 'sent' ? styles.tabActive : ''}`}
            onClick={() => setBox('sent')}
          >
            Sent
          </button>

          <label className={styles.orderControl}>
            <span className={styles.orderLabel}>Sort</span>
            <select
              className={styles.orderSelect}
              value={order}
              onChange={(event) => setOrder(event.target.value as Order)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <p className={styles.muted}>Loading messages…</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : isEmpty ? (
          <p className={styles.muted}>{box === 'sent' ? 'You have not sent any messages.' : 'No messages yet.'}</p>
        ) : box === 'sent' ? (
          <ul className={styles.list}>
            {sent.map((message) => (
              <li key={message.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemSubject}>{message.subject}</span>
                  <span className={styles.itemDate}>{new Date(message.createdAt).toLocaleDateString()}</span>
                </div>
                <p className={styles.itemMeta}>To: {sentAudienceLabel(message)}</p>
                <p className={styles.itemMeta}>
                  <span className={styles.readCount}>
                    {message.readCount} of {message.recipientCount} read
                  </span>
                </p>
                <p className={styles.itemBody}>{message.body}</p>
              </li>
            ))}
          </ul>
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
                <p className={styles.itemMeta}>To: {receivedAudienceLabel(message)}</p>
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
