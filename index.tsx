import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { runMigrations } from './services/migrationService';
import ErrorBoundary from './components/ErrorBoundary';

// 앱이 렌더링되기 전에 데이터 마이그레이션을 실행합니다.
// useLocalStorage 훅은 초기 로드 시 마이그레이션된 데이터를 읽게 됩니다.
// 페이지 새로고침은 AI Studio 환경에서 문제를 일으킬 수 있으므로 제거되었습니다.
runMigrations();

const AppWrapper: React.FC = () => {
  const [appKey, setAppKey] = useState(0);

  // 이 함수는 데이터 복원이나 가져오기가 완료된 후 호출되어,
  // App 컴포넌트의 key를 변경함으로써 전체 리렌더링(리마운트)을 강제합니다.
  // 이 방법은 AI Studio와 같은 샌드박스 환경에서 window.location.reload()보다 훨씬 안전합니다.
  const forceRemount = useCallback(() => {
    setAppKey(prevKey => prevKey + 1);
  }, []);

  return <App key={appKey} onForceRemount={forceRemount} />;
};


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppWrapper />
    </ErrorBoundary>
  </React.StrictMode>
);
