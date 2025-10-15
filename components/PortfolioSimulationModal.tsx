import React from 'react';
import Modal from './ui/Modal';

interface SimulationData {
    data: {
        name: string;
        currentPercentage: number;
        newPercentage: number;
    }[];
    totalBefore: number;
    totalAfter: number;
}

interface PortfolioSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SimulationData | null;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(Math.round(value));

const PortfolioSimulationModal: React.FC<PortfolioSimulationModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="리밸런싱 시뮬레이션 결과">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 text-center p-4 bg-light-bg dark:bg-dark-bg/50 rounded-lg">
          <div>
            <p className="text-sm text-light-secondary dark:text-dark-secondary">현재 총 자산</p>
            <p className="text-lg font-bold text-light-text dark:text-dark-text">{formatCurrency(data.totalBefore)}</p>
          </div>
          <div>
            <p className="text-sm text-light-secondary dark:text-dark-secondary">예상 총 자산</p>
            <p className="text-lg font-bold text-light-primary dark:text-dark-primary">{formatCurrency(data.totalAfter)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="p-3 text-sm font-semibold text-light-secondary dark:text-dark-secondary">자산군</th>
                <th className="p-3 text-sm font-semibold text-light-secondary dark:text-dark-secondary text-right">현재 비중</th>
                <th className="p-3 text-sm font-semibold text-light-secondary dark:text-dark-secondary text-right">예상 비중</th>
                <th className="p-3 text-sm font-semibold text-light-secondary dark:text-dark-secondary text-right">변화</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.data.map(item => {
                const change = item.newPercentage - item.currentPercentage;
                return (
                  <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium text-light-text dark:text-dark-text">{item.name}</td>
                    <td className="p-3 text-right text-light-text dark:text-dark-text">{item.currentPercentage.toFixed(2)}%</td>
                    <td className="p-3 text-right font-semibold text-light-primary dark:text-dark-primary">{item.newPercentage.toFixed(2)}%</td>
                    <td className={`p-3 text-right font-semibold ${change >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default PortfolioSimulationModal;
