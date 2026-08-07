export enum SignalDirection {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  NEUTRAL = 'NEUTRAL',
}

export enum SignalCategory {
  TREND = 'TREND',
  MOMENTUM = 'MOMENTUM',
  VOLATILITY = 'VOLATILITY',
  COMPANY = 'COMPANY',
  NEWS = 'NEWS',
  TECHNICAL = 'TECHNICAL',
  MARKET = 'MARKET',
}

export type Signal = {
  id: string;
  title: string;
  description: string;
  category: SignalCategory;
  weight: number;
  direction: SignalDirection;
};
