import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  // FIX: Replaced the constructor with a class field initializer for the `state`.
  // This is the modern and recommended approach in TypeScript with React and resolves
  // type errors where `this.state` and `this.props` were not being recognized on the class instance.
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg p-4 text-light-text dark:text-dark-text">
          <div className="text-center max-w-lg">
            <h1 className="text-4xl font-bold text-loss mb-4">앱에 문제가 발생했습니다.</h1>
            <p className="mb-6 text-lg">
              죄송합니다. 앱이 예기치 않은 오류로 중단되었습니다.
              페이지를 새로고침하거나, 문제가 계속되면 데이터를 백업에서 복원해 보세요.
            </p>
            <div className="space-x-4">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-lg font-semibold bg-light-primary text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                새로고침
              </button>
            </div>
            {this.state.error && (
              <details className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-left">
                <summary className="cursor-pointer font-semibold">오류 상세 정보 (개발용)</summary>
                <pre className="mt-2 text-sm whitespace-pre-wrap overflow-auto">
                  {this.state.error.toString()}
                  <br />
                  <br />
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
