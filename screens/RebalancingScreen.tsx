import React, { useMemo, useState } from 'react';
import { Screen, PortfolioCategory } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { InformationCircleIcon, SparklesIcon } from '../components/Icons';
import { getAiAnalysis } from '../services/geminiService';
import PortfolioSimulationModal from '../components/PortfolioSimulationModal';
import { PORTFOLIO_CATEGORIES } from '../constants';

const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(Math.round(value));

interface RebalancingScreenProps {
  stockId: string;
  setCurrentScreen: (screen: Screen) => void;
  financialSummary: {
    totalPortfolioValue: number;
    chartData: any[];
    allStocks: {
      id: string;
      name: string;
      category: PortfolioCategory;
      currentValue: number;
      currentWeight: number;
      targetWeight: number;
      deviation: number;
      requiredPurchase: number;
    }[];
  };
}

const RebalancingScreen: React.FC<RebalancingScreenProps> = ({
  stockId,
  setCurrentScreen,
  financialSummary,
}) => {
  const [simulationData, setSimulationData] = useState<any | null>(null);
  const [aiAnalysis1, setAiAnalysis1] = useState({ loading: false, result: '', isVisible: false });
  const [aiAnalysis2, setAiAnalysis2] = useState({ loading: false, result: '', isVisible: false });

  const targetStock = useMemo(() => {
    return financialSummary.allStocks.find(s => s.id === stockId);
  }, [stockId, financialSummary.allStocks]);

  const scenarios = useMemo(() => {
    if (!targetStock) return { scenario1: null, scenario2: null };

    const { totalPortfolioValue, allStocks } = financialSummary;
    const { currentValue: V_target, targetWeight: W_target_goal, deviation } = targetStock;

    // --- Scenario 1 Logic: External funding for the target stock ONLY ---
    let scenario1: { title: string; description: string; trades: any[], requiredFunds: number } | null = null;
    
    // This scenario is only valid for underweight stocks.
    if (deviation < 0) {
        const W_target_decimal = W_target_goal / 100;
        // The formula to find the required external funds (X) is:
        // (V_target + X) / (totalPortfolioValue + X) = W_target_decimal
        // Solving for X gives: X = (W_target_decimal * totalPortfolioValue - V_target) / (1 - W_target_decimal)
        if (W_target_decimal < 1) { // Avoid division by zero
            const requiredFunds = (W_target_decimal * totalPortfolioValue - V_target) / (1 - W_target_decimal);
            
            if (requiredFunds > 1) { // Only show if a meaningful purchase is needed
                const trades = [{
                    stockName: targetStock.name,
                    amount: requiredFunds,
                    type: 'BUY' as const
                }];

                scenario1 = {
                    title: `외부 자금으로 비중 맞추기`,
                    description: `"${targetStock.name}" 종목의 목표 비중을 맞추기 위해 필요한 외부 자금입니다. 이 금액만큼 해당 종목을 추가 매수하면, 총 투자금액이 증가하면서 목표 비중에 도달하게 됩니다. 다른 종목들의 비중은 약간 희석됩니다.`,
                    trades: trades,
                    requiredFunds: requiredFunds
                };
            }
        }
    }

    // --- Scenario 2 Logic: Internal Rebalancing ---
    const isUnderweight = deviation < 0;
    let scenario2: { title: string; description: string; trades: any[], scale: number } | null = null;

    if (isUnderweight) {
        const purchaseAmount = (targetStock.targetWeight / 100 * totalPortfolioValue) - targetStock.currentValue;
        const overweightStocks = allStocks.filter(s => s.deviation > 0);
        const totalExcess = overweightStocks.reduce((sum, s) => sum + (s.currentValue - (s.targetWeight/100 * totalPortfolioValue)), 0);
        
        if (purchaseAmount > 1 && totalExcess > 1) {
            const scale = Math.min(purchaseAmount, totalExcess);
            const sellTrades = overweightStocks.map(s => {
                const excessValue = s.currentValue - (s.targetWeight/100 * totalPortfolioValue);
                return { stockName: s.name, amount: totalExcess > 0 ? (excessValue / totalExcess) * scale : 0, type: 'SELL' as const };
            }).filter(t => t.amount > 1);

            scenario2 = {
                title: `보유 자산 리밸런싱`,
                description: "비중이 높은 종목을 매도하고, 그 자금으로 비중이 낮은 이 종목을 매수하여 포트폴리오를 조정합니다.",
                trades: [ ...sellTrades.sort((a,b) => b.amount - a.amount), { stockName: targetStock.name, amount: scale, type: 'BUY' as const } ],
                scale: scale
            };
        }
    } else { // Overweight
        const sellAmount = targetStock.currentValue - (targetStock.targetWeight / 100 * totalPortfolioValue);
        const underweightStocks = allStocks.filter(s => s.deviation < 0);
        const totalRequired = underweightStocks.reduce((sum, s) => sum + Math.abs(s.requiredPurchase), 0);
        
        if (sellAmount > 1 && totalRequired > 1) {
            const scale = Math.min(sellAmount, totalRequired);
            const buyTrades = underweightStocks.map(s => ({ stockName: s.name, amount: totalRequired > 0 ? (Math.abs(s.requiredPurchase) / totalRequired) * scale : 0, type: 'BUY' as const })).filter(t => t.amount > 1);
            
            scenario2 = {
                title: `보유 자산 리밸런싱`,
                description: `"${targetStock.name}" 종목을 매도하고, 그 자금으로 다른 저평가 종목들을 매수하여 포트폴리오를 조정합니다.`,
                trades: [ { stockName: targetStock.name, amount: scale, type: 'SELL' as const }, ...buyTrades.sort((a,b) => b.amount - a.amount) ],
                scale: scale
            };
        }
    }

    return { scenario1, scenario2 };
  }, [targetStock, financialSummary]);

  const handleShowSimulation = (scenario: { trades: any[], title: string, requiredFunds?: number, scale?: number }) => {
    const { allStocks, totalPortfolioValue, chartData } = financialSummary;
    const stockValueChanges = new Map<string, number>();
    let externalFunds = scenario.requiredFunds || 0;

    scenario.trades.forEach(trade => {
        const change = trade.type === 'BUY' ? trade.amount : -trade.amount;
        stockValueChanges.set(trade.stockName, (stockValueChanges.get(trade.stockName) || 0) + change);
    });

    const newTotalValue = totalPortfolioValue + externalFunds;

    const newStockDetails = allStocks.map(stock => {
        const change = stockValueChanges.get(stock.name) || 0;
        const newValue = stock.currentValue + change;
        return { ...stock, newValue, newWeight: newTotalValue > 0 ? (newValue / newTotalValue) * 100 : 0 };
    });

    const combinedCategoryData = PORTFOLIO_CATEGORIES.map(category => {
        const currentCategoryData = chartData.find(c => c.name === category);
        const stocksInCategory = newStockDetails.filter(s => s.category === category);
        const newValue = stocksInCategory.reduce((sum, s) => sum + s.newValue, 0);
        const newPercentage = newTotalValue > 0 ? (newValue / newTotalValue) * 100 : 0;
        
        return { name: category, currentPercentage: currentCategoryData?.percentage || 0, newPercentage: newPercentage };
    }).filter(d => d.currentPercentage > 0.01 || d.newPercentage > 0.01);

    setSimulationData({
        data: combinedCategoryData,
        totalBefore: totalPortfolioValue,
        totalAfter: newTotalValue,
    });
  };

  const handleAiAnalysis = async (scenario: { title: string, description: string, trades: any[], requiredFunds?: number, scale?: number }, scenarioNumber: 1 | 2) => {
    if (!targetStock) return;
    const analysisStateUpdater = scenarioNumber === 1 ? setAiAnalysis1 : setAiAnalysis2;
    analysisStateUpdater(s => ({ ...s, loading: true, isVisible: !s.isVisible, result: '' }));
    
    const prompt = `
당신은 사용자의 투자 포트폴리오 리밸런싱을 돕는 AI 어드바이저입니다.
다음 시나리오에 대해 장점과 단점을 분석하고, 초보 투자자가 이해하기 쉽게 한국어로 설명해주세요.

**현재 상황:**
- 리밸런싱 대상 종목: "${targetStock.name}"
- 현재 비중: ${targetStock.currentWeight.toFixed(2)}%
- 목표 비중: ${targetStock.targetWeight.toFixed(2)}%
- 현재 포트폴리오 총액: ${formatCurrency(financialSummary.totalPortfolioValue)}
- 포트폴리오 구성:
${financialSummary.chartData.map(c => `- ${c.name}: ${c.percentage.toFixed(2)}%`).join('\n')}

**분석할 리밸런싱 시나리오:**
- 제목: ${scenario.title} (${formatCurrency(scenario.requiredFunds || scenario.scale || 0)})
- 설명: ${scenario.description}
- 상세 거래 내역:
${scenario.trades.map(t => `- ${t.stockName}: ${formatCurrency(t.amount)} ${t.type === 'BUY' ? '매수' : '매도'}`).join('\n')}

**요청사항:**
위 시나리오의 장점과 단점을 명확히 구분하여 Markdown 형식으로 설명해주세요. 포트폴리오 전체 규모, 분산 효과, 특정 자산 집중 위험, 현금 흐름 등의 관점을 고려하여 분석해주세요.
`;

    const result = await getAiAnalysis(prompt);
    analysisStateUpdater({ loading: false, result, isVisible: true });
  };
  
  if (!targetStock) {
    return ( <Card> <p>선택된 종목 정보를 찾을 수 없습니다.</p> <Button onClick={() => setCurrentScreen(Screen.Home)} variant="secondary" className="mt-4"> 홈으로 돌아가기 </Button> </Card> );
  }

  return (
    <div className="space-y-6">
      <PortfolioSimulationModal isOpen={!!simulationData} onClose={() => setSimulationData(null)} data={simulationData} />
      <Card>
        <div className="flex justify-between items-start">
          <div> <h2 className="text-2xl font-bold">{targetStock.name}</h2> <p className="text-sm text-light-secondary dark:text-dark-secondary">{targetStock.category}</p> </div>
          <Button onClick={() => setCurrentScreen(Screen.Home)} variant="secondary"> 홈으로 </Button>
        </div>
        <div className="mt-4 grid grid-cols-3 text-center divide-x dark:divide-slate-700">
            <div> <p className="text-sm text-light-secondary dark:text-dark-secondary">현재 비중</p> <p className="text-xl font-bold">{targetStock.currentWeight.toFixed(2)}%</p> </div>
            <div> <p className="text-sm text-light-secondary dark:text-dark-secondary">목표 비중</p> <p className="text-xl font-bold">{targetStock.targetWeight.toFixed(2)}%</p> </div>
            <div> <p className="text-sm text-light-secondary dark:text-dark-secondary">비중 차이</p> <p className={`text-xl font-bold ${targetStock.deviation >= 0 ? 'text-profit' : 'text-loss'}`}> {targetStock.deviation >= 0 ? '+' : ''}{targetStock.deviation.toFixed(2)}% </p> </div>
        </div>
      </Card>

      {scenarios.scenario1 && (
        <Card title={`시나리오 1: ${scenarios.scenario1.title} (${formatCurrency(scenarios.scenario1.requiredFunds)})`}>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-sm flex items-start gap-2 mb-4">
            <InformationCircleIcon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" /> <span>{scenarios.scenario1.description}</span>
          </div>
          <h3 className="font-semibold mt-6 mb-2">예상 거래 내역</h3>
          <ul className="space-y-2 max-h-60 overflow-y-auto"> {scenarios.scenario1.trades.map(trade => ( <li key={trade.stockName} className="flex justify-between items-center p-2 bg-light-bg dark:bg-dark-bg/50 rounded"> <span className="font-semibold">{trade.stockName}</span> <span className={`font-bold ${trade.type === 'BUY' ? 'text-profit' : 'text-loss'}`}>{formatCurrency(trade.amount)}</span> </li> ))} </ul>
          <div className="mt-4 flex flex-wrap gap-2 justify-end border-t border-gray-200/50 dark:border-slate-700/50 pt-4">
              <Button onClick={() => handleShowSimulation(scenarios.scenario1!)} variant="secondary" className="text-sm">예상 포트폴리오 보기</Button>
              <Button onClick={() => handleAiAnalysis(scenarios.scenario1!, 1)} variant="secondary" className="text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900/40 focus:ring-purple-500 flex items-center"> <SparklesIcon className="w-4 h-4 mr-2" /> AI로 심층 분석 </Button>
          </div>
          {aiAnalysis1.isVisible && ( <div className="mt-4 p-4 bg-light-bg dark:bg-dark-bg/50 rounded-lg border border-gray-200/50 dark:border-slate-700/50"> {aiAnalysis1.loading ? ( <div className="flex items-center justify-center text-sm"> <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-light-primary dark:border-dark-primary mr-3"></div> AI가 분석 중입니다... </div> ) : ( <div> <h4 className="font-semibold mb-2 text-light-text dark:text-dark-text">AI 분석 결과</h4> <pre className="whitespace-pre-wrap font-sans text-sm text-light-text dark:text-dark-text bg-white dark:bg-dark-bg p-3 rounded">{aiAnalysis1.result}</pre> <p className="text-xs text-light-secondary dark:text-dark-secondary mt-3 text-right">이 분석은 Google의 Gemini 모델을 통해 생성되었으며, 투자 참고용 정보입니다.</p> </div> )} </div> )}
        </Card>
      )}

      {scenarios.scenario2 && (
        <Card title={`시나리오 2: ${scenarios.scenario2.title} (${formatCurrency(scenarios.scenario2.scale)})`}>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-sm flex items-start gap-2 mb-4"> <InformationCircleIcon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" /> <span>{scenarios.scenario2.description}</span> </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div> <h3 className="font-semibold mb-2 text-center text-loss">매도 대상</h3> <ul className="space-y-2 max-h-60 overflow-y-auto"> {scenarios.scenario2.trades.filter(t => t.type === 'SELL').map(trade => ( <li key={trade.stockName} className="flex justify-between items-center p-2 bg-light-bg dark:bg-dark-bg/50 rounded"> <span className="font-semibold">{trade.stockName}</span> <span className="font-bold text-loss">{formatCurrency(trade.amount)}</span> </li> ))} </ul> </div>
              <div> <h3 className="font-semibold mb-2 text-center text-profit">매수 대상</h3> <ul className="space-y-2 max-h-60 overflow-y-auto"> {scenarios.scenario2.trades.filter(t => t.type === 'BUY').map(trade => ( <li key={trade.stockName} className="flex justify-between items-center p-2 bg-light-bg dark:bg-dark-bg/50 rounded"> <span className="font-semibold">{trade.stockName}</span> <span className="font-bold text-profit">{formatCurrency(trade.amount)}</span> </li> ))} </ul> </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 justify-end border-t border-gray-200/50 dark:border-slate-700/50 pt-4">
              <Button onClick={() => handleShowSimulation(scenarios.scenario2!)} variant="secondary" className="text-sm">예상 포트폴리오 보기</Button>
              <Button onClick={() => handleAiAnalysis(scenarios.scenario2!, 2)} variant="secondary" className="text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900/40 focus:ring-purple-500 flex items-center"> <SparklesIcon className="w-4 h-4 mr-2" /> AI로 심층 분석 </Button>
          </div>
          {aiAnalysis2.isVisible && ( <div className="mt-4 p-4 bg-light-bg dark:bg-dark-bg/50 rounded-lg border border-gray-200/50 dark:border-slate-700/50"> {aiAnalysis2.loading ? ( <div className="flex items-center justify-center text-sm"> <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-light-primary dark:border-dark-primary mr-3"></div> AI가 분석 중입니다... </div> ) : ( <div> <h4 className="font-semibold mb-2 text-light-text dark:text-dark-text">AI 분석 결과</h4> <pre className="whitespace-pre-wrap font-sans text-sm text-light-text dark:text-dark-text bg-white dark:bg-dark-bg p-3 rounded">{aiAnalysis2.result}</pre> <p className="text-xs text-light-secondary dark:text-dark-secondary mt-3 text-right">이 분석은 Google의 Gemini 모델을 통해 생성되었으며, 투자 참고용 정보입니다.</p> </div> )} </div> )}
        </Card>
      )}

      {!scenarios.scenario1 && !scenarios.scenario2 && ( <Card> <p className="text-center text-sm text-green-600 dark:text-green-400 py-4"> 이 종목은 현재 목표 비중에 가깝게 잘 유지되고 있어 리밸런싱이 필요하지 않습니다. </p> </Card> )}
    </div>
  );
};

export default RebalancingScreen;