import type { NewsItem } from '../news/types/news-item';

const BROAD_MARKET_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO']);

const BROAD_MARKET_TERMS = [
  's&p 500',
  's&p',
  'sp500',
  'wall street',
  'nasdaq',
  'dow jones',
  'dow ',
  'federal reserve',
  'the fed',
  'interest rate',
  'treasury',
  'stock market',
  'equity market',
  'u.s. stocks',
  'us stocks',
  'futures',
  'recession',
  'inflation',
  'market rally',
  'market selloff',
  'broad market',
  'stock indexes',
  'stock index',
];

export function isBroadMarketEtf(ticker: string): boolean {
  return BROAD_MARKET_ETFS.has(ticker.toUpperCase());
}

function headlineMentionsTicker(title: string, ticker: string): boolean {
  const upper = title.toUpperCase();
  const token = ticker.toUpperCase();
  return new RegExp(`(^|[^A-Z0-9])${token}([^A-Z0-9]|$)`).test(upper);
}

function hasBroadMarketLanguage(title: string): boolean {
  const lower = title.toLowerCase();
  return BROAD_MARKET_TERMS.some((term) => lower.includes(term));
}

function relatedSingleNameTickers(relatedTickers: string[]): string[] {
  return relatedTickers
    .map((ticker) => ticker.toUpperCase())
    .filter(
      (ticker) => !BROAD_MARKET_ETFS.has(ticker) && !ticker.startsWith('^'),
    );
}

function headlineFocusesOnOtherRelatedTicker(
  item: NewsItem,
  ticker: string,
): boolean {
  const target = ticker.toUpperCase();
  const others = relatedSingleNameTickers(item.relatedTickers).filter(
    (value) => value !== target,
  );

  return others.some((other) => headlineMentionsTicker(item.title, other));
}

/**
 * Meaningful relevance only — do not treat a loose relatedTickers tag as enough.
 */
export function isNewsRelevantToTicker(
  item: NewsItem,
  ticker: string,
): boolean {
  const target = ticker.toUpperCase();
  const title = item.title?.trim() ?? '';
  if (!title) {
    return false;
  }

  const related = item.relatedTickers.map((value) => value.toUpperCase());
  const queried = item.querySymbol?.toUpperCase();

  if (isBroadMarketEtf(target)) {
    // Strongest signal: headline explicitly names the ETF.
    if (headlineMentionsTicker(title, target)) {
      return true;
    }

    // Broad market language is allowed, but not when the story is about another
    // related single-name/product ticker (e.g. JEPQ income pieces).
    if (!hasBroadMarketLanguage(title)) {
      return false;
    }

    return !headlineFocusesOnOtherRelatedTicker(item, target);
  }

  // Single-name equities: require direct ticker association.
  const directlyRelated =
    related.includes(target) ||
    queried === target ||
    headlineMentionsTicker(title, target);
  if (!directlyRelated) {
    return false;
  }

  if (headlineMentionsTicker(title, target)) {
    return true;
  }

  // Accept company news fetched for that ticker when related set is focused.
  if (queried === target && related.includes(target)) {
    const otherNames = relatedSingleNameTickers(related).filter(
      (value) => value !== target,
    );
    return otherNames.length <= 1;
  }

  return related[0] === target;
}
