export type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string | null;
  publishedAt: string;
  relatedTickers: string[];
  provider: string;
};
