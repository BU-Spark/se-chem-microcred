export type EnrollmentRole = 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE';
export type RosterRole = 'STUDENT' | 'CHECKER';
export type CourseRole = 'INSTRUCTOR' | 'CHECKER';

export type EnrollmentSummary = {
  id: string;
  role: EnrollmentRole;
  status: EnrollmentStatus;
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
  };
};
