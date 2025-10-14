
import React from 'react';
import { Screen } from '../types';
import { HomeIcon, ChartLineIcon, ListBulletIcon, ArrowsRightLeftIcon, Cog8ToothIcon, WalletIcon, CurrencyWonIcon, CalendarDaysIcon } from './Icons';
import { NAV_ITEMS } from '../constants';


interface BottomNavProps {
  currentScreen: Screen;
  setCurrentScreen: (screen: Screen) => void;
  appVersion: string;
}

const iconMap: Record<Screen, React.ComponentType<{ className: string }>> = {
  [Screen.Home]: HomeIcon,
  [Screen.StockStatus]: ChartLineIcon,
  [Screen.AccountStatus]: WalletIcon,
  [Screen.TradeHistory]: ListBulletIcon,
  [Screen.AccountTransactions]: ArrowsRightLeftIcon,
  [Screen.ProfitManagement]: CurrencyWonIcon,
  [Screen.MonthlyHistory]: CalendarDaysIcon,
  [Screen.Index]: Cog8ToothIcon,
};

// 각 메뉴가 활성화되었을 때 적용할 색상 맵을 추가했습니다.
const activeColorMap: Record<Screen, string> = {
  [Screen.Home]: '', // 홈 버튼 스타일은 별도로 관리됩니다.
  [Screen.StockStatus]: 'text-green-600 dark:text-green-400',
  [Screen.AccountStatus]: 'text-amber-600 dark:text-amber-400',
  [Screen.TradeHistory]: 'text-indigo-600 dark:text-indigo-400',
  [Screen.ProfitManagement]: 'text-rose-600 dark:text-rose-400',
  [Screen.MonthlyHistory]: 'text-sky-600 dark:text-sky-400',
  [Screen.Index]: 'text-slate-600 dark:text-slate-400',
  [Screen.AccountTransactions]: 'text-cyan-600 dark:text-cyan-400',
};


const labelMap: Record<string, string> = {
  '종목 현황': '종목현황',
  '계좌 현황': '계좌현황',
  '홈': '홈',
  '매매기록': '매매기록',
  '수익 관리': '수익관리',
  '월말 결산': '월말결산',
  '설정': '설정',
};

const NavItem: React.FC<{
  item: { screen: Screen; label: string };
  isActive: boolean;
  onClick: () => void;
}> = ({ item, isActive, onClick }) => {
  const Icon = iconMap[item.screen];
  const shortLabel = labelMap[item.label] || item.label;
  
  // 활성화 상태에 따라 색상 맵에서 해당 색상을 가져옵니다.
  const activeColor = activeColorMap[item.screen];
  // 활성화 인디케이터 바의 배경색을 텍스트 색상 클래스에서 동적으로 생성합니다.
  const activeBgColor = activeColor.replace(/text/g, 'bg');

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs font-medium transition-all duration-200 ${
        isActive ? activeColor : 'text-light-secondary dark:text-dark-secondary'
      }`}
    >
      {Icon && <Icon className="w-6 h-6 mb-1" />}
      <span>{shortLabel}</span>
      {isActive && <div className={`absolute bottom-0 h-1 w-4 rounded-full ${activeBgColor}`}></div>}
    </button>
  );
};


const BottomNav: React.FC<BottomNavProps> = ({ currentScreen, setCurrentScreen, appVersion }) => {
  const navOrder = [
    Screen.StockStatus,
    Screen.AccountStatus,
    Screen.TradeHistory,
    Screen.ProfitManagement,
    Screen.MonthlyHistory,
    Screen.Index,
  ];

  const allNavItems = navOrder.map(screen => NAV_ITEMS.find(item => item.screen === screen)).filter((item): item is { screen: Screen; label: string } => !!item);
  
  const leftItems = allNavItems.slice(0, 3);
  const rightItems = allNavItems.slice(3);

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-light-card dark:bg-dark-card border-t border-gray-200/80 dark:border-slate-700">
      <div className="flex justify-around items-center h-full max-w-4xl mx-auto">
        {leftItems.map((item) => (
          <NavItem
            key={item.screen}
            item={item}
            isActive={currentScreen === item.screen}
            onClick={() => setCurrentScreen(item.screen)}
          />
        ))}

        <div className="relative w-full flex justify-center">
            <button
                onClick={() => setCurrentScreen(Screen.Home)}
                className={`absolute bottom-[18px] w-14 h-14 flex items-center justify-center rounded-full shadow-lg transition-transform duration-200 ease-in-out ${currentScreen === Screen.Home ? 'bg-light-primary dark:bg-dark-primary scale-110' : 'bg-light-secondary dark:bg-dark-secondary'}`}
                aria-label="Home"
            >
                <HomeIcon className="w-7 h-7 text-white"/>
            </button>
            {appVersion && (
                <span className="absolute bottom-1 text-[9px] text-light-secondary dark:text-dark-secondary font-mono select-none pointer-events-none">{appVersion}</span>
            )}
        </div>

        {rightItems.map((item) => (
            <NavItem
                key={item.screen}
                item={item}
                isActive={currentScreen === item.screen}
                onClick={() => setCurrentScreen(item.screen)}
            />
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;