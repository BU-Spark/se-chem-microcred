'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((args: { error?: Error; reset: () => void }) => ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: undefined,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;

      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, reset: this.handleReset });
      }

      if (fallback) {
        return fallback;
      }

      return (
        <section role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Something went wrong.</h2>
          <p style={{ marginBottom: '1.5rem' }}>
            Try reloading the page or reach out to the team if the issue persists.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '999px',
              border: 'none',
              background: '#1f5fab',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
