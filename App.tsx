
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Screen, Theme, TradeType, Account, Broker, Stock, Trade, AccountTransaction, BankAccount, InitialPortfolio, MonthlyAccountValue, PortfolioCategory, HistoricalGain, AlertThresholds } from './types';
import HomeScreen from './screens/HomeScreen';
import StockStatusScreen from './screens/StockStatusScreen';
import AccountStatusScreen from './screens/AccountStatusScreen';
import TradeHistoryScreen from './screens/TradeHistoryScreen';
import AccountTransactionsScreen from './screens/AccountTransactionsScreen';
import ProfitManagementScreen from './screens/ProfitManagementScreen';
import MonthlyHistoryScreen from './screens/MonthlyHistoryScreen';
import IndexScreen from './screens/IndexScreen';
import PasswordScreen from './screens/PasswordScreen';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import Modal from './components/ui/Modal';
import Button from './components/ui/Button';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchStockPrices } from './services/stockPriceService';
import { exportAllData } from './services/exportService';

// Default Data for initial setup
const defaultBrokerId = 'broker-mirae';
const DEFAULT_BROKERS: Broker[] = [
  { id: defaultBrokerId, name: '미래에셋증권' },
];

const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'acc-mirae-1', name: '일반종합', brokerId: defaultBrokerId },
  { id: 'acc-mirae-2', name: 'CMA', brokerId: defaultBrokerId },
  { id: 'acc-mirae-3', name: 'ISA(중개형)', brokerId: defaultBrokerId },
  { id: 'acc-mirae-4', name: '연금저축1', brokerId: defaultBrokerId },
  { id: 'acc-mirae-5', name: '연금저축(이전)', brokerId: defaultBrokerId },
  { id: 'acc-mirae-6', name: '개인IRP', brokerId: defaultBrokerId },
  { id: 'acc-mirae-7', name: '퇴직DC', brokerId: defaultBrokerId },
];

const DEFAULT_STOCKS: Stock[] = [
  { id: 'stock-0043B0', ticker: '0043B0', name: 'Tiger 머니마켓액티브', category: PortfolioCategory.Cash, isPortfolio: true },
  { id: 'stock-497880', ticker: '497880', name: 'SOL CD금리&머니마켓액티브', category: PortfolioCategory.Cash, isPortfolio: true },
  { id: 'stock-411060', ticker: '411060', name: 'ACE KRX금현물', category: PortfolioCategory.Alternatives, isPortfolio: true },
  { id: 'stock-0064K0', ticker: '0064K0', name: 'Kodex 금액티브', category: PortfolioCategory.Alternatives, isPortfolio: true },
  { id: 'stock-365780', ticker: '365780', name: 'ACE 국고채10년', category: PortfolioCategory.Bonds, isPortfolio: true },
  { id: 'stock-305080', ticker: '305080', name: 'Tiger 미국채10년 선물', category: PortfolioCategory.Bonds, isPortfolio: true },
  { id: 'stock-0085P0', ticker: '0085P0', name: 'ACE 미국10년국채액티브', category: PortfolioCategory.Bonds, isPortfolio: true },
  { id: 'stock-161510', ticker: '161510', name: 'Plus 고배당주', category: PortfolioCategory.Dividend, isPortfolio: true },
  { id: 'stock-0098N0', ticker: '0098N0', name: 'Plus 자사주매입고배당주', category: PortfolioCategory.Dividend, isPortfolio: true },
  { id: 'stock-294400', ticker: '294400', name: 'Kiwoom 200TR', category: PortfolioCategory.Stock, isPortfolio: true },
  { id: 'stock-360750', ticker: '360750', name: 'Tiger 미국S&P500', category: PortfolioCategory.Stock, isPortfolio: true },
  { id: 'stock-379810', ticker: '379810', name: 'Kodex 미국나스닥100', category: PortfolioCategory.Stock, isPortfolio: true },
  { id: 'stock-283580', ticker: '283580', name: 'Kodex 차이나CSI300', category: PortfolioCategory.Stock, isPortfolio: true },
];

const DEFAULT_INITIAL_PORTFOLIO: InitialPortfolio = {
  'stock-0043B0': 6.24,
  'stock-497880': 3.76,
  'stock-411060': 11.96,
  'stock-0064K0': 4,
  'stock-365780': 10.48,
  'stock-305080': 7.14,
  'stock-0085P0': 2.73,
  'stock-161510': 10.85,
  'stock-0098N0': 4.15,
  'stock-294400': 7.49,
  'stock-360750': 18.27,
  'stock-379810': 3.57,
  'stock-283580': 9.38,
};

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  global: { caution: 3, warning: 5 },
  categories: {},
  stocks: {}
};

interface AppProps {
  onForceRemount: () => void;
}

const App: React.FC<AppProps> = ({ onForceRemount }) => {
  const [theme, setTheme] = useLocalStorage<Theme>('theme', Theme.Light);
  const [password, setPassword] = useLocalStorage<string | null>('app-password', '9635');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!password);
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.Home);
  const [isDataOperationInProgress, setIsDataOperationInProgress] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  // All application data is stored here, managed by useLocalStorage
  const [brokers, setBrokers] = useLocalStorage<Broker[]>('brokers', DEFAULT_BROKERS);
  const [accounts, setAccounts] = useLocalStorage<Account[]>('accounts', DEFAULT_ACCOUNTS);
  const [stocks, setStocks] = useLocalStorage<Stock[]>('stocks', DEFAULT_STOCKS);
  const [trades, setTrades] = useLocalStorage<Trade[]>('trades', []);
  const [transactions, setTransactions] = useLocalStorage<AccountTransaction[]>('transactions', []);
  const [bankAccounts, setBankAccounts] = useLocalStorage<BankAccount[]>('bankAccounts', []);
  const [initialPortfolio, setInitialPortfolio] = useLocalStorage<InitialPortfolio>('initialPortfolio', DEFAULT_INITIAL_PORTFOLIO);
  const [monthlyValues, setMonthlyValues] = useLocalStorage<MonthlyAccountValue[]>('monthlyValues', []);
  const [stockPrices, setStockPrices] = useLocalStorage<{ [key: string]: number }>('stockPrices', {});
  const [backgroundFetchInterval, setBackgroundFetchInterval] = useLocalStorage<number>('backgroundFetchInterval', 30); // in minutes
  const [showSummary, setShowSummary] = useLocalStorage<boolean>('showSummary', true);
  const [historicalGains, setHistoricalGains] = useLocalStorage<HistoricalGain[]>('historicalGains', []);
  const [alertThresholds, setAlertThresholds] = useLocalStorage<AlertThresholds>('alertThresholds', DEFAULT_ALERT_THRESHOLDS);

  // New state and refs for swipe and animation
  const [animationClass, setAnimationClass] = useState('');

  const swipeNavOrder = useMemo(() => [
      Screen.StockStatus,
      Screen.AccountStatus,
      Screen.TradeHistory,
      Screen.Home,
      Screen.ProfitManagement,
      Screen.MonthlyHistory,
      Screen.Index,
  ], []);

  const screenIndexRef = useRef(swipeNavOrder.findIndex(s => s === currentScreen));
  
  useEffect(() => {
    fetch('/metadata.json')
        .then(response => response.json())
        .then(data => {
            if (data?.name) {
                const versionMatch = data.name.match(/V\d+\.\d+\.\d+/);
                if (versionMatch) {
                    setAppVersion(versionMatch[0]);
                }
            }
        })
        .catch(error => console.error("Failed to load app version:", error));
  }, []);
  
  const navigateToScreen = useCallback((newScreen: Screen) => {
      const newIndex = swipeNavOrder.findIndex(s => s === newScreen);
      const oldIndex = screenIndexRef.current;
      
      if (newIndex === oldIndex) return;

      if (newIndex > oldIndex) {
          setAnimationClass('slide-in-from-right');
      } else if (newIndex < oldIndex) {
          setAnimationClass('slide-in-from-left');
      } else {
          setAnimationClass('');
      }
      
      screenIndexRef.current = newIndex;
      setCurrentScreen(newScreen);
  }, [swipeNavOrder]);

  const SWIPE_THRESHOLD = 50;
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStartX.current) return;
      
      const touchEndX = e.changedTouches[0].clientX;
      const distance = touchStartX.current - touchEndX;
      const isLeftSwipe = distance > SWIPE_THRESHOLD;
      const isRightSwipe = distance < -SWIPE_THRESHOLD;

      if (isLeftSwipe || isRightSwipe) {
          const currentIndex = swipeNavOrder.findIndex(s => s === currentScreen);
          if (currentIndex === -1) return;

          let nextIndex;
          if (isLeftSwipe) { // Swipe left, go to next screen
              nextIndex = currentIndex + 1;
          } else { // Swipe right, go to previous screen
              nextIndex = currentIndex - 1;
          }

          if (nextIndex >= 0 && nextIndex < swipeNavOrder.length) {
              navigateToScreen(swipeNavOrder[nextIndex]);
          }
      }

      touchStartX.current = null;
  };

  useEffect(() => {
    const hasLaunchedBefore = localStorage.getItem('has_launched_before');
    if (!hasLaunchedBefore) {
        console.log("First launch detected. Clearing default data.");
        setBrokers([]);
        setAccounts([]);
        setStocks([]);
        setInitialPortfolio({});
        setBankAccounts([]);
        setTrades([]);
        setTransactions([]);
        setMonthlyValues([]);
        setHistoricalGains([]);
        localStorage.setItem('has_launched_before', 'true');
    }
  }, [setBrokers, setAccounts, setStocks, setInitialPortfolio, setBankAccounts, setTrades, setTransactions, setMonthlyValues, setHistoricalGains]);

  const stockMap = useMemo(() => new Map((stocks || []).map(s => [s.id, s])), [stocks]);

  const tickersToFetch = useMemo(() => {
    const holdingsMap: { [stockId: string]: { quantity: number } } = {};
    (trades || []).forEach(trade => {
      if (!trade || !trade.stockId) return;
      if (!holdingsMap[trade.stockId]) {
        holdingsMap[trade.stockId] = { quantity: 0 };
      }
      const quantity = Number(trade.quantity) || 0;
      if (trade.tradeType === TradeType.Buy) {
        holdingsMap[trade.stockId].quantity += quantity;
      } else {
        holdingsMap[trade.stockId].quantity -= quantity;
      }
    });

    const stockIdsInHoldings = Object.entries(holdingsMap)
      .filter(([, data]) => data.quantity > 0.00001)
      .map(([stockId]) => stockId);
    
    const tickers = stockIdsInHoldings
      .map(stockId => stockMap.get(stockId)?.ticker)
      .filter((ticker): ticker is string => !!ticker);
      
    return [...new Set(tickers)];
  }, [trades, stockMap]);

  const fetchAndSetPrices = useCallback(async (): Promise<boolean> => {
    if (tickersToFetch.length === 0) {
      console.log('No stocks to fetch prices for.');
      return true;
    }
  
    try {
      console.log(`Fetching prices for ${tickersToFetch.length} tickers...`);
      const { prices: newPrices, errors } = await fetchStockPrices(tickersToFetch);
      
      if (Object.keys(newPrices).length > 0) {
        setStockPrices(prevPrices => ({
          ...prevPrices,
          ...newPrices,
        }));
      }
      
      const hasErrors = Object.keys(errors).length > 0;
      if (hasErrors) {
        console.warn('Some tickers failed to fetch (will be retried):', errors);
      }
      
      const isSuccess = Object.keys(newPrices).length > 0 || !hasErrors;
      return isSuccess;
    } catch (error) {
      console.error('An unexpected error occurred during price fetch (will be retried):', error);
      return false;
    }
  }, [tickersToFetch, setStockPrices]);

  const timeoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    const FOREGROUND_INTERVAL = 5 * 60 * 1000;
    const BACKGROUND_INTERVAL = backgroundFetchInterval * 60 * 1000;
    const FAILURE_RETRY_INTERVAL = 5 * 60 * 1000;

    const clearExistingTimeout = () => {
        if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
        }
    };

    const poll = async () => {
        const wasSuccessful = await fetchAndSetPrices();
        
        let interval;
        if (wasSuccessful) {
            interval = document.visibilityState === 'visible'
                ? FOREGROUND_INTERVAL
                : BACKGROUND_INTERVAL;
            console.log(`Fetch successful. Next poll scheduled in ${interval / 60000} minutes.`);
        } else {
            interval = FAILURE_RETRY_INTERVAL;
            console.log(`Fetch failed. Retrying in ${interval / 60000} minutes.`);
        }
        
        clearExistingTimeout();
        timeoutIdRef.current = window.setTimeout(poll, interval);
    };
    
    const scheduleNextPoll = () => {
        clearExistingTimeout();
        const interval = document.visibilityState === 'visible'
            ? FOREGROUND_INTERVAL
            : BACKGROUND_INTERVAL;
        
        console.log(`Next price fetch scheduled in ${interval / 60000} minutes.`);
        timeoutIdRef.current = window.setTimeout(poll, interval);
    };

    const handleVisibilityChange = () => {
        clearExistingTimeout();
        if (document.visibilityState === 'visible') {
            console.log("App is active. Resetting poll interval to foreground settings.");
            scheduleNextPoll();
        } else {
            console.log(`App is inactive. Scheduling next fetch in ${backgroundFetchInterval} minutes.`);
            scheduleNextPoll();
        }
    };

    poll();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        clearExistingTimeout();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAndSetPrices, backgroundFetchInterval]);


  useEffect(() => {
    if (theme === Theme.Dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);
  
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => prevTheme === Theme.Light ? Theme.Dark : Theme.Light);
  }, [setTheme]);

  const handleLogin = (pw: string) => {
    if (password && pw === password) {
      setIsAuthenticated(true);
    } else {
        alert("비밀번호가 틀렸습니다.");
    }
  };

  const handleAppExit = (shouldExport: boolean) => {
    setIsExitModalOpen(false);
    if (shouldExport) {
        exportAllData(
            brokers,
            accounts,
            bankAccounts,
            stocks,
            initialPortfolio,
            trades,
            transactions,
            monthlyValues,
            historicalGains,
            alertThresholds,
            backgroundFetchInterval,
            showSummary,
            `투자 관리 앱 전체 데이터_${new Date().toISOString().split('T')[0]}`
        );
    }
    // After a small delay to ensure export is triggered.
    setTimeout(() => {
        document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; font-size:20px; color: #333; background-color: #f0f0f0; text-align: center; padding: 20px;">앱이 종료되었습니다.<br/>이 탭을 닫으셔도 좋습니다.</div>';
    }, 500);
  };
  
  const renderScreen = () => {
    switch (currentScreen) {
      case Screen.Home:
        return <HomeScreen 
          trades={trades} 
          transactions={transactions} 
          stocks={stocks} 
          accounts={accounts}
          brokers={brokers}
          initialPortfolio={initialPortfolio} 
          stockPrices={stockPrices}
          monthlyValues={monthlyValues}
          showSummary={showSummary}
          historicalGains={historicalGains}
          alertThresholds={alertThresholds}
        />;
      case Screen.StockStatus:
        return <StockStatusScreen 
          trades={trades} 
          stocks={stocks} 
          stockPrices={stockPrices} 
          initialPortfolio={initialPortfolio} 
        />;
      case Screen.AccountStatus:
        return <AccountStatusScreen 
          accounts={accounts} 
          brokers={brokers} 
          trades={trades} 
          transactions={transactions} 
          setTransactions={setTransactions}
          setCurrentScreen={navigateToScreen}
          bankAccounts={bankAccounts}
          stocks={stocks}
          stockPrices={stockPrices}
          historicalGains={historicalGains}
        />;
      case Screen.TradeHistory:
        return <TradeHistoryScreen trades={trades} setTrades={setTrades} accounts={accounts} stocks={stocks} />;
      case Screen.AccountTransactions:
        return <AccountTransactionsScreen 
          transactions={transactions} 
          setTransactions={setTransactions} 
          accounts={accounts}
          bankAccounts={bankAccounts}
        />;
      case Screen.ProfitManagement:
        return <ProfitManagementScreen
          trades={trades}
          stocks={stocks}
          accounts={accounts}
          transactions={transactions}
          setTransactions={setTransactions}
          setCurrentScreen={navigateToScreen}
          historicalGains={historicalGains}
          setHistoricalGains={setHistoricalGains}
        />;
      case Screen.MonthlyHistory:
        return <MonthlyHistoryScreen
          monthlyValues={monthlyValues}
          setMonthlyValues={setMonthlyValues}
          transactions={transactions}
        />;
      case Screen.Index:
        return <IndexScreen 
            appVersion={appVersion}
            brokers={brokers} setBrokers={setBrokers}
            accounts={accounts} setAccounts={setAccounts}
            bankAccounts={bankAccounts} setBankAccounts={setBankAccounts}
            stocks={stocks} setStocks={setStocks}
            initialPortfolio={initialPortfolio} setInitialPortfolio={setInitialPortfolio}
            password={password} setPassword={setPassword}
            trades={trades}
            transactions={transactions}
            monthlyValues={monthlyValues} setMonthlyValues={setMonthlyValues}
            historicalGains={historicalGains}
            setIsDataOperationInProgress={setIsDataOperationInProgress}
            onForceRemount={onForceRemount}
            backgroundFetchInterval={backgroundFetchInterval}
            setBackgroundFetchInterval={setBackgroundFetchInterval}
            showSummary={showSummary}
            setShowSummary={setShowSummary}
            alertThresholds={alertThresholds}
            setAlertThresholds={setAlertThresholds}
          />;
      default:
        return <HomeScreen 
          trades={trades} 
          transactions={transactions} 
          stocks={stocks} 
          accounts={accounts} 
          brokers={brokers}
          initialPortfolio={initialPortfolio} 
          stockPrices={stockPrices}
          monthlyValues={monthlyValues}
          showSummary={showSummary}
          historicalGains={historicalGains}
          alertThresholds={alertThresholds}
        />;
    }
  };

  if (!isAuthenticated) {
    return <PasswordScreen onLogin={handleLogin} />;
  }

  return (
    <div 
      className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text font-sans"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="container mx-auto max-w-4xl px-2 sm:px-4 pt-4 pb-24">
        <Header 
          theme={theme} 
          toggleTheme={toggleTheme} 
          currentScreen={currentScreen} 
          onOpenExitModal={() => setIsExitModalOpen(true)}
        />
        <main key={currentScreen} className={animationClass}>
          {renderScreen()}
        </main>
      </div>
      <BottomNav currentScreen={currentScreen} setCurrentScreen={navigateToScreen} appVersion={appVersion} />

      <Modal isOpen={isExitModalOpen} onClose={() => setIsExitModalOpen(false)} title="앱 종료 확인">
        <p>앱을 종료하기 전에 현재 데이터를 엑셀 파일로 백업하시겠습니까?</p>
        <div className="flex justify-end mt-6 space-x-2">
            <Button onClick={() => setIsExitModalOpen(false)} variant="secondary">취소</Button>
            <Button onClick={() => handleAppExit(false)} variant="secondary">그냥 종료</Button>
            <Button onClick={() => handleAppExit(true)} className="bg-loss text-white hover:bg-red-700 focus:ring-red-500">내보내고 종료</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
