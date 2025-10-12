
import React, { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Account, Broker, Trade, AccountTransaction, TransactionType, Screen, BankAccount, Stock, TradeType, HistoricalGain } from '../types';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, WalletIcon, IdentificationIcon } from '../components/Icons';


interface AccountStatusScreenProps {
  accounts: Account[];
  brokers: Broker[];
  trades: Trade[];
  transactions: AccountTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<AccountTransaction[]>>;
  setCurrentScreen: (screen: Screen) => void;
  bankAccounts: BankAccount[];
  stocks: Stock[];
  stockPrices: { [key: string]: number };
  historicalGains: HistoricalGain[];
}

const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);

const formatNumber = (value: number | string): string => {
  if (value === '' || value === null || value === undefined || Number(value) === 0) return '';
  const num = Number(String(value).replace(/,/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('ko-KR');
};

const AccountStatusScreen: React.FC<AccountStatusScreenProps> = ({ 
  accounts, brokers, trades, transactions, setTransactions, setCurrentScreen, bankAccounts, stocks, stockPrices, historicalGains
}) => {
  const brokerMap = useMemo(() => new Map((brokers || []).map(b => [b.id, b.name])), [brokers]);
  const stockMap = useMemo(() => new Map((stocks || []).map(s => [s.id, s])), [stocks]);
  const securityAccountIds = useMemo(() => new Set((accounts || []).map(a => a.id)), [accounts]);
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Omit<AccountTransaction, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    accountId: (accounts || [])[0]?.id || '',
    amount: 0,
    transactionType: TransactionType.Deposit,
    counterpartyAccountId: undefined,
  });

  const accountDetails = useMemo(() => {
    return (accounts || []).map(account => {
      // 1. Calculate stock value and costs for this account
      const accountTrades = (trades || []).filter(t => t.accountId === account.id);
      
      const accountHoldings: { [stockId: string]: { quantity: number } } = {};
      accountTrades.forEach(trade => {
        if (!trade.stockId) return;
        if (!accountHoldings[trade.stockId]) accountHoldings[trade.stockId] = { quantity: 0 };
        const quantity = Number(trade.quantity) || 0;
        if (trade.tradeType === TradeType.Buy) {
          accountHoldings[trade.stockId].quantity += quantity;
        } else {
          accountHoldings[trade.stockId].quantity -= quantity;
        }
      });

      let stockValue = 0;
      for (const stockId in accountHoldings) {
        if (accountHoldings[stockId].quantity > 1e-9) {
          const stock = stockMap.get(stockId);
          const price = stock ? stockPrices[stock.ticker] || 0 : 0;
          stockValue += accountHoldings[stockId].quantity * price;
        }
      }

      const totalBuyCost = accountTrades.filter(t => t.tradeType === 'BUY').reduce((sum, t) => sum + (Number(t.price) || 0) * (Number(t.quantity) || 0), 0);
      const totalSellProceeds = accountTrades.filter(t => t.tradeType === 'SELL').reduce((sum, t) => sum + (Number(t.price) || 0) * (Number(t.quantity) || 0), 0);

      // 2. Calculate cash movements and net deposits for THIS account
      let netDeposits = 0; // This account's principal, including inter-account transfers
      let netCashFromTransactions = 0; // Cash flow for calculating current cash balance

      (transactions || []).forEach(t => {
        const amount = Number(t.amount) || 0;
        
        // --- Money IN to this account ---
        if ((t.accountId === account.id && (t.transactionType === TransactionType.Deposit || t.transactionType === TransactionType.Dividend)) || 
            (t.counterpartyAccountId === account.id && t.transactionType === TransactionType.Withdrawal)) {
          
          netCashFromTransactions += amount;
          
          // Add to net deposits ONLY if it's not a dividend
          if (t.transactionType !== TransactionType.Dividend) {
            netDeposits += amount;
          }
        } 
        // --- Money OUT of this account ---
        else if ((t.accountId === account.id && t.transactionType === TransactionType.Withdrawal) || 
                  (t.counterpartyAccountId === account.id && t.transactionType === TransactionType.Deposit)) {
          
          netCashFromTransactions -= amount;

          // Subtract from net deposits (dividends are not withdrawals, so no check needed)
          netDeposits -= amount;
        }
      });
      
      const historicalPnlForAccount = (historicalGains || [])
        .filter(g => g.accountId === account.id)
        .reduce((sum, g) => sum + (Number(g.realizedPnl) || 0), 0);
      
      // 3. Calculate final metrics
      // 초기 손익 기록(historicalGains)은 실현되어 현금화된 자산이므로, 예수금에 포함합니다.
      const cashBalance = netCashFromTransactions + totalSellProceeds - totalBuyCost + historicalPnlForAccount;
      
      // 총 평가금액은 이제 주식 평가액과 수정된 예수금을 합산합니다.
      // (historicalPnlForAccount가 cashBalance에 이미 포함되었으므로 중복 계산을 피합니다.)
      const totalValue = cashBalance + stockValue;
      
      // Total profit/loss is calculated against the account's specific net deposits (principal).
      const profitLoss = totalValue - netDeposits;
      const returnRate = netDeposits !== 0 ? (profitLoss / netDeposits) * 100 : 0;
      
      return {
        ...account,
        brokerName: brokerMap.get(account.brokerId) || '알 수 없음',
        netDeposits,
        cashBalance,
        stockValue,
        totalValue,
        profitLoss,
        returnRate,
      };
    });
  }, [accounts, brokers, trades, transactions, stocks, stockPrices, brokerMap, stockMap, historicalGains, securityAccountIds]);
  
  const totalSummary = useMemo(() => {
    const summary = {
        totalStockValue: 0,
        totalCashBalance: 0,
        totalNetDeposits: 0,
        totalAssets: 0,
        ytdNetDeposits: 0,
    };

    if (!accountDetails || accountDetails.length === 0) {
        return summary;
    }

    accountDetails.forEach(account => {
        summary.totalStockValue += account.stockValue;
        summary.totalCashBalance += account.cashBalance;
        summary.totalAssets += account.totalValue;
    });

    // For the total summary, calculate net deposits by only considering external transactions,
    // ignoring internal transfers between security accounts.
    summary.totalNetDeposits = (transactions || []).reduce((acc, t) => {
        if (t.transactionType === TransactionType.Dividend) {
            return acc;
        }
        if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) {
            return acc;
        }
        const amount = Number(t.amount) || 0;
        if (t.transactionType === TransactionType.Deposit) {
            return acc + amount;
        }
        if (t.transactionType === TransactionType.Withdrawal) {
            return acc - amount;
        }
        return acc;
    }, 0);


    const currentYear = new Date().getFullYear();
    summary.ytdNetDeposits = (transactions || []).reduce((acc, t) => {
        const transactionYear = new Date(t.date).getFullYear();

        if (transactionYear !== currentYear) {
            return acc;
        }
        if (t.transactionType === TransactionType.Dividend) {
            return acc;
        }
        if (t.counterpartyAccountId && securityAccountIds.has(t.counterpartyAccountId)) {
            return acc;
        }
        const amount = Number(t.amount) || 0;
        if (t.transactionType === TransactionType.Deposit) {
            return acc + amount;
        }
        if (t.transactionType === TransactionType.Withdrawal) {
            return acc - amount;
        }
        return acc;
    }, 0);

    return summary;
  }, [accountDetails, transactions, securityAccountIds]);

  
  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = Number(newTransaction.amount);
    if (isNaN(amount)) {
      alert('금액에 유효한 숫자를 입력해주세요.');
      return;
    }

    if (!newTransaction.accountId || amount <= 0) {
      alert('계좌와 금액을 올바르게 입력해주세요.');
      return;
    }
    setTransactions(prev => [{ ...newTransaction, amount, id: Date.now().toString() }, ...(prev || [])]);
    setIsTxModalOpen(false);
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <Button onClick={() => setIsTxModalOpen(true)}>입출금 기록</Button>
          <Button onClick={() => setCurrentScreen(Screen.AccountTransactions)} variant="secondary">
            입출금 히스토리
          </Button>
        </div>
      </Card>
      
      <Card>
        <h2 className="text-xl font-semibold mb-4 text-light-text dark:text-dark-text flex items-center gap-3">
          <WalletIcon className="w-7 h-7 text-blue-500" />
          <span>전체 계좌 요약</span>
        </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">총 자산</p>
                  <p className="text-xl font-bold text-light-primary dark:text-dark-primary">{formatCurrency(totalSummary.totalAssets)}</p>
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">주식 평가액</p>
                  <p className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(totalSummary.totalStockValue)}</p>
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">예수금(CMA포함)</p>
                  <p className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(totalSummary.totalCashBalance)}</p>
              </div>
              <div>
                  <p className="text-sm text-light-secondary dark:text-dark-secondary">순입금액 (원금)</p>
                  <p className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(totalSummary.totalNetDeposits)}</p>
                  <p className="text-xs text-light-secondary dark:text-dark-secondary mt-1">올해: {formatCurrency(totalSummary.ytdNetDeposits)}</p>
              </div>
          </div>
      </Card>

      {accountDetails.length === 0 ? (
        <Card>
            <p className="text-center text-light-secondary dark:text-dark-secondary">표시할 계좌가 없습니다.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {accountDetails.map(account => (
                <Card key={account.id} className="p-0 overflow-hidden flex flex-col justify-between shadow-lg">
                    <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-white dark:from-slate-800/70 dark:to-dark-card">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-light-card dark:bg-dark-card rounded-lg shadow">
                              <IdentificationIcon className="w-6 h-6 text-blue-500" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-light-text dark:text-dark-text">{account.name}</h3>
                            <p className="text-sm text-light-secondary dark:text-dark-secondary">{account.brokerName}</p>
                          </div>
                        </div>
                        
                        <p className="text-xs font-medium text-light-secondary dark:text-dark-secondary">총 평가금액</p>
                        <p className="text-3xl font-extrabold text-light-primary dark:text-dark-primary tracking-tight">{formatCurrency(account.totalValue)}</p>

                        <div className={`flex items-center mt-2 text-lg font-semibold ${account.profitLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {account.profitLoss >= 0 ? <ArrowTrendingUpIcon className="w-5 h-5 mr-1"/> : <ArrowTrendingDownIcon className="w-5 h-5 mr-1"/>}
                            <span>{account.profitLoss >= 0 ? '+' : ''}{formatCurrency(account.profitLoss)}</span>
                            <span className="text-base ml-2 opacity-90">({account.returnRate.toFixed(2)}%)</span>
                        </div>
                    </div>
                    <div className="p-4 sm:p-5 bg-light-card dark:bg-dark-card border-t border-gray-200/50 dark:border-slate-700/50">
                      <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                              <span className="text-light-secondary dark:text-dark-secondary">주식 평가액</span>
                              <span className="font-medium text-light-text dark:text-dark-text">{formatCurrency(account.stockValue)}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-light-secondary dark:text-dark-secondary">예수금</span>
                              <span className="font-medium text-light-text dark:text-dark-text">{formatCurrency(account.cashBalance)}</span>
                          </div>
                           <div className="flex justify-between mt-3 pt-3 border-t border-dashed border-gray-200/80 dark:border-slate-700/50">
                              <span className="text-light-secondary dark:text-dark-secondary font-semibold">순입금액 (원금)</span>
                              <span className="font-semibold text-light-text dark:text-dark-text">{formatCurrency(account.netDeposits)}</span>
                          </div>
                      </div>
                    </div>
                </Card>
            ))}
        </div>
      )}
        
      <Modal isOpen={isTxModalOpen} onClose={() => setIsTxModalOpen(false)} title="입출금 기록 추가">
        <form onSubmit={handleTxSubmit} className="space-y-4">
          <Input label="일자" id="date" name="date" type="date" value={newTransaction.date} onChange={(e) => setNewTransaction(p => ({...p, date: e.target.value}))} required />
          <Select label="계좌" id="accountId" name="accountId" value={newTransaction.accountId} onChange={(e) => setNewTransaction(p => ({...p, accountId: e.target.value}))} required>
            {(accounts || []).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
          </Select>
           <Select label="입금/출금" id="transactionType" name="transactionType" value={newTransaction.transactionType} onChange={(e) => setNewTransaction(p => ({...p, transactionType: e.target.value as TransactionType}))} required>
            <option value={TransactionType.Deposit}>입금</option>
            <option value={TransactionType.Withdrawal}>출금</option>
          </Select>
          <Input label="금액" id="amount" name="amount" type="text" inputMode="numeric" value={formatNumber(newTransaction.amount)} onChange={(e) => {
              const numValue = parseFloat(e.target.value.replace(/,/g, ''));
              setNewTransaction(p => ({...p, amount: isNaN(numValue) ? 0 : numValue}));
            }} required />
          <Select label="상대계좌 (선택)" id="counterpartyAccountId" name="counterpartyAccountId" value={newTransaction.counterpartyAccountId || ''} onChange={(e) => setNewTransaction(p => ({...p, counterpartyAccountId: e.target.value || undefined}))}>
            <option value="">없음 (외부 입출금)</option>
            <optgroup label="증권계좌">
              {(accounts || []).filter(acc => acc.id !== newTransaction.accountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </optgroup>
            <optgroup label="은행계좌">
              {(bankAccounts || []).map(bacc => <option key={bacc.id} value={bacc.id}>{bacc.bankName} {bacc.name}</option>)}
            </optgroup>
          </Select>
          <div className="flex justify-end pt-4">
            <Button type="submit">완료</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AccountStatusScreen;