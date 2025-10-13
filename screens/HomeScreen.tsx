
import React, { useMemo, useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import { Trade, AccountTransaction, Stock, Account, InitialPortfolio, PortfolioCategory, TradeType, TransactionType, MonthlyAccountValue, Broker, HistoricalGain } from '../types';
import { PORTFOLIO_CATEGORIES } from '../constants';
import Select from '../components/ui/Select';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ChevronDownIcon, ChevronUpIcon, CircleStackIcon, BanknotesIcon } from '../components/Icons';

interface HomeScreenProps {
  trades: Trade[];
  transactions: AccountTransaction[];
  stocks: Stock[];
  accounts: Account[];
  brokers: Broker[];
  initialPortfolio: InitialPortfolio;
  stockPrices: { [key: string]: number };
  monthlyValues: MonthlyAccountValue[];
  showSummary: boolean;
  historicalGains: HistoricalGain[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);
const formatNumberForChart = (value: number) => new Intl.NumberFormat('ko-KR').format(Math.round(value));

/**
 * Calculates the Money-Weighted Rate of Return (MWRR) using the XIRR algorithm (bisection method).
 * @param cashflows An array of cash flow objects, with negative amounts for deposits and positive for withdrawals/final value.
 * @returns The annualized rate of return as a percentage.
 */
const calculateXIRR = (cashflows: { amount: number; date: Date }[]): number => {
    if (cashflows.length < 2) return 0;
    
    const hasPositive = cashflows.some(cf => cf.amount > 0);
    const hasNegative = cashflows.some(cf => cf.amount < 0);
    if (!hasPositive || !hasNegative) return 0;

    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    const calculateNPV = (rate: number): number => {
        let npv = 0;
        const firstDate = cashflows[0].date;
        for (const cf of cashflows) {
            const daysDiff = (cf.date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
            const yearsDiff = daysDiff / 365.25;
            npv += cf.amount / Math.pow(1 + rate, yearsDiff);
        }
        return npv;
    };

    const MAX_ITERATIONS = 100;
    const PRECISION = 1e-7;
    let low = -0.99; // -99%
    let high = 10.0; // 1000%
    let mid = 0;

    const npvLow = calculateNPV(low);
    const npvHigh = calculateNPV(high);

    if (npvLow * npvHigh > 0) {
        // If NPV at both bounds has the same sign, a solution might not exist in this range.
        // This is a rare case for typical investment scenarios. Return 0 as a safe fallback.
        return 0;
    }

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        mid = (low + high) / 2;
        const npvMid = calculateNPV(mid);
        
        if (Math.abs(npvMid) < PRECISION) {
            return mid * 100; // Return as percentage
        }

        if (npvLow * npvMid < 0) {
            high = mid;
        } else {
            low = mid;
        }
    }

    return mid * 100; // Return the best guess if precision is not met
};


const MetricDisplay: React.FC<{ label: string; value: string; tooltip: string }> = ({ label, value, tooltip }) => (
  <div className="text-center" title={tooltip}>
    <p className="text-sm font-medium text-light-secondary dark:text-dark-secondary mb-1">{label}</p>
    <p className="text-xl font-bold text-light-text dark:text-dark-text">{value}</p>
  </div>
);


const HomeScreen: React.FC<HomeScreenProps> = ({ trades, transactions, stocks, accounts, brokers, initialPortfolio, stockPrices, monthlyValues, showSummary, historicalGains }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTrendYear, setSelectedTrendYear] = useState<number | string>('전체');
  const [isRebalancingAlertExpanded, setIsRebalancingAlertExpanded] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<PortfolioCategory | null>(null);

  const stockMap = useMemo(() => new Map((stocks || []).map(s => [s.id, s])), [stocks]);
  const securityAccountIds = useMemo(() => new Set((accounts || []).map(a => a.id)), [accounts]);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2024;
    const years = [];
    for (let year: number = currentYear; year >= startYear; year--) {
        years.push(year);
    }
    if (years.length === 0) {
        years.push(currentYear);
    }
    return years;
  }, []);

  const availableTrendYears = useMemo(() => {
    const yearsInData: Set<number> = new Set((monthlyValues || []).map(mv => new Date(mv.date).getFullYear()));
    const startYear = 2024;
    const currentYear = new Date().getFullYear();
    for (let y = startYear; y <= currentYear; y++) {
        yearsInData.add(y);
    }
    const sortedYears = Array.from(yearsInData).filter(y => y >= startYear).sort((a, b) => b - a);
    return ['전체', ...sortedYears];
  }, [monthlyValues]);

  useEffect(() => {
      if (!availableYears.includes(selectedYear)) {
          setSelectedYear(availableYears[0] || new Date().getFullYear());
      }
      if (availableTrendYears.length > 0 && !availableTrendYears.map(String).includes(String(selectedTrendYear))) {
        setSelectedTrendYear(availableTrendYears[0]);
    }
  }, [availableYears, selectedYear, availableTrendYears, selectedTrendYear]);
  
  const totalCashBalance = useMemo(() => {
    let totalCash = 0;
    (accounts || []).forEach(account => {
        const accountTrades = (trades || []).filter(t => t.accountId === account.id);
        const totalBuyCost = accountTrades.filter(t => t.tradeType === TradeType.Buy).reduce((sum, t) => sum + (Number(t.price) || 0) * (Number(t.quantity) || 0), 0);
        const totalSellProceeds = accountTrades.filter(t => t.tradeType === TradeType.Sell).reduce((sum, t) => sum + (Number(t.price) || 0) * (Number(t.quantity) || 0), 0);

        let netCashFromTransactions = 0;
        (transactions || []).forEach(t => {
            const amount = Number(t.amount) || 0;

            // Money IN to this account
            if (t.accountId === account.id && (t.transactionType === TransactionType.Deposit || t.transactionType === TransactionType.Dividend)) {
                netCashFromTransactions += amount;
            }
            if (t.counterpartyAccountId === account.id && t.transactionType === TransactionType.Withdrawal) {
                netCashFromTransactions += amount;
            }

            // Money OUT of this account
            if (t.accountId === account.id && t.transactionType === TransactionType.Withdrawal) {
                netCashFromTransactions -= amount;
            }
            if (t.counterpartyAccountId === account.id && t.transactionType === TransactionType.Deposit) {
                netCashFromTransactions -= amount;
            }
        });
        
        // 계좌별 초기 손익 기록을 가져와 예수금에 합산합니다.
        const historicalPnlForAccount = (historicalGains || [])
            .filter(g => g.accountId === account.id)
            .reduce((sum, g) => sum + (Number(g.realizedPnl) || 0), 0);

        const cashBalance = netCashFromTransactions + totalSellProceeds - totalBuyCost + historicalPnlForAccount;
        totalCash += cashBalance;
    });
    return totalCash;
  }, [accounts, trades, transactions, historicalGains]);


  const netExternalDeposits = useMemo(() => {
    return (transactions || []).reduce((acc, t) => {
        // 배당금은 순입금액 계산에서 제외합니다.
        if (t.transactionType === TransactionType.Dividend) {
            return acc;
        }

        // 상대계좌가 다른 증권계좌인 경우, 내부 이체로 간주하여 계산에서 제외합니다.
        if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) {
            return acc;
        }

        // 외부 입출금 또는 은행 계좌와의 거래는 순입금액에 포함됩니다.
        const amount = Number(t.amount) || 0;
        if (t.transactionType === TransactionType.Deposit) {
            return acc + amount;
        }
        if (t.transactionType === TransactionType.Withdrawal) {
            return acc - amount;
        }
        return acc;
    }, 0);
  }, [transactions, securityAccountIds]);
  
  const financialSummary = useMemo(() => {
    // Holdings and current asset value
    const holdings: { [stockId: string]: { quantity: number } } = {};
    for (const trade of (trades || [])) {
      if (!trade || !trade.stockId) continue;
      const quantity = Number(trade.quantity) || 0;
      if (!holdings[trade.stockId]) holdings[trade.stockId] = { quantity: 0 };
      if (trade.tradeType === TradeType.Buy) {
        holdings[trade.stockId].quantity += quantity;
      } else {
        holdings[trade.stockId].quantity -= quantity;
      }
    }

    let currentStockValue = 0;
    const valueByStock: { [stockId: string]: number } = {};
    for (const stockId in holdings) {
        if (holdings[stockId].quantity > 0) {
            const stock = stockMap.get(stockId);
            const ticker = stock?.ticker;
            const currentPrice = ticker ? stockPrices[ticker] ?? 0 : 0;
            const value = holdings[stockId].quantity * currentPrice;
            currentStockValue += value;
            valueByStock[stockId] = value;
        }
    }
    
    const totalAssets = currentStockValue + totalCashBalance;

    const tradeDates = (trades || []).map(t => new Date(t.date).getTime());
    const txDates = (transactions || []).map(t => new Date(t.date).getTime());
    const allTimestamps = [...tradeDates, ...txDates];
    const firstDate = allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null;

    let investmentPeriodInYears = 0;
    if (firstDate) {
      const periodInMillis = new Date().getTime() - firstDate.getTime();
      investmentPeriodInYears = Math.max(periodInMillis, 1000 * 60 * 60 * 24) / (1000 * 60 * 60 * 24 * 365.25);
    }
    
    const profitLoss = totalAssets - netExternalDeposits;
    
    // 1. CCR
    const ccr = netExternalDeposits > 0 ? (profitLoss / netExternalDeposits) * 100 : 0;
    
    // 2. MWRR (Money-Weighted Rate of Return) using XIRR
    const cashFlows: { amount: number; date: Date }[] = [];
    (transactions || []).forEach(t => {
        if (t.transactionType === TransactionType.Dividend) return;
        if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) return;
        
        const amount = Number(t.amount) || 0;
        const date = new Date(t.date);

        if (t.transactionType === TransactionType.Deposit) {
            cashFlows.push({ amount: -amount, date }); // Cash outflow from investor
        } else if (t.transactionType === TransactionType.Withdrawal) {
            cashFlows.push({ amount: amount, date }); // Cash inflow to investor
        }
    });

    if (totalAssets > 0 || cashFlows.length > 0) {
        cashFlows.push({ amount: totalAssets, date: new Date() });
    }

    const mwrr = calculateXIRR(cashFlows);

    // 3. YTD
    const currentYear = new Date().getFullYear();
    const startOfCurrentYear = new Date(currentYear, 0, 1);
    const lastYearValues = (monthlyValues || [])
        .filter(mv => new Date(mv.date).getTime() < startOfCurrentYear.getTime())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    let startOfYearAssets;
    if (lastYearValues.length > 0) {
        startOfYearAssets = Number(lastYearValues[0].totalValue) || 0;
    } else {
        startOfYearAssets = (transactions || [])
            .filter(t => {
                if (new Date(t.date) >= startOfCurrentYear) return false;
                if (t.transactionType === TransactionType.Dividend) return false;
                if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) return false;
                return true;
            })
            .reduce((acc, t) => {
                const amount = Number(t.amount) || 0;
                if (t.transactionType === TransactionType.Deposit) return acc + amount;
                if (t.transactionType === TransactionType.Withdrawal) return acc - amount;
                return acc;
            }, 0);
    }
    
    const netInflowThisYear = (transactions || [])
        .filter(t => {
            if (new Date(t.date).getFullYear() !== currentYear) return false;
            if (t.transactionType === TransactionType.Dividend) return false;
            if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) return false;
            return true;
        })
        .reduce((acc, t) => {
          const amount = (Number(t.amount) || 0);
          if (t.transactionType === TransactionType.Deposit) return acc + amount;
          if (t.transactionType === TransactionType.Withdrawal) return acc - amount;
          return acc;
        }, 0);

    const ytdProfit = totalAssets - startOfYearAssets - netInflowThisYear;
    const ytdBase = startOfYearAssets + netInflowThisYear;
    const ytd = ytdBase > 0 ? (ytdProfit / ytdBase) * 100 : 0;
    
    // 4. Simple Annualized Return
    const simpleAnnualized = investmentPeriodInYears > 0 ? ccr / investmentPeriodInYears : 0;

    const portfolioStockIds = new Set((stocks || []).filter(s => s.isPortfolio).map(s => s.id));
    
    let totalPortfolioStockValue = 0;
    for (const stockId in valueByStock) {
        if (portfolioStockIds.has(stockId)) {
            totalPortfolioStockValue += valueByStock[stockId];
        }
    }

    const targetPercentagesByCategory: { [key in PortfolioCategory]?: number } = {};
    const individualStocksWithDetails = (stocks || [])
      .filter(stock => stock.isPortfolio)
      .map(stock => {
        const currentValue = valueByStock[stock.id] || 0;
        const currentWeight = totalPortfolioStockValue > 0 ? (currentValue / totalPortfolioStockValue) * 100 : 0;
        const targetWeight = (initialPortfolio || {})[stock.id] || 0;
        const requiredPurchase = (totalPortfolioStockValue * (targetWeight / 100)) - currentValue;
        
        if (targetWeight > 0) {
            targetPercentagesByCategory[stock.category] = (targetPercentagesByCategory[stock.category] || 0) + targetWeight;
        }
        
        return {
            ...stock,
            currentValue,
            currentWeight,
            targetWeight,
            deviation: currentWeight - targetWeight,
            requiredPurchase,
        };
      }).filter(s => s.currentValue > 0 || s.targetWeight > 0);


    const portfolioChartData = PORTFOLIO_CATEGORIES.map(category => {
      const stocksInCategory = individualStocksWithDetails.filter(s => s.category === category);
      const currentValue = stocksInCategory.reduce((sum, s) => sum + s.currentValue, 0);
      const currentPercentage = totalPortfolioStockValue > 0 ? (currentValue / totalPortfolioStockValue) * 100 : 0;
      const targetPercentage = targetPercentagesByCategory[category] || 0;
      
      return {
        name: category,
        value: currentValue,
        percentage: currentPercentage,
        targetPercentage: targetPercentage,
        difference: currentPercentage - targetPercentage,
        stocks: stocksInCategory.sort((a,b) => b.currentValue - a.currentValue),
      };
    }).filter(d => d.value > 0 || d.targetPercentage > 0);

    return {
      totalAssets,
      netExternalDeposits,
      profitLoss,
      ccr,
      mwrr,
      ytd,
      simpleAnnualized,
      chartData: portfolioChartData,
      totalPortfolioValue: totalPortfolioStockValue,
    };
  }, [trades, transactions, stocks, stockPrices, stockMap, initialPortfolio, totalCashBalance, netExternalDeposits, monthlyValues, securityAccountIds, accounts, historicalGains]);

  const rebalancingAlerts = useMemo(() => {
    const warnings: typeof financialSummary.chartData = [];
    const cautions: typeof financialSummary.chartData = [];

    financialSummary.chartData.forEach(item => {
        const deviation = Math.abs(item.difference);
        if (deviation > 5) {
            warnings.push(item);
        } else if (deviation > 3) {
            cautions.push(item);
        }
    });

    warnings.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    cautions.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    return { warnings, cautions };
  }, [financialSummary.chartData]);

  const monthlyPLData = useMemo(() => {
    const yearData = (monthlyValues || [])
      .filter(mv => new Date(mv.date).getFullYear() === selectedYear)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (yearData.length === 0) return [];
    
    const lastMonthOfPrevYear = (monthlyValues || [])
        .filter(mv => new Date(mv.date).getFullYear() === selectedYear - 1)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const dataPoints = [lastMonthOfPrevYear, ...yearData].filter(Boolean);
    
    const results = [];
    for (let i = 1; i < dataPoints.length; i++) {
        const prev = dataPoints[i-1] as MonthlyAccountValue;
        const current = dataPoints[i] as MonthlyAccountValue;

        const prevDate = new Date(prev.date);
        const currentDate = new Date(current.date);

        const monthlyNetDeposits = (transactions || []).filter(t => {
            const txDate = new Date(t.date);
            // 증권계좌간 내부 이체는 제외
            const isInternalTransfer = t.counterpartyAccountId ? securityAccountIds.has(t.counterpartyAccountId) : false;
            return txDate > prevDate && txDate <= currentDate && !isInternalTransfer;
        }).reduce((acc, t) => {
            const amount = Number(t.amount) || 0;
            if (t.transactionType === TransactionType.Deposit || t.transactionType === TransactionType.Dividend) {
                return acc + amount;
            }
            if (t.transactionType === TransactionType.Withdrawal) {
                return acc - amount;
            }
            return acc;
        }, 0);

        let monthlyPL = (Number(current.totalValue) || 0) - (Number(prev.totalValue) || 0) - monthlyNetDeposits;
        
        // 2024년 1월 데이터는 0으로 처리
        if (selectedYear === 2024 && currentDate.getMonth() === 0) {
            monthlyPL = 0;
        }
        
        results.push({
            name: `${currentDate.getMonth() + 1}월`,
            pl: monthlyPL,
        });
    }

    return results;
  }, [monthlyValues, transactions, selectedYear, securityAccountIds]);

  const trendData = useMemo(() => {
    const yearDataPoints = (monthlyValues || [])
      .filter(mv => selectedTrendYear === '전체' || new Date(mv.date).getFullYear() === selectedTrendYear)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
    if (yearDataPoints.length === 0) return [];
  
    return yearDataPoints.map(mv => {
      const pointInTime = new Date(mv.date);
      
      const cumulativeDeposits = (transactions || [])
        .filter(t => {
          // 1. 배당금 제외
          if (t.transactionType === TransactionType.Dividend) {
              return false;
          }
          // 2. 증권계좌 간 내부 이체 제외
          if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) {
              return false;
          }
          // 3. 해당 시점까지의 거래만 포함
          return new Date(t.date) <= pointInTime;
        })
        .reduce((acc, t) => {
          const amount = (Number(t.amount) || 0);
          if (t.transactionType === TransactionType.Deposit) return acc + amount;
          if (t.transactionType === TransactionType.Withdrawal) return acc - amount;
          return acc;
        }, 0);
      
      const year = String(pointInTime.getFullYear()).slice(-2);
      const month = String(pointInTime.getMonth() + 1).padStart(2, '0');
          
      return {
        name: `${year}.${month}`,
        totalValue: Number(mv.totalValue) || 0,
        deposits: cumulativeDeposits,
      };
    });
  }, [monthlyValues, transactions, selectedTrendYear, securityAccountIds]);

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) { // Hide label for small slices to avoid clutter
      return null;
    }
    // Position label inside the slice
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-bold pointer-events-none">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  
  const toggleCategory = (category: PortfolioCategory) => {
    setExpandedCategory(prev => prev === category ? null : category);
  };

  return (
    <div className="space-y-8">
      <Card className="p-0 overflow-hidden">
        {(rebalancingAlerts.warnings.length > 0 || rebalancingAlerts.cautions.length > 0) ? (
          <>
            <div
              className="p-4 cursor-pointer flex justify-between items-center hover:bg-gray-50 dark:hover:bg-slate-800/50"
              onClick={() => setIsRebalancingAlertExpanded(!isRebalancingAlertExpanded)}
              aria-expanded={isRebalancingAlertExpanded}
            >
              <div>
                  <h2 className="text-xl font-bold text-light-text dark:text-dark-text"><span className="text-loss">🔔</span> 리밸런싱 알림</h2>
                  {!isRebalancingAlertExpanded && (
                    <p className="text-sm text-light-secondary dark:text-dark-secondary mt-1">
                      총 {rebalancingAlerts.warnings.length + rebalancingAlerts.cautions.length}개 항목의 비중 조절이 필요합니다. (경고 {rebalancingAlerts.warnings.length}, 주의 {rebalancingAlerts.cautions.length})
                    </p>
                  )}
              </div>
              {isRebalancingAlertExpanded ? <ChevronUpIcon className="w-6 h-6"/> : <ChevronDownIcon className="w-6 h-6"/>}
            </div>

            {isRebalancingAlertExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-200/80 dark:border-slate-700">
                  <p className="text-sm text-light-secondary dark:text-dark-secondary pt-3">
                    포트폴리오 목표 비중과 현재 비중의 차이가 발생했습니다. 리밸런싱을 고려해 보세요.
                  </p>
                  {rebalancingAlerts.warnings.map(item => (
                    <div key={item.name} className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
                      <span className="font-semibold">{item.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-loss">
                          목표 대비: {item.difference >= 0 ? '+' : ''}{item.difference.toFixed(1)}%
                        </span>
                        <span className="ml-2 text-xs font-bold text-white bg-loss px-2 py-1 rounded-full">경고</span>
                      </div>
                    </div>
                  ))}
                  {rebalancingAlerts.cautions.map(item => (
                    <div key={item.name} className="flex justify-between items-center p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                      <span className="font-semibold">{item.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-yellow-600 dark:text-yellow-400">
                          목표 대비: {item.difference >= 0 ? '+' : ''}{item.difference.toFixed(1)}%
                        </span>
                        <span className="ml-2 text-xs font-bold text-yellow-800 dark:text-yellow-200 bg-yellow-200 dark:bg-yellow-600/50 px-2 py-1 rounded-full">주의</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        ) : (
          <div className="p-4">
              <h2 className="text-xl font-bold text-light-text dark:text-dark-text"><span className="text-profit">🔔</span> 리밸런싱 알림</h2>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                포트폴리오가 목표 비중에 맞게 잘 유지되고 있습니다.
              </p>
          </div>
        )}
      </Card>

      {showSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-light-card dark:bg-dark-card p-4 rounded-lg shadow-md flex items-start gap-4 border border-gray-200/80 dark:border-slate-700">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <CircleStackIcon className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">총 자산</p>
                  <p className="text-2xl font-bold text-light-text dark:text-dark-text tracking-tight">{formatCurrency(financialSummary.totalAssets)}</p>
              </div>
          </div>
          <div className="bg-light-card dark:bg-dark-card p-4 rounded-lg shadow-md flex items-start gap-4 border border-gray-200/80 dark:border-slate-700">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                  <BanknotesIcon className="w-6 h-6 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">입금 총 합계</p>
                  <p className="text-2xl font-bold text-light-text dark:text-dark-text tracking-tight">{formatCurrency(financialSummary.netExternalDeposits)}</p>
              </div>
          </div>
          <div className="bg-light-card dark:bg-dark-card p-4 rounded-lg shadow-md flex items-start gap-4 border border-gray-200/80 dark:border-slate-700">
              <div className={`p-3 rounded-lg ${financialSummary.profitLoss >= 0 ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}`}>
                  {financialSummary.profitLoss >= 0 ? 
                      <ArrowTrendingUpIcon className="w-6 h-6 text-profit" /> :
                      <ArrowTrendingDownIcon className="w-6 h-6 text-loss" />
                  }
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">누적 수익</p>
                  <p className={`text-2xl font-bold tracking-tight ${financialSummary.profitLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {financialSummary.profitLoss >= 0 ? '+' : ''}{formatCurrency(financialSummary.profitLoss)}
                  </p>
              </div>
          </div>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
          <MetricDisplay 
            label="누적 총 수익률 (CCR)" 
            value={`${financialSummary.ccr.toFixed(2)}%`}
            tooltip="전체 투자 기간 동안의 총 수익률입니다. (총 수익 / 누적 순입금액)" 
          />
          <MetricDisplay 
            label="금액가중 수익률 (MWRR)" 
            value={`${financialSummary.mwrr.toFixed(2)}%`} 
            tooltip="입출금 시점과 규모를 모두 반영한 연환산 수익률입니다. 투자자의 실제 성과를 나타냅니다."
          />
          <MetricDisplay 
            label="올해 (YTD)" 
            value={`${financialSummary.ytd.toFixed(2)}%`} 
            tooltip="올해 1월 1일부터 현재까지의 수익률입니다."
          />
          <MetricDisplay 
            label="연환산 (단리)" 
            value={`${financialSummary.simpleAnnualized.toFixed(2)}%`}
            tooltip="누적 수익률을 연 단위로 환산한 단리 수익률입니다."
          />
        </div>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="포트폴리오(실제)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="relative w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={financialSummary.chartData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={100}
                    innerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                  >
                    {financialSummary.chartData.filter(d => d.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '평가금액']} />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xl sm:text-2xl font-bold text-light-text dark:text-dark-text">
                  {formatNumberForChart(financialSummary.totalPortfolioValue)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {financialSummary.chartData.map((item) => {
                const pieChartItems = financialSummary.chartData.filter(d => d.value > 0);
                const pieIndex = pieChartItems.findIndex(d => d.name === item.name);
                const color = pieIndex !== -1 ? COLORS[pieIndex % COLORS.length] : '#9ca3af';

                return (
                  <div key={item.name}>
                    <div 
                      className={`p-2 rounded-lg cursor-pointer transition-colors ${expandedCategory === item.name ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                      onClick={() => toggleCategory(item.name)}
                      aria-expanded={expandedCategory === item.name}
                      >
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center min-w-0">
                            <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: color }}></span>
                            <span className="font-semibold text-light-text dark:text-dark-text truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="font-bold text-light-text dark:text-dark-text ml-2 flex-shrink-0">{item.percentage.toFixed(1)}%</span>
                            {expandedCategory === item.name ? <ChevronUpIcon className="w-4 h-4 ml-1"/> : <ChevronDownIcon className="w-4 h-4 ml-1"/>}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 relative mt-1">
                          <div className="bg-light-primary dark:bg-dark-primary h-2 rounded-full" style={{ width: `${item.percentage}%` }}></div>
                          {item.targetPercentage > 0 &&
                              <div 
                                  title={`목표: ${item.targetPercentage.toFixed(1)}%`}
                                  className="absolute top-[-2px] h-3 w-1 bg-red-500 rounded-sm" 
                                  style={{ left: `calc(${item.targetPercentage}% - 2px)` }}
                              ></div>
                          }
                        </div>
                         <div className="flex justify-between items-center mt-1 text-xs text-light-secondary dark:text-dark-secondary">
                          <span>{formatCurrency(item.value)}</span>
                          <span className={`font-medium ${item.difference >= 0 ? 'text-profit' : 'text-loss'}`}>
                            목표 대비: {item.difference >= 0 ? '+' : ''}{item.difference.toFixed(1)}%
                          </span>
                        </div>
                    </div>
                    {expandedCategory === item.name && (
                      <div className="mt-2 pl-4 pr-1 pb-1 border-l-2 border-blue-200 dark:border-blue-800 space-y-3">
                        {item.stocks.map(stock => (
                          <div key={stock.id} className="text-xs">
                            <p className="font-semibold truncate">{stock.name}</p>
                            <div className="flex justify-between items-center text-light-secondary dark:text-dark-secondary">
                              <span>현재 {stock.currentWeight.toFixed(1)}% (목표 {stock.targetWeight.toFixed(1)}%)</span>
                              <span className={`font-bold ${stock.deviation >= 0 ? 'text-profit' : 'text-loss'}`}>
                                {stock.deviation >= 0 ? '+' : ''}{stock.deviation.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <span className="font-medium text-light-text dark:text-dark-text">
                                {stock.requiredPurchase > 0 ? '추가 매수 필요' : '비중 초과'}
                              </span>
                              <span className={`font-bold text-sm ${stock.requiredPurchase > 0 ? 'text-loss' : 'text-profit'}`}>
                                {formatCurrency(Math.abs(stock.requiredPurchase))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <Card title="월별 손익">
          <div className="mb-4 max-w-xs ml-auto">
            <Select
              label="년도 선택"
              id="year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </Select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthlyPLData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDataOverflow={true} domain={['auto', 'auto']} tickFormatter={(value) => new Intl.NumberFormat('ko-KR', { notation: 'compact' }).format(value as number)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="pl" name="손익">
                    {monthlyPLData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pl >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                </Bar>
                <Line type="monotone" dataKey="pl" name="추세" stroke="#ff7300" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
      
      <Card title="총 투자 추이">
        <div className="flex justify-end mb-4 max-w-xs ml-auto">
          <Select
            label="년도 선택"
            id="trend-year-select"
            value={selectedTrendYear}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedTrendYear(isNaN(parseInt(value, 10)) ? value : parseInt(value, 10));
            }}
          >
            {availableTrendYears.map((year) => (
              <option key={year} value={year}>
                {year === '전체' ? '전체' : `${year}년`}
              </option>
            ))}
          </Select>
        </div>
        <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
                <defs>
                    <linearGradient id="colorTotalValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6b7280" stopOpacity={0.7}/>
                        <stop offset="95%" stopColor="#6b7280" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <YAxis tickFormatter={(value) => new Intl.NumberFormat('ko-KR', { notation: 'compact' }).format(value as number)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Area type="monotone" dataKey="totalValue" name="총 자산" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTotalValue)" />
                <Area type="monotone" dataKey="deposits" name="누적 순입금액" stroke="#6b7280" fillOpacity={1} fill="url(#colorDeposits)" />
            </AreaChart>
        </ResponsiveContainer>
      </Card>

    </div>
  );
};

export default HomeScreen;