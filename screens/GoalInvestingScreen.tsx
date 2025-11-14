import React, { useMemo, useState } from 'react';
import { InvestmentGoal, Trade, Stock, Account, TradeType, AccountTransaction, TransactionType } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { FlagIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, ChartBarSquareIcon, SparklesIcon } from '../components/Icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface GoalInvestingScreenProps {
  investmentGoals: InvestmentGoal[];
  trades: Trade[];
  setTrades: React.Dispatch<React.SetStateAction<Trade[]>>;
  transactions: AccountTransaction[];
  stocks: Stock[];
  stockPrices: { [key: string]: number };
  accounts: Account[];
}

const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(Math.round(value));
const formatNumber = (value: number | string): string => {
  if (value === '' || value === null || value === undefined || Number(value) === 0) return '';
  const num = Number(String(value).replace(/,/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('ko-KR');
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF6347', '#4682B4'];

const SHARE_GOAL_COLORS = [
  { bg: 'bg-blue-50', darkBg: 'dark:bg-blue-900/40', progress: 'bg-blue-500' },
  { bg: 'bg-green-50', darkBg: 'dark:bg-green-900/40', progress: 'bg-green-500' },
  { bg: 'bg-indigo-50', darkBg: 'dark:bg-indigo-900/40', progress: 'bg-indigo-500' },
  { bg: 'bg-purple-50', darkBg: 'dark:bg-purple-900/40', progress: 'bg-purple-500' },
];

const getWeek = (d: Date): [number, number] => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return [d.getUTCFullYear(), weekNo];
};

const GoalInvestingScreen: React.FC<GoalInvestingScreenProps> = ({
  investmentGoals,
  trades, setTrades,
  transactions,
  stocks,
  stockPrices,
  accounts,
}) => {
  const stockMap = useMemo(() => new Map(stocks.map(s => [s.id, s])), [stocks]);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  
  const [tradeFormState, setTradeFormState] = useState<Omit<Trade, 'id'>>({
    accountId: (accounts || [])[0]?.id || '', date: new Date().toISOString().split('T')[0], stockId: (stocks || [])[0]?.id || '',
    quantity: 0, price: 0, tradeType: TradeType.Buy, tradeMethod: '자동매매', goalId: undefined,
  });

  const toggleGoalExpansion = (goalId: string) => {
    setExpandedGoals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(goalId)) newSet.delete(goalId);
      else newSet.add(goalId);
      return newSet;
    });
  };

  const goalDetails = useMemo(() => {
    return (investmentGoals || []).map(goal => {
      const goalTrades = trades.filter(t => t.goalId === goal.id).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const holdings: { [stockId: string]: { quantity: number, totalCost: number } } = {};
      goalTrades.forEach(trade => {
        if (!holdings[trade.stockId]) holdings[trade.stockId] = { quantity: 0, totalCost: 0 };
        // FIX: Explicitly cast trade quantity and price to numbers to prevent type errors in arithmetic operations.
        const qty = Number(trade.quantity) || 0;
        const price = Number(trade.price) || 0;
        if (trade.tradeType === TradeType.Buy) {
          holdings[trade.stockId].quantity += qty;
          holdings[trade.stockId].totalCost += qty * price;
        } else {
          const avgCost = holdings[trade.stockId].quantity > 0 ? holdings[trade.stockId].totalCost / holdings[trade.stockId].quantity : 0;
          holdings[trade.stockId].quantity -= qty;
          holdings[trade.stockId].totalCost -= qty * avgCost;
        }
      });
      
      const investedPrincipal = goalTrades.reduce((sum, t) => {
        // FIX: Explicitly cast trade quantity and price to numbers to prevent type errors. This fixes the error reported on line 120.
        const amount = (Number(t.quantity) || 0) * (Number(t.price) || 0);
        return t.tradeType === TradeType.Buy ? sum + amount : sum - amount;
      }, 0);

      const currentValue = Object.entries(holdings).reduce((sum, [stockId, data]) => {
        const stock = stockMap.get(stockId);
        const price = stock ? stockPrices[stock.ticker] || 0 : 0;
        // FIX: Explicitly cast `data.quantity` to a number. Although it should be a number from the `holdings` calculation,
        // type inference can sometimes fail, leading to arithmetic errors. This ensures the value is treated as a number.
        return sum + (Number(data.quantity) * price);
      }, 0);

      const detailedHoldings = Object.entries(holdings).filter(([, data]) => data.quantity > 0).map(([stockId, data]) => {
        const stock = stockMap.get(stockId);
        const currentPrice = stock ? stockPrices[stock.ticker] || 0 : 0;
        const stockCurrentValue = data.quantity * currentPrice;
        const avgPrice = data.quantity > 0 ? data.totalCost / data.quantity : 0;
        const profitLoss = stockCurrentValue - data.totalCost;
        const pnlRate = data.totalCost > 0 ? (profitLoss / data.totalCost) * 100 : 0;
        return { id: stockId, name: stock?.name || '', quantity: data.quantity, avgPrice, currentValue: stockCurrentValue, profitLoss, pnlRate };
      }).sort((a,b) => b.currentValue - a.currentValue);
      
      const daysPassed = goal.creationDate ? Math.max(1, Math.floor((new Date().getTime() - new Date(goal.creationDate).getTime()) / (1000 * 60 * 60 * 24))) : null;
      
      let progress = 0;
      if ((goal.goalType || 'amount') === 'amount' && goal.targetAmount && goal.targetAmount > 0) {
        progress = (currentValue / goal.targetAmount) * 100;
      } else if (goal.goalType === 'shares' && goal.targetShares) {
        const targetValue = Object.entries(goal.targetShares).reduce((sum, [stockId, shares]) => {
            const stock = stockMap.get(stockId);
            const price = stock ? stockPrices[stock.ticker] || 0 : 0;
            return sum + (shares * price);
        }, 0);
        if (targetValue > 0) progress = (currentValue / targetValue) * 100;
      }

      const weeklyDataPerStock: { [stockId: string]: { name: string; '매수량': number }[] } = {};
      if (goal.goalType === 'shares' && goalTrades.length > 0) {
        const weeklyNetSharesByStock: { [stockId: string]: { [weekKey: string]: number } } = {};
        goalTrades.forEach(trade => {
            const [year, week] = getWeek(new Date(trade.date));
            const weekKey = `${year}-${String(week).padStart(2, '0')}주차`;
            
            if (!weeklyNetSharesByStock[trade.stockId]) {
                weeklyNetSharesByStock[trade.stockId] = {};
            }
            if (!weeklyNetSharesByStock[trade.stockId][weekKey]) {
                weeklyNetSharesByStock[trade.stockId][weekKey] = 0;
            }
            
            const netChange = trade.tradeType === TradeType.Buy ? trade.quantity : -trade.quantity;
            weeklyNetSharesByStock[trade.stockId][weekKey] += netChange;
        });

        for (const stockId in weeklyNetSharesByStock) {
            weeklyDataPerStock[stockId] = Object.entries(weeklyNetSharesByStock[stockId])
                .map(([weekKey, qty]) => ({ name: weekKey.slice(5), '매수량': qty }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
      }

      let predictedCompletionDate: string | null = null;
      if (goal.goalType === 'shares' && goal.targetShares && daysPassed && daysPassed >= 7) {
        let maxDaysToComplete = 0;
        
        for (const [stockId, targetQty] of Object.entries(goal.targetShares)) {
          const currentQty = holdings[stockId]?.quantity || 0;
          const remainingShares = targetQty - currentQty;
          
          if (remainingShares > 0) {
            const relevantTrades = goalTrades.filter(t => t.stockId === stockId && t.tradeType === TradeType.Buy && new Date(t.date) >= new Date(goal.creationDate));
            // FIX: Explicitly cast `t.quantity` to a number. Data from sources like `localStorage` can sometimes lose its type,
            // so this ensures the value is treated as a number for the arithmetic operation.
            const totalSharesBought = relevantTrades.reduce((sum, t) => sum + Number(t.quantity), 0);

            if (totalSharesBought > 0) {
              const rate = totalSharesBought / daysPassed;
              const daysToComplete = remainingShares / rate;
              maxDaysToComplete = Math.max(maxDaysToComplete, daysToComplete);
            } else {
              maxDaysToComplete = Infinity;
              break;
            }
          }
        }

        if (maxDaysToComplete > 0 && maxDaysToComplete !== Infinity) {
          const completionDate = new Date();
          completionDate.setDate(completionDate.getDate() + Math.ceil(maxDaysToComplete));
          predictedCompletionDate = completionDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      }

      return { ...goal, currentValue, progress, investedPrincipal, holdings: detailedHoldings, daysPassed, weeklyDataPerStock, predictedCompletionDate };
    });
  }, [investmentGoals, trades, transactions, stockPrices, stockMap]);

  const openTradeModal = (goalId: string, stockId: string) => {
    const lastTradeForStock = trades
      .filter(t => t.goalId === goalId && t.stockId === stockId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    let initialState = {
      accountId: (accounts || [])[0]?.id || '', date: new Date().toISOString().split('T')[0], stockId: stockId,
      quantity: 0, price: 0, tradeType: TradeType.Buy as TradeType, tradeMethod: '자동매매', goalId
    };

    if (lastTradeForStock) {
      initialState.accountId = lastTradeForStock.accountId;
    }
    setTradeFormState(initialState);
    setIsTradeModalOpen(true);
  };
  
  const handleTradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // FIX: Added validation for trade form submission to prevent adding invalid data.
    const quantity = Number(tradeFormState.quantity);
    const price = Number(tradeFormState.price);

    if (isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0) {
        alert('수량과 단가를 올바르게 입력해주세요.');
        return;
    }
    if (!tradeFormState.accountId || !tradeFormState.stockId) {
        alert('계좌와 종목을 선택해주세요.');
        return;
    }
    setTrades(prev => [{ ...tradeFormState, quantity, price, id: Date.now().toString() }, ...prev]);
    setIsTradeModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {(goalDetails || []).length === 0 ? (
        <Card><p className="text-center py-8 text-light-secondary dark:text-dark-secondary">'설정' &gt; '투자 목표 관리'에서 새 목표를 추가해보세요.</p></Card>
      ) : (
        goalDetails.map(goal => (
          <Card key={goal.id} className="p-0 overflow-hidden">
            <div className="p-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FlagIcon className="w-6 h-6 text-lime-500" /><span>{goal.name}</span>
              </h2>
              <p className="text-sm text-light-secondary dark:text-dark-secondary mt-1">
                {goal.goalType === 'shares' ? '종목 수량 목표' : `금액 목표`}
                {goal.daysPassed !== null && <span className="ml-2">({goal.daysPassed}일 경과)</span>}
              </p>
              {goal.predictedCompletionDate && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 flex items-center justify-start gap-1">
                  <SparklesIcon className="w-4 h-4" />
                  <span>이 속도라면 <b>{goal.predictedCompletionDate}</b> 달성 예상!</span>
                </p>
              )}
            </div>
            
            <div className="px-4 pb-4 space-y-4">
            {goal.goalType === 'shares' && goal.targetShares ? (
              <>
                <div className="space-y-4">
                  {Object.entries(goal.targetShares).map(([stockId, targetQty], index) => {
                    const holding = goal.holdings.find(h => h.id === stockId);
                    const currentQty = holding?.quantity || 0;
                    const stock = stockMap.get(stockId);
                    const stockProgress = targetQty > 0 ? (currentQty / targetQty) * 100 : 0;
                    const colors = SHARE_GOAL_COLORS[index % SHARE_GOAL_COLORS.length];
                    const weeklyData = goal.weeklyDataPerStock[stockId];
                    if (!stock) return null;
                    return (
                      <div key={stockId} className={`p-4 ${colors.bg} ${colors.darkBg} rounded-xl space-y-3 shadow-inner`}>
                        <div className="flex justify-between items-center"><p className="font-bold text-lg text-light-text dark:text-dark-text">{stock.name}</p><TrophyIcon className={`w-6 h-6 transition-colors ${stockProgress >= 100 ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600'}`} /></div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative"><div className={`h-6 rounded-full text-center text-white text-xs font-bold leading-6 transition-all duration-500 ${stockProgress >= 100 ? 'bg-amber-500' : colors.progress}`} style={{ width: `${Math.min(stockProgress, 100)}%` }}>{stockProgress.toFixed(1)}%</div></div>
                        <div className="text-right font-mono text-light-secondary dark:text-dark-secondary">{currentQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {targetQty.toLocaleString()} 주</div>
                        
                        {weeklyData && weeklyData.length > 0 && (
                          <div className="pt-4 mt-4 border-t border-gray-300/50 dark:border-slate-600/50">
                              <h4 className="font-semibold text-center mb-2 flex items-center justify-center gap-2 text-sm"><ChartBarSquareIcon className="w-5 h-5" />주별 매수 현황</h4>
                              <ResponsiveContainer width="100%" height={150}>
                                  <BarChart data={weeklyData} margin={{ top: 20, right: 0, left: -20, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                                      <XAxis dataKey="name" fontSize={10} />
                                      <YAxis fontSize={10} />
                                      <Tooltip formatter={(value) => `${Number(value).toLocaleString()}주`} />
                                      <Bar dataKey="매수량" fill={COLORS[index % COLORS.length]} />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                        )}
                        <div className="flex justify-end pt-2">
                           <Button onClick={() => openTradeModal(goal.id, stockId)} variant="secondary" className="text-sm px-3 py-1.5">간편 기록</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">달성률</span><span className="font-semibold">{goal.progress.toFixed(1)}%</span></div>
                  {/* FIX: Cast `goal.progress` to a number inside `Math.min` to resolve type errors.
                  This ensures that even if the type is inferred as `unknown`, it is handled correctly as a number. */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4"><div className="bg-lime-500 h-4 rounded-full" style={{ width: `${Math.min(Number(goal.progress), 100)}%` }}></div></div>
                  <div className="flex justify-between text-xs mt-1 text-light-secondary dark:text-dark-secondary"><span>{formatCurrency(goal.currentValue)}</span><span>{formatCurrency(goal.targetAmount || 0)}</span></div>
                </div>
                 <div className="px-4 pb-4"><div className="flex justify-end gap-2 mt-2 pt-4 border-t border-gray-200/50 dark:border-slate-700/50"><Button onClick={() => openTradeModal(goal.id, stocks[0]?.id)} variant="secondary" className="text-sm px-3 py-2">간편 기록</Button></div></div>
              </>
            )}
            </div>
            
            <div className="px-4 py-2 bg-gray-50 dark:bg-dark-bg/30 text-center text-sm font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg/50" onClick={() => toggleGoalExpansion(goal.id)}>
              <div className="flex items-center justify-center gap-2"><span>상세 현황 보기</span>{expandedGoals.has(goal.id) ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}</div>
            </div>
            {expandedGoals.has(goal.id) && (
              <div className="p-4 border-t border-gray-200/50 dark:border-slate-700/50 space-y-4">
                  <div className="p-3 bg-light-bg dark:bg-dark-bg/50 rounded-lg space-y-1 text-sm">
                      <div className="flex justify-between"><span>현재 평가액:</span> <span className="font-semibold text-light-primary dark:text-dark-primary">{formatCurrency(goal.currentValue)}</span></div>
                      <div className="flex justify-between"><span>투입 원금:</span> <span>{formatCurrency(goal.investedPrincipal)}</span></div>
                      <div className="flex justify-between"><span>수익:</span> <span className={`font-semibold ${goal.currentValue - goal.investedPrincipal >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(goal.currentValue - goal.investedPrincipal)}</span></div>
                  </div>
                <h4 className="font-semibold text-center pt-2">보유 종목 현황</h4>
                {goal.holdings.length === 0 ? <p className="text-center text-sm text-light-secondary dark:text-dark-secondary">보유 종목이 없습니다.</p> :
                  goal.holdings.map(h => (
                    <div key={h.id} className="p-3 bg-light-bg dark:bg-dark-bg/50 rounded-lg">
                      <div className="flex justify-between items-start"><p className="font-bold">{h.name}</p><div className="text-right"><p className={`font-semibold ${h.profitLoss >= 0 ? 'text-profit' : 'text-loss'}`}>{h.pnlRate.toFixed(2)}%</p><p className={`text-xs ${h.profitLoss >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(h.profitLoss)}</p></div></div>
                      <div className="text-sm text-light-secondary dark:text-dark-secondary mt-2 space-y-1">
                        <div className="flex justify-between"><span>평가액:</span> <span className="font-medium text-light-text dark:text-dark-text">{formatCurrency(h.currentValue)}</span></div>
                        <div className="flex justify-between"><span>보유 수량:</span> <span>{h.quantity.toLocaleString(undefined, {maximumFractionDigits: 4})} 주</span></div>
                        <div className="flex justify-between"><span>평단가:</span> <span>{formatCurrency(h.avgPrice)}</span></div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </Card>
        ))
      )}

      <Modal isOpen={isTradeModalOpen} onClose={() => setIsTradeModalOpen(false)} title="목표 매매기록 추가">
        <form onSubmit={handleTradeSubmit} className="space-y-4">
          <Input label="일자" name="date" type="date" value={tradeFormState.date} onChange={e => setTradeFormState(p => ({...p, date: e.target.value}))} required />
          <Select label="계좌" name="accountId" value={tradeFormState.accountId} onChange={e => setTradeFormState(p => ({...p, accountId: e.target.value}))} required>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
          <Select label="종목" name="stockId" value={tradeFormState.stockId} onChange={e => setTradeFormState(p => ({...p, stockId: e.target.value}))} required>{stocks.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Input label="수량" name="quantity" type="text" inputMode="numeric" value={formatNumber(tradeFormState.quantity)} onChange={e => setTradeFormState(p => ({...p, quantity: parseFloat(e.target.value.replace(/,/g, '')) || 0}))} required />
          <Input label="단가" name="price" type="text" inputMode="numeric" value={formatNumber(tradeFormState.price)} onChange={e => setTradeFormState(p => ({...p, price: parseFloat(e.target.value.replace(/,/g, '')) || 0}))} required />
          <Select label="구분" name="tradeType" value={tradeFormState.tradeType} onChange={e => setTradeFormState(p => ({...p, tradeType: e.target.value as TradeType}))} required><option value={TradeType.Buy}>매수</option><option value={TradeType.Sell}>매도</option></Select>
          <Select label="매매방법" name="tradeMethod" value={tradeFormState.tradeMethod} onChange={e => setTradeFormState(p => ({...p, tradeMethod: e.target.value}))} required><option value="직접매매">직접매매</option><option value="자동매매">자동매매</option></Select>
          <div className="flex justify-end pt-4"><Button type="submit">기록</Button></div>
        </form>
      </Modal>

    </div>
  );
};

export default GoalInvestingScreen;