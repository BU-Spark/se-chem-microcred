/**
 * user.types.ts
 *
 * This directory (app/types/) is intended for shared TypeScript type definitions and interfaces
 * that might be used across different parts of the application.
 * For example, you might define shapes for API responses, data models, or complex prop types.
 *
 * This file defines a simple User interface.
 */

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  roles: Role[];
  createdAt: Date;
  updatedAt: Date;
}

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
  EDITOR = 'EDITOR',
}

// Example of a more complex type that might use the User interface
export interface UserProfilePageData {
  user: User;
  recentActivity: ActivityLog[];
  preferences: UserPreferences;
}

export interface ActivityLog {
  id: string;
  timestamp: Date;
  action: string;
  details?: Record<string, unknown>;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
  };
  language: string;
}
