
import * as XLSX from 'xlsx';
import { Broker, Account, BankAccount, Stock, InitialPortfolio, Trade, TradeType, AccountTransaction, TransactionType, MonthlyAccountValue, HistoricalGain } from '../types';


/**
 * Takes an array of sheet objects, converts them to an Excel file with multiple sheets, and triggers a download.
 * @param sheets An array of objects, where each object has a 'name' for the sheet and 'data' for the content.
 * @param fileName The desired file name (without extension).
 */
export const exportToExcel = (sheets: { name: string, data: any[] }[], fileName: string): void => {
  try {
    // UMD modules imported via CDN and import maps can be wrapped in unpredictable ways.
    // This function performs a deep search on the imported module object to find the
    // actual, usable library that contains the necessary functions.
    const findValidXlsxLibrary = (mod: any): any | null => {
      // This is the "signature" of the valid XLSX library object.
      const isValid = (lib: any) =>
        lib &&
        typeof lib.utils?.book_new === 'function' &&
        typeof lib.writeFile === 'function';

      // If the module itself is valid, return it immediately.
      if (isValid(mod)) return mod;
      
      // Use a queue for a breadth-first search to avoid deep recursion issues.
      const queue = [mod];
      // Use a Set to track visited objects and prevent infinite loops with circular references.
      const visited = new Set();

      while (queue.length > 0) {
        const current = queue.shift();

        // Skip primitives, nulls, or already visited objects.
        if (!current || typeof current !== 'object' || visited.has(current)) {
          continue;
        }
        visited.add(current);
        
        // If the current object in the search is the valid library, we've found it.
        if (isValid(current)) {
          return current;
        }

        // Add all of the object's properties to the queue to search them next.
        for (const key in current) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            queue.push(current[key]);
          }
        }
      }
      
      // As a final fallback, check if the library attached itself to the global window object.
      if (isValid((window as any).XLSX)) {
        return (window as any).XLSX;
      }

      return null;
    };

    const xlsxLib = findValidXlsxLibrary(XLSX);

    if (!xlsxLib) {
      console.error("Could not find a valid xlsx library object.", { importedModule: XLSX });
      throw new Error("SheetJS (xlsx) library not loaded correctly.");
    }

    const wb = xlsxLib.utils.book_new();

    sheets.forEach(sheet => {
      const ws = xlsxLib.utils.json_to_sheet(sheet.data);
      xlsxLib.utils.book_append_sheet(wb, ws, sheet.name);
    });

    if (wb.SheetNames.length > 0) {
      xlsxLib.writeFile(wb, `${fileName}.xlsx`);
    } else {
      console.warn("No data was provided to export, so no file was generated.");
      alert("내보낼 데이터가 없습니다.");
    }
  } catch (error) {
    console.error("Failed to export data to Excel:", error);
    alert("엑셀 파일로 내보내는 중 오류가 발생했습니다.");
  }
};

export const exportAllData = (
  brokers: Broker[],
  accounts: Account[],
  bankAccounts: BankAccount[],
  stocks: Stock[],
  initialPortfolio: InitialPortfolio,
  trades: Trade[],
  transactions: AccountTransaction[],
  monthlyValues: MonthlyAccountValue[],
  historicalGains: HistoricalGain[],
  fileName: string
) => {
    const sheets: { name: string, data: any[] }[] = [];
    const brokerMap = new Map((brokers || []).map(b => [b.id, b.name]));
    const accountMap = new Map((accounts || []).map(a => [a.id, a.name]));
    const portfolioStocks = (stocks || []).filter(s => s.isPortfolio);
    
    sheets.push({ name: '증권사', data: (brokers || []).map(b => ({ '증권사명': b.name })) });
    sheets.push({ name: '증권계좌', data: (accounts || []).map(a => ({ '계좌명': a.name, '증권사': brokerMap.get(a.brokerId) || 'N/A' })) });
    sheets.push({ name: '은행계좌', data: (bankAccounts || []).map(b => ({ '은행명': b.bankName, '계좌별명': b.name })) });
    sheets.push({ name: '종목', data: (stocks || []).map(s => ({ '종목명': s.name, '티커': s.ticker, '카테고리': s.category, '포트폴리오 포함': s.isPortfolio ? '예' : '아니오' })) });
    sheets.push({ name: '포트폴리오', data: portfolioStocks.map(s => ({ '종목명': s.name, '티커': s.ticker, '카테고리': s.category, '목표 비중 (%)': initialPortfolio[s.id] || 0 })) });
    
    const stockMap = new Map<string, Stock>((stocks || []).map(s => [s.id, s]));
    sheets.push({
        name: '매매기록',
        data: (trades || []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trade => {
            const stock = stockMap.get(trade.stockId);
            const account = accountMap.get(trade.accountId);
            const quantity = Number(trade.quantity) || 0;
            const price = Number(trade.price) || 0;
            // FIX: `account` is the account name string from `accountMap`, so `account.name` is incorrect. Changed to `account`.
            return { '일자': trade.date, '계좌': account || 'N/A', '종목명': stock?.name || 'N/A', '티커': stock?.ticker || 'N/A', '구분': trade.tradeType === TradeType.Buy ? '매수' : '매도', '수량': quantity, '단가': price, '금액': quantity * price, '매매방법': trade.tradeMethod };
        })
    });
    
    const allAccountsMap = new Map<string, string>();
    (accounts || []).forEach(a => allAccountsMap.set(a.id, a.name));
    (bankAccounts || []).forEach(b => allAccountsMap.set(b.id, `${b.bankName} ${b.name}`));

    const regularTransactions = (transactions || []).filter(t => t.transactionType !== TransactionType.Dividend);
    const dividendTransactions = (transactions || []).filter(t => t.transactionType === TransactionType.Dividend);
    
    sheets.push({ name: '입출금기록', data: regularTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => ({ '일자': t.date, '계좌': allAccountsMap.get(t.accountId) || 'N/A', '구분': t.transactionType === TransactionType.Deposit ? '입금' : '출금', '금액': Number(t.amount) || 0, '상대계좌': t.counterpartyAccountId ? allAccountsMap.get(t.counterpartyAccountId) : '외부' })) });
    
    sheets.push({ name: '배당금기록', data: dividendTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
        const stock = t.stockId ? stockMap.get(t.stockId) : undefined;
        return { '일자': t.date, '계좌': allAccountsMap.get(t.accountId) || 'N/A', '종목명': stock ? stock.name : 'N/A', '티커': stock ? stock.ticker : 'N/A', '금액': Number(t.amount) || 0 };
    }) });
    
    sheets.push({ name: '월말결산', data: (monthlyValues || []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(mv => ({ '기준일': mv.date, '계좌총액': Number(mv.totalValue) || 0 })) });
    
    sheets.push({ name: '초기손익기록', data: (historicalGains || []).map(hg => ({ '일자': hg.date, '계좌명': accountMap.get(hg.accountId) || 'N/A', '종목명': hg.stockName, '실현손익': hg.realizedPnl, '메모': hg.note || '' })) });

    const stockMapForGains = new Map<string, Stock>((stocks || []).map(s => [s.id, s]));
    const tradesByStock = (trades || []).reduce((acc, trade) => {
      if (!acc[trade.stockId]) acc[trade.stockId] = [];
      acc[trade.stockId].push(trade);
      return acc;
    }, {} as Record<string, Trade[]>);
    
    const realizedGainsData: any[] = [];
    for (const stockId in tradesByStock) {
      const stock = stockMapForGains.get(stockId);
      if (!stock) continue;
      const stockTrades = tradesByStock[stockId];
      const totalBuyQty = stockTrades.filter(t => t.tradeType === TradeType.Buy).reduce((sum, t) => sum + Number(t.quantity), 0);
      const totalSellQty = stockTrades.filter(t => t.tradeType === TradeType.Sell).reduce((sum, t) => sum + Number(t.quantity), 0);
      if (Math.abs(totalBuyQty - totalSellQty) < 1e-9 && totalSellQty > 0) { // Position closed
        const totalBuyCost = stockTrades.filter(t => t.tradeType === TradeType.Buy).reduce((sum, t) => sum + (Number(t.quantity) * Number(t.price)), 0);
        const totalSellProceeds = stockTrades.filter(t => t.tradeType === TradeType.Sell).reduce((sum, t) => sum + (Number(t.quantity) * Number(t.price)), 0);
        const realizedPnl = totalSellProceeds - totalBuyCost;
        realizedGainsData.push({ stockName: stock.name, totalBuyCost, totalSellProceeds, realizedPnl, pnlRate: totalBuyCost > 0 ? (realizedPnl / totalBuyCost) * 100 : 0 });
      }
    }
    
    sheets.push({ name: '실현손익', data: realizedGainsData.sort((a, b) => b.realizedPnl - a.realizedPnl).map(item => ({ '종목명': item.stockName, '총 매수금액': item.totalBuyCost, '총 매도금액': item.totalSellProceeds, '실현손익': item.realizedPnl, '수익률 (%)': item.pnlRate })) });
    
    if (sheets.length > 0) {
        exportToExcel(sheets, fileName);
    } else {
        alert('내보낼 데이터가 없습니다.');
    }
};