import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary]', error);
  }

  retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="dashboard-card">
          <h3>模块异常</h3>
          <p>当前模块已降级，不影响全局使用。</p>
          <button type="button" onClick={this.retry}>
            一键重试
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
