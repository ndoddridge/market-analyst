export type ExtendedQuote = {
  symbol: string;
  regularMarketPreviousClose: number | null;
  preMarketPrice: number | null;
  postMarketPrice: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  marketState: string | null;
};
