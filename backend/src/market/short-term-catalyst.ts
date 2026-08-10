import type { NewsItem } from '../news/types/news-item';
import {
  hasBroadMarketLanguage,
  headlineMentionsTicker,
  isBroadMarketEtf,
  isNewsRelevantToTicker,
  isPeerEtfProductStory,
  scoreNewsCatalyst,
} from './catalyst-relevance';

/**
 * ETF/fund fee, packaging, comparison, educational, or promotional language.
 * These articles are not meaningful 1–5 day price catalysts.
 */
const ETF_FUND_PRODUCT_PROMO_TERMS = [
  'fee',
  'fees',
  'expense ratio',
  'expense',
  'toll',
  'minimum',
  'charges to buy',
  'costing',
  'cheaper',
  'holders are paying',
  'same s&p',
  'same index',
  'same fund',
  'mutual fund',
  'vanguard sells',
  'fidelity charges',
  'assets under management',
  ' aum',
  'aum ',
  'trillion etf',
  'first $1 trillion',
  'etf to buy',
  'best etf',
  'etf warren',
  'recommends most people',
  'what is an etf',
  'how to buy',
  'how to invest in',
  'should you buy',
  'forget vfiax',
  'without the $',
  'inflows',
  'outflows',
  'fund flows',
];

/** Named mutual-fund / peer-ETF products that often appear in comparison pieces. */
const FUND_PRODUCT_TICKERS = [
  'VFIAX',
  'VFINX',
  'FXAIX',
  'SWPPX',
  'VOO',
  'IVV',
  'VTI',
  'QQQM',
  'SPLG',
  'JEPQ',
  'QYLD',
];

/**
 * Language that can reasonably move SPY/QQQ (or the broad market) over 1–5 sessions.
 */
const MARKET_MOVING_TERMS = [
  'federal reserve',
  'the fed',
  'fomc',
  'powell',
  'interest rate',
  'rate cut',
  'rate hike',
  'rate decision',
  'inflation',
  'cpi',
  'ppi',
  'pce',
  'jobs report',
  'nonfarm',
  'payroll',
  'unemployment',
  'gdp',
  'recession',
  'treasury yield',
  'bond yield',
  'futures',
  'market rally',
  'market selloff',
  'market sell-off',
  'stocks surge',
  'stocks plunge',
  'stocks tumble',
  'stocks drop',
  'stocks rally',
  'wall street',
  'tariff',
  'tariffs',
  'sanctions',
  'geopolit',
  'ceasefire',
  'oil shock',
  'crude oil',
];

const PRICE_ACTION_TERMS = [
  'climb',
  'climbs',
  'rise',
  'rises',
  'rising',
  'fall',
  'falls',
  'falling',
  'drop',
  'drops',
  'surge',
  'surges',
  'plunge',
  'plunges',
  'rally',
  'rallies',
  'selloff',
  'sell-off',
  'gain',
  'gains',
  'jump',
  'jumps',
  'slide',
  'slides',
  'tumble',
  'tumbles',
  'soar',
  'soars',
  'sink',
  'sinks',
];

/** Company-level substance for single-name SHORT_TERM catalysts. */
const COMPANY_SUBSTANCE_TERMS = [
  'earning',
  'revenue',
  'guidance',
  'forecast',
  'outlook',
  'demand',
  'orders',
  'chip',
  'product',
  'launch',
  'lawsuit',
  'probe',
  'investigation',
  'ceo',
  'cfo',
  'acquisition',
  'merger',
  'buyback',
  'dividend',
  'upgrade',
  'downgrade',
  'price target',
  'beats',
  'misses',
  'raises',
  'cuts',
  'recall',
  'fda',
  'contract',
  'partnership',
];

/**
 * Minimum score before SHORT_TERM ranking may boost on news.
 * Meaningfulness is gated first; this only drops leftover weak adjacency scores.
 */
export const SHORT_TERM_NEWS_BOOST_MIN_SCORE = 25;

function titleContainsTerm(titleLower: string, term: string): boolean {
  // Short tokens need word boundaries ("fee" must not match "coffee").
  if (term.trim().length <= 4) {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(
      titleLower,
    );
  }
  return titleLower.includes(term);
}

export function isEtfOrFundProductOrPromoStory(title: string): boolean {
  const lower = title.toLowerCase();
  if (!lower.trim()) {
    return false;
  }

  if (ETF_FUND_PRODUCT_PROMO_TERMS.some((term) => titleContainsTerm(lower, term))) {
    return true;
  }

  const mentionsFundTicker = FUND_PRODUCT_TICKERS.some((ticker) =>
    headlineMentionsTicker(title, ticker),
  );
  if (
    mentionsFundTicker &&
    (lower.includes('fund') ||
      lower.includes('etf') ||
      lower.includes('index') ||
      lower.includes('vanguard') ||
      lower.includes('fidelity'))
  ) {
    return true;
  }

  // "S&P 500 fund/ETF" packaging copy without market-moving context.
  if (
    (lower.includes('s&p 500 fund') ||
      lower.includes('s&p 500 etf') ||
      lower.includes('same s&p')) &&
    !hasMarketMovingLanguage(title)
  ) {
    return true;
  }

  return false;
}

export function hasMarketMovingLanguage(title: string): boolean {
  const lower = title.toLowerCase();
  return MARKET_MOVING_TERMS.some((term) => lower.includes(term));
}

export function hasPriceActionLanguage(title: string): boolean {
  const lower = title.toLowerCase();
  return PRICE_ACTION_TERMS.some((term) => {
    return new RegExp(`(^|[^a-z])${term}([^a-z]|$)`, 'i').test(lower);
  });
}

function hasCompanySubstance(title: string): boolean {
  const lower = title.toLowerCase();
  return COMPANY_SUBSTANCE_TERMS.some((term) => lower.includes(term));
}

/**
 * True when the headline is primarily about another equity, with the target
 * only as a secondary comparison (e.g. "Marvell (MRVL) vs. AVGO and NVDA").
 */
function isSecondaryTickerMention(item: NewsItem, ticker: string): boolean {
  const target = ticker.toUpperCase();
  const title = item.title;
  if (!headlineMentionsTicker(title, target)) {
    return false;
  }

  const upper = title.toUpperCase();
  const targetIdx = upper.search(new RegExp(`\\b${target}\\b`));
  if (targetIdx < 0) {
    return false;
  }

  const relatedOthers = item.relatedTickers
    .map((value) => value.toUpperCase())
    .filter(
      (value) =>
        value !== target &&
        !value.startsWith('^') &&
        !isBroadMarketEtf(value),
    );

  for (const other of relatedOthers) {
    const idx = upper.search(new RegExp(`\\b${other}\\b`));
    if (idx >= 0 && idx < targetIdx) {
      return true;
    }
  }

  // "Company (TICK) vs. ..." lead-ins where TICK is not the opportunity.
  const lead = title.match(/^([A-Za-z][A-Za-z0-9.&'-]+)\s+\(([A-Z]{1,5})\)/);
  if (lead && lead[2] !== target) {
    return true;
  }

  return false;
}

/**
 * SHORT_TERM-only: could this news reasonably influence the ticker over 1–5 sessions?
 * Does not alter LONG_TERM relevance helpers.
 */
export function isMeaningfulShortTermNewsCatalyst(
  item: NewsItem,
  ticker: string,
): boolean {
  const title = item.title?.trim() ?? '';
  if (!title) {
    return false;
  }

  if (isEtfOrFundProductOrPromoStory(title)) {
    return false;
  }

  if (isPeerEtfProductStory(title, ticker)) {
    return false;
  }

  // Must still clear the shared relevance gate (tags/ticker association).
  if (!isNewsRelevantToTicker(item, ticker)) {
    return false;
  }

  if (isBroadMarketEtf(ticker)) {
    // Prefer macro / Fed / geopolitics / index futures / clear ETF price action.
    if (hasMarketMovingLanguage(title)) {
      return true;
    }

    if (
      headlineMentionsTicker(title, ticker) &&
      hasPriceActionLanguage(title)
    ) {
      return true;
    }

    // Bare "S&P 500" / "Nasdaq" mentions without a market-moving hook are not enough.
    if (hasBroadMarketLanguage(title) && !hasMarketMovingLanguage(title)) {
      return false;
    }

    return false;
  }

  // Single-name: require a directly relevant company angle, not loose adjacency.
  if (isSecondaryTickerMention(item, ticker)) {
    return false;
  }

  if (headlineMentionsTicker(title, ticker)) {
    return true;
  }

  // Company name headlines (e.g. "NVIDIA demand...") need substance + tight tags.
  if (hasCompanySubstance(title)) {
    const related = item.relatedTickers.map((value) => value.toUpperCase());
    const queried = item.querySymbol?.toUpperCase();
    const target = ticker.toUpperCase();
    return queried === target && related.includes(target);
  }

  return false;
}

/**
 * SHORT_TERM news score for ranking/boost. Returns -1 when not a meaningful catalyst.
 */
export function scoreShortTermNewsCatalyst(
  item: NewsItem,
  ticker: string,
  now: Date = new Date(),
): number {
  if (!isMeaningfulShortTermNewsCatalyst(item, ticker)) {
    return -1;
  }

  // Start from shared scorer; meaningfulness already rejected product/promo noise.
  const base = scoreNewsCatalyst(item, ticker, now);
  if (base < 0) {
    return -1;
  }

  let score = base;

  if (isBroadMarketEtf(ticker) && hasMarketMovingLanguage(item.title)) {
    score += 15;
  } else if (!isBroadMarketEtf(ticker) && hasCompanySubstance(item.title)) {
    // Company-substance headlines often omit the ticker token ("NVIDIA demand...").
    score += 35;
  }

  return score;
}

export function shouldBoostShortTermNews(
  item: NewsItem,
  ticker: string,
  now: Date = new Date(),
): boolean {
  return (
    scoreShortTermNewsCatalyst(item, ticker, now) >=
    SHORT_TERM_NEWS_BOOST_MIN_SCORE
  );
}
