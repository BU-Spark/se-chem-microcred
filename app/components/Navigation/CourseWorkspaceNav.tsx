import Link from 'next/link';
import styles from './CourseWorkspaceNav.module.css';

type CourseWorkspaceNavProps = {
  courseId: string;
  role: 'student' | 'instructor' | 'assessor';
  active: 'overview' | 'content' | 'students' | 'credentials' | 'assessments' | 'settings';
};

export default function CourseWorkspaceNav({ courseId, role, active }: CourseWorkspaceNavProps) {
  const overviewHref =
    role === 'student'
      ? `/course_dashboard?courseId=${courseId}`
      : `/courses/${courseId}${role === 'assessor' ? '?view=assessor' : ''}`;
  const links = [
    { id: 'overview', label: 'Overview', href: overviewHref },
    ...(role === 'student'
      ? []
      : [{ id: 'students', label: 'Students', href: `/roster?courseId=${courseId}&role=STUDENT` }]),
    { id: 'credentials', label: 'Credentials', href: `${overviewHref}#credentials` },
    ...(role === 'student'
      ? []
      : [{ id: 'assessments', label: 'Assessments', href: `/roster?courseId=${courseId}&role=STUDENT` }]),
    ...(role === 'instructor'
      ? [{ id: 'settings', label: 'Settings', href: `/courses/new?courseId=${courseId}` }]
      : []),
  ] as const;

  return (
    <nav className={styles.nav} aria-label="Course workspace">
      {links.map((link) => (
        <Link key={link.id} href={link.href} className={active === link.id ? styles.active : styles.link}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
