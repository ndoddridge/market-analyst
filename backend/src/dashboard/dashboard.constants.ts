/**
 * Fixed, sector-diverse buy-candidate universe. Widened from the original
 * 12-ticker list so at least 5 BUY/WATCH candidates can usually be found
 * after excluding held tickers. Not a dynamic scanner — out of scope.
 */
export const BUY_UNIVERSE: readonly string[] = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMD',
  'META',
  'TSM',
  'SPY',
  'QQQ',
  'AMZN',
  'GOOGL',
  'AVGO',
  'MU',
  'JPM',
  'XOM',
  'JNJ',
  'V',
  'COST',
  'NFLX',
  'CRM',
  'PLTR',
];

export const MAX_BUY_CANDIDATES = 5;
