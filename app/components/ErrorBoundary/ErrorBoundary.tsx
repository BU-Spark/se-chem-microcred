'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundaryProps, State } from './ErrorBoundary.types';

/**
 * ErrorBoundary is a React component that catches JavaScript errors anywhere in their child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 *
 * How it works:
 * 1. When an error occurs in a child component, the ErrorBoundary catches it
 * 2. The componentDidCatch lifecycle method is called with the error and error info
 * 3. The state is updated to indicate an error has occurred
 * 4. The render method returns either the fallback UI or the children
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary
 *   fallback={<div>Something went wrong!</div>}
 *   onError={(error, errorInfo) => {
 *     console.error('Error:', error);
 *     console.error('Error Info:', errorInfo);
 *   }}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * This lifecycle method is called when an error occurs in a child component.
   * It receives the error and errorInfo as parameters.
   *
   * @param error - The error that was thrown
   * @param errorInfo - An object with a componentStack key containing information about which component threw the error
   */
  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  /**
   * This lifecycle method is called after an error has been thrown in a child component.
   * It's a good place to log the error to an error reporting service.
   *
   * @param error - The error that was thrown
   * @param errorInfo - An object with a componentStack key containing information about which component threw the error
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        this.props.fallback || (
          <div className="error-boundary">
            <h2>Something went wrong</h2>
            <details>
              <summary>Error Details</summary>
              <pre>{this.state.error?.message}</pre>
            </details>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
