import { ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /**
   * The content to be rendered inside the error boundary
   */
  children: ReactNode;
  /**
   * Optional fallback component to render when an error occurs
   */
  fallback?: ReactNode;
  /**
   * Optional callback function that will be called when an error occurs
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export interface State {
  hasError: boolean;
  error: Error | null;
}
