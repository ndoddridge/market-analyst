import type { NewsItem } from '../news/types/news-item';

const BROAD_MARKET_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO']);

const PEER_PRODUCT_TERMS = [
  'fee',
  'fees',
  'expense ratio',
  'assets',
  'aum',
  'trillion',
  'holders are paying',
  'cheaper',
  'costing',
  'flows',
  'inflow',
  'outflow',
  'structure',
];

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

export function headlineMentionsTicker(title: string, ticker: string): boolean {
  const upper = title.toUpperCase();
  const token = ticker.toUpperCase();
  return new RegExp(`(^|[^A-Z0-9])${token}([^A-Z0-9]|$)`).test(upper);
}

export function hasBroadMarketLanguage(title: string): boolean {
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

function peerEtfs(target: string): string[] {
  const upper = target.toUpperCase();
  return [...BROAD_MARKET_ETFS].filter((ticker) => ticker !== upper);
}

/**
 * True when the headline is primarily about a peer ETF's product story
 * (fees/AUM/flows/structure), not an independent broad-market catalyst.
 */
export function isPeerEtfProductStory(title: string, ticker: string): boolean {
  const lower = title.toLowerCase();
  const peers = peerEtfs(ticker).filter((peer) =>
    headlineMentionsTicker(title, peer),
  );
  if (peers.length === 0) {
    return false;
  }

  const hasProductAngle = PEER_PRODUCT_TERMS.some((term) =>
    lower.includes(term),
  );
  if (!hasProductAngle) {
    return false;
  }

  // If a peer ETF is named and the piece is about product economics, reject
  // even when the target ticker is mentioned secondarily ("SPY holders...").
  return true;
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
 * Meaningful relevance only — do not treat ETF equivalence or loose tags as enough.
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
    // Peer ETF fee/AUM/flow pieces are not SPY/QQQ catalysts by equivalence.
    if (isPeerEtfProductStory(title, target)) {
      return false;
    }

    // Direct target mention is valid when the story is not a peer-product piece.
    if (headlineMentionsTicker(title, target)) {
      // Require the target to be primary-ish: mentioned before any peer ETF,
      // or no peer ETF mentioned.
      const peerMentioned = peerEtfs(target).some((peer) =>
        headlineMentionsTicker(title, peer),
      );
      if (!peerMentioned) {
        return true;
      }

      const upper = title.toUpperCase();
      const targetIdx = upper.search(new RegExp(`\\b${target}\\b`));
      const peerIdx = Math.min(
        ...peerEtfs(target)
          .map((peer) => upper.search(new RegExp(`\\b${peer}\\b`)))
          .filter((idx) => idx >= 0),
      );
      return targetIdx >= 0 && targetIdx <= peerIdx;
    }

    // Broad market language is allowed when not hijacked by another product ticker.
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

  if (queried === target && related.includes(target)) {
    const otherNames = relatedSingleNameTickers(related).filter(
      (value) => value !== target,
    );
    return otherNames.length <= 1;
  }

  return related[0] === target;
}

/**
 * Higher is better. Returns -1 when irrelevant.
 * Prefer: direct ticker mention > broad market > weak adjacency.
 */
export function scoreNewsCatalyst(
  item: NewsItem,
  ticker: string,
  now: Date = new Date(),
): number {
  if (!isNewsRelevantToTicker(item, ticker)) {
    return -1;
  }

  let score = 0;
  const title = item.title;
  const target = ticker.toUpperCase();

  if (
    headlineMentionsTicker(title, target) &&
    !isPeerEtfProductStory(title, target)
  ) {
    score += 100;
  } else if (hasBroadMarketLanguage(title)) {
    score += 60;
  } else {
    score += 20;
  }

  if (item.querySymbol?.toUpperCase() === target) {
    score += 10;
  }

  const published = new Date(item.publishedAt).getTime();
  if (!Number.isNaN(published)) {
    const ageHours = (now.getTime() - published) / (60 * 60 * 1000);
    score += Math.max(0, 24 - ageHours / 3);
  }

  return score;
}
