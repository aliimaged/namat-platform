import { Component } from 'react';

/**
 * React error boundary to catch JavaScript errors in child components.
 * Renders a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '480px',
            margin: '48px auto',
          }}
        >
          <h2 style={{ marginBottom: '12px', fontSize: '1.25rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            We're sorry, something unexpected happened. Please refresh the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              fontSize: '0.875rem',
              backgroundColor: '#6000FF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
