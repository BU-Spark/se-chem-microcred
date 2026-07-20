import { EnrollmentRole } from './enrollment/types';

export function isInstructor(role?: EnrollmentRole | null): boolean {
  return role === 'INSTRUCTOR';
}

export function isChecker(role?: EnrollmentRole | null): boolean {
  return role === 'CHECKER';
}

export function isStudent(role?: EnrollmentRole | null): boolean {
  return role === 'STUDENT';
}

export function isStaff(role?: EnrollmentRole | null): boolean {
  return isInstructor(role) || isChecker(role);
}

export function isRostered(role?: EnrollmentRole | null): boolean {
  return isChecker(role) || isStudent(role);
}
