import { render, screen } from '@testing-library/react';
import StudentProfileCard from './index';

describe('StudentProfileCard', () => {
  it('renders student, course, and contact information', () => {
    render(
      <StudentProfileCard
        kicker="Student Info:"
        headlineTop="Demo,"
        headlineBottom="Student"
        email="student@example.edu"
        externalId="U123"
        avatarAlt="Student avatar"
        avatarFallback="DS"
        courseTitle="Chemistry"
        courseSectionsLabel="Section: A"
        contactTitle="Instructor"
        contactName="Professor Demo"
        contactEmail="prof@example.edu"
        contactFallback="PD"
        emptyContactMessage="No instructor assigned."
      />
    );
    expect(screen.getByText('student@example.edu')).toBeInTheDocument();
    expect(screen.getByText(/Chemistry/)).toBeInTheDocument();
    expect(screen.getByText('Professor Demo')).toBeInTheDocument();
  });
});
