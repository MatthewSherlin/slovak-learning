import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg, #0a0b10)',
            color: 'var(--text, #eef1f8)',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '24px',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          {this.state.error && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-dim, #6b7289)',
                maxWidth: '400px',
                margin: 0,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            style={{
              marginTop: '8px',
              padding: '10px 24px',
              borderRadius: '999px',
              background: 'var(--accent, #5ea4f7)',
              color: '#0a0b10',
              border: 'none',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
