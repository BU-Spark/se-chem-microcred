import React from 'react';
import styles from '../FeatureCard.module.css'; // Assuming styles are needed for links/lists

export const ResponsiveDesignDetails = () => {
  return (
    <>
      <p className={styles.detailIntroParagraph}>
        Ensuring your application looks and functions flawlessly across all device sizes (desktops, tablets, and
        mobiles) is crucial for user experience and accessibility.
      </p>

      {/* Core Principles */}
      <h4 className={styles.detailSubheading}>
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Responsive/Responsive_design_building_blocks"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.featureLink}
        >
          <strong>Core Principles of RWD</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Fluid Grids: Relative units for layout widths (%, vw).</li>
        <li className={styles.detailListItem}>Flexible Images/Media: Scale within containers, prevent overflow.</li>
        <li className={styles.detailListItem}>
          Media Queries: CSS rules based on device characteristics (viewport, orientation).
        </li>
      </ul>

      {/* Benefits */}
      <h4 className={styles.detailSubheading}>Benefits of Responsive Design</h4>
      <ul>
        <li className={styles.detailListItem}>Better UX: Consistent experience across devices, higher satisfaction.</li>
        <li className={styles.detailListItem}>Improved SEO: Google favors mobile-friendly sites.</li>
        <li className={styles.detailListItem}>Wider Reach & Accessibility: Accessible on all devices.</li>
      </ul>

      {/* Testing */}
      <h4 className={styles.detailSubheading}>Testing Responsive Design</h4>
      <ul>
        <li className={styles.detailListItem}>Browser DevTools: Simulate various screen sizes/resolutions.</li>
        <li className={styles.detailListItem}>Real Device Testing: Catch emulator-missed issues.</li>
        <li className={styles.detailListItem}>Test Orientations: Portrait and landscape modes.</li>
      </ul>
    </>
  );
};
