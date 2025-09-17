'use client';

import React, { useState } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { Button } from './components/Button';
import { FeatureCard, FeatureCardProps } from './components/FeatureCard';
import {
  ModernStackDetails,
  StylingFreedomDetails,
  DevToolsDetails,
  ResponsiveDesignDetails,
} from './components/FeatureCard/details';
import styles from './page.module.css';

type FeatureData = Omit<FeatureCardProps, 'onClick' | 'isExpanded'>;

const featureData: FeatureData[] = [
  {
    id: 'modern-stack',
    icon: '🚀',
    title: 'Modern Stack',
    description: 'Next.js 15, React 19, TypeScript. Fast, efficient, and type-safe development.',
    details: <ModernStackDetails />,
  },
  {
    id: 'styling-freedom',
    icon: '🎨',
    title: 'Styling Freedom',
    description: 'Styling agnostic! Choose Tailwind, CSS Modules, Emotion, or your favorite solution.',
    details: <StylingFreedomDetails />,
  },
  {
    id: 'dev-tools',
    icon: '🛠️',
    title: 'Dev Tools Ready',
    description: 'ESLint, Prettier, Husky hooks, and Jest testing pre-configured for quality code.',
    details: <DevToolsDetails />,
  },
  {
    id: 'responsive-design',
    icon: '📱',
    title: 'Responsive Design',
    description: 'Built with a responsive layout in mind. Looks great on all devices.',
    details: <ResponsiveDesignDetails />,
  },
];

export default function HomePage() {
  const openLink = (url: string) => window.open(url, '_blank');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const handleCardClick = (cardId: string) => {
    setExpandedCardId((prevId) => (prevId === cardId ? null : cardId));
  };

  // Split featureData into two columns
  const column1Features = featureData.filter((_, index) => index % 2 === 0);
  const column2Features = featureData.filter((_, index) => index % 2 === 1);

  return (
    <div className={styles.container}>
      <div className={styles.themeToggleContainer}>
        <ThemeToggle />
      </div>

      <main className={styles.pageMain}>
        <section className={styles.heroSection}>
          <h1 className={styles.title}>Spark Your Next Creation! ✨</h1>
          <p className={styles.subtitle}>
            A Next.js & TypeScript template designed for rapid development and learning industry best practices.
          </p>
          <div className={styles.ctaButtons}>
            <Button variant="primary" size="large" onClick={() => openLink('https://nextjs.org/docs')}>
              Explore Next.js Docs
            </Button>
            <Button
              variant="secondary"
              size="large"
              onClick={() => openLink('https://github.com/BU-Spark/TEMPLATE-next-js-starter')}
            >
              View on GitHub
            </Button>
          </div>
        </section>

        <section className={styles.featuresContainer}>
          <div className={styles.featureColumn}>
            {column1Features.map((feature) => (
              <FeatureCard
                key={feature.id}
                {...feature}
                isExpanded={expandedCardId === feature.id}
                onClick={handleCardClick}
              />
            ))}
          </div>
          <div className={styles.featureColumn}>
            {column2Features.map((feature) => (
              <FeatureCard
                key={feature.id}
                {...feature}
                isExpanded={expandedCardId === feature.id}
                onClick={handleCardClick}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>This template is a launchpad for your amazing projects. Happy coding!</p>
      </footer>
    </div>
  );
}
