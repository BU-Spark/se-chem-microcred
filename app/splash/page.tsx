'use client';

import { useUser } from '@clerk/nextjs';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import checkedLogo from '../../public/assets/checked_logo.png';
import splashHero from '../../public/assets/splash-hero.gif';
import styles from './splash.module.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function SplashPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  // Marketing splash is for signed-out visitors only. Anyone already
  // authenticated is sent straight to their dashboard at "/".
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <div className={`${styles.page} ${jakarta.className}`}>
      <header className={styles.header}>
        <Link href="/splash" aria-label="checkd home">
          <Image src={checkedLogo} alt="checkd logo" className={styles.logo} width={115} height={32} priority />
        </Link>
        <nav className={styles.nav}>
          <Link href="/sign-in" className={styles.navLogin}>
            Login
          </Link>
          <Link href="/sign-up" className={styles.navSignup}>
            Sign Up
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.pill}>
            <span className={styles.pillDot} />
            Verified, real-world skill credentials
          </div>
          <h1 className={styles.heroTitle}>
            Prove what you
            <br />
            can actually <span className={styles.heroTitleAccent}>do.</span>
          </h1>
          <p className={styles.heroText}>
            Earn, track, and showcase microcredentials in one streamlined platform designed for modern learners and
            organizations.
          </p>
          <div className={styles.heroActions}>
            <Link href="/sign-up" className={styles.ctaPrimary}>
              Get Started <span className={styles.ctaArrow}>→</span>
            </Link>
            <a href="#how" className={styles.ctaSecondary}>
              See how it works
            </a>
          </div>
        </div>

        <div className={styles.badgeStage}>
          <Image
            src={splashHero}
            alt="Animated preview of earning a verified skill badge"
            className={styles.heroGif}
            priority
            unoptimized
          />
        </div>
      </section>

      <section id="how" className={styles.how}>
        <div className={styles.howInner}>
          <div className={styles.howHeading}>
            <div className={styles.howEyebrow}>The process</div>
            <h2 className={styles.howTitle}>How It Works</h2>
          </div>
          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}>
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </div>
              <div className={styles.cardNumber}>01</div>
              <h3 className={styles.cardTitle}>Learn &amp; precheck</h3>
              <p className={styles.cardText}>
                Learners watch a short video and complete a precheck assessment to confirm they understand the lesson
                content.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}>
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
              </div>
              <div className={styles.cardNumber}>02</div>
              <h3 className={styles.cardTitle}>Show your skill</h3>
              <p className={styles.cardText}>
                They receive a QR code to show an assessor, who watches them perform the task in person and grades
                accordingly.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}>
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="9" r="6" />
                  <path d="M9 14.5 7.5 22l4.5-2.5L16.5 22 15 14.5" />
                </svg>
              </div>
              <div className={styles.cardNumber}>03</div>
              <h3 className={styles.cardTitle}>Earn the badge</h3>
              <p className={styles.cardText}>
                If the learner receives a passing grade, they earn a verifiable badge for that skill to showcase
                anywhere.
              </p>
            </div>
          </div>
          <div className={styles.howFooter}>
            <Link href="/sign-up" className={styles.ctaPrimary}>
              Get Started <span className={styles.ctaArrow}>→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
