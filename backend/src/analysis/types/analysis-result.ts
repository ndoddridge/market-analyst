import type { CompanyProfile } from '../../company/types/company-profile';
import type { MarketQuote } from '../../market/types/market-quote';
import type { Signal } from './signal';
import type { TrendAnalysis } from './trend-analysis';

export enum Recommendation {
  BUY = 'BUY',
  WATCH = 'WATCH',
  HOLD = 'HOLD',
  SELL = 'SELL',
}

export type HoldingWindow = {
  minDays: number;
  maxDays: number;
};

export type AnalysisResult = {
  symbol: string;
  score: number;
  confidence: number;
  recommendation: Recommendation;
  holdingWindow: HoldingWindow;
  signals: Signal[];
  summary: string;
  marketData: MarketQuote;
  company: CompanyProfile;
  trendAnalysis: TrendAnalysis;
};
