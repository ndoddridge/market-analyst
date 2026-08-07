export enum MarketTrend {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  SIDEWAYS = 'SIDEWAYS',
}

export enum TrendMomentum {
  INCREASING = 'INCREASING',
  DECREASING = 'DECREASING',
  STABLE = 'STABLE',
}

export enum TrendStrength {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type TrendAnalysis = {
  trend: MarketTrend;
  strength: TrendStrength;
  momentum: TrendMomentum;
  priceChange30Days: number;
  volatility: number;
  summary: string;
};
