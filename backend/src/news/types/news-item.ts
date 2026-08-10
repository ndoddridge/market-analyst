export type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string | null;
  publishedAt: string;
  relatedTickers: string[];
  /** Symbol used to fetch this item (helps relevance ranking). */
  querySymbol: string;
  provider: string;
};
