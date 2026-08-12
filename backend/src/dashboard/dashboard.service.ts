import { Injectable, Logger } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { EventsService } from '../events/events.service';
import type { MarketEvent } from '../events/types/market-event';
import { estimateNextOpen } from '../market/estimated-open';
import { evaluateLongTermCandidate } from '../market/long-term-decision';
import { MarketService } from '../market/market.service';
import { evaluateShortTermCandidate } from '../market/short-term-decision';
import type { EstimatedOpen } from '../market/types/estimated-open';
import {
  MarketDirection,
  SetupQuality,
  TodayAction,
  type MarketTodayCatalyst,
} from '../market/types/market-today';
import { NewsService } from '../news/news.service';
import type { NewsItem } from '../news/types/news-item';
import { PortfolioRepository } from '../portfolio/portfolio.repository';
import {
  calculateUnrealizedPlPercent,
  resolveLongTermPositionMove,
  resolvePositionMove,
} from '../portfolio/position-move';
import {
  PositionMove,
  type PortfolioBuyCandidate,
  type PortfolioPositionInput,
  type PortfolioSummary,
  type PositionAnalysisCard,
} from '../portfolio/types/portfolio';
import { ScannerService } from '../scanner/scanner.service';
import type { ScannerResult } from '../scanner/types/scanner-result';
import { toMarketIsoString } from '../shared/market-clock';
import { getMarketStatus } from '../shared/market-hours';
import type { MarketStatus } from '../shared/types/market-status';
import { BUY_UNIVERSE, MAX_BUY_CANDIDATES } from './dashboard.constants';
import { resolveTodaysMove } from './todays-move';
import type { DashboardSnapshot } from './types/dashboard';

const UNATTEMPTED_ESTIMATE: EstimatedOpen = {
  available: false,
  lowEstimate: null,
  highEstimate: null,
  estimatedChangePercent: null,
  gapDirection: null,
  method: null,
};

type EvaluatedCandidate = {
  result: ScannerResult;
  catalyst: MarketTodayCatalyst | null;
  catalystScore: number;
  setupQuality: SetupQuality;
  presentationRecommendation: TodayAction;
};

/**
 * A LONG_TERM catalyst strength proxy derived from already-computed signals
 * (setup quality already factors catalyst presence in) — not a fabricated
 * number, just a coarse banding for display alongside SHORT_TERM's richer score.
 */
function longTermCatalystScore(
  setupQuality: SetupQuality,
  catalyst: MarketTodayCatalyst | null,
): number {
  if (!catalyst) {
    return 0;
  }
  switch (setupQuality) {
    case SetupQuality.STRONG:
      return 80;
    case SetupQuality.MODERATE:
      return 50;
    default:
      return 25;
  }
}

function resolvePortfolioDirection(
  cards: readonly PositionAnalysisCard[],
): MarketDirection {
  let bullish = 0;
  let bearish = 0;
  for (const card of cards) {
    if (card.scannerRecommendation === TodayAction.BUY) {
      bullish += 1;
    } else if (card.scannerRecommendation === TodayAction.SELL) {
      bearish += 1;
    }
  }
  if (bullish > bearish) {
    return MarketDirection.BULLISH;
  }
  if (bearish > bullish) {
    return MarketDirection.BEARISH;
  }
  return MarketDirection.NEUTRAL;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPortfolioSummary(
  cards: readonly PositionAnalysisCard[],
): PortfolioSummary {
  const portfolioValue = roundMoney(
    cards.reduce((sum, card) => sum + card.marketValue, 0),
  );
  const totalUnrealizedPlValue = roundMoney(
    cards.reduce((sum, card) => sum + card.unrealizedPlValue, 0),
  );
  const costBasis = portfolioValue - totalUnrealizedPlValue;
  const totalUnrealizedPlPercent =
    costBasis > 0
      ? Math.round((totalUnrealizedPlValue / costBasis) * 10000) / 100
      : 0;

  const byScore = [...cards].sort((a, b) => b.signalScore - a.signalScore);
  const moveOrder: Record<PositionMove, number> = {
    [PositionMove.SELL]: 0,
    [PositionMove.REDUCE]: 1,
    [PositionMove.ADD]: 2,
    [PositionMove.WATCH]: 3,
    [PositionMove.HOLD]: 4,
  };

  const recommendedActions = [...cards]
    .sort(
      (a, b) =>
        moveOrder[a.recommendedMove] - moveOrder[b.recommendedMove] ||
        b.signalScore - a.signalScore,
    )
    .map((card) => ({ move: card.recommendedMove, ticker: card.ticker }));

  return {
    portfolioValue,
    totalUnrealizedPlValue,
    totalUnrealizedPlPercent,
    positions: cards.length,
    strongestPosition: byScore[0]?.ticker ?? null,
    weakestPosition: byScore[byScore.length - 1]?.ticker ?? null,
    recommendedActions,
  };
}

/**
 * Builds and caches the dashboard snapshot per analysis profile. `refresh()`
 * is the only method that performs I/O; `getSnapshot()` is a cheap cache
 * read used by the polled GET /dashboard endpoint.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly snapshots = new Map<AnalysisProfile, DashboardSnapshot>();

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly scannerService: ScannerService,
    private readonly newsService: NewsService,
    private readonly eventsService: EventsService,
    private readonly marketService: MarketService,
  ) {}

  getSnapshot(profile: AnalysisProfile): DashboardSnapshot | null {
    return this.snapshots.get(profile) ?? null;
  }

  /**
   * Rebuilds the snapshot for `profile`. Never throws — on failure, the
   * previous good snapshot (if any) is kept and marked stale rather than
   * discarded.
   */
  async refresh(profile: AnalysisProfile): Promise<void> {
    try {
      const snapshot = await this.buildSnapshot(profile);
      this.snapshots.set(profile, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Dashboard refresh failed for ${profile}: ${message}`);
      const previous = this.snapshots.get(profile);
      if (previous) {
        this.snapshots.set(profile, {
          ...previous,
          staleness: {
            isStale: true,
            lastSuccessfulRefreshAt: previous.staleness.lastSuccessfulRefreshAt,
            lastAttemptError: message,
          },
        });
      }
    }
  }

  private async buildSnapshot(
    profile: AnalysisProfile,
  ): Promise<DashboardSnapshot> {
    const now = new Date();
    const marketStatus = getMarketStatus(now);
    const portfolio = await this.portfolioRepository.getPortfolio();
    const heldTickers = portfolio.positions.map((position) => position.ticker);
    const buyUniverse = BUY_UNIVERSE.filter(
      (ticker) => !heldTickers.includes(ticker),
    );
    const focusTickers = [...new Set([...heldTickers, ...buyUniverse])];

    const [heldResults, buyResults, news, events] = await Promise.all([
      heldTickers.length > 0
        ? this.scannerService.scan({ watchlist: heldTickers, profile })
        : Promise.resolve<ScannerResult[]>([]),
      this.scannerService.scan({ watchlist: buyUniverse, profile }),
      this.newsService.getRecentNews(focusTickers).catch(() => []),
      this.eventsService.getUpcomingEvents(focusTickers).catch(() => []),
    ]);

    const positions = await Promise.all(
      portfolio.positions.map((position) =>
        this.buildPositionCard(
          position,
          heldResults,
          news,
          events,
          profile,
          now,
          marketStatus,
        ),
      ),
    );

    const direction = resolvePortfolioDirection(positions);
    for (const card of positions) {
      card.marketDirection = direction;
    }

    const { candidates: buyCandidates, note: buyCandidatesNote } =
      await this.buildBuyCandidates(buyResults, news, events, profile, now);

    const summary =
      portfolio.positions.length > 0 ? buildPortfolioSummary(positions) : null;
    const todaysMove = resolveTodaysMove(positions, buyCandidates);

    return {
      profile,
      generatedAt: toMarketIsoString(now),
      marketStatus,
      portfolioEverUploaded: portfolio.uploadedAt !== null,
      todaysMove,
      positions,
      summary,
      buyCandidates,
      buyCandidatesNote,
      staleness: {
        isStale: false,
        lastSuccessfulRefreshAt: toMarketIsoString(now),
        lastAttemptError: null,
      },
    };
  }

  private async buildPositionCard(
    position: PortfolioPositionInput,
    scanResults: readonly ScannerResult[],
    news: readonly NewsItem[],
    events: readonly MarketEvent[],
    profile: AnalysisProfile,
    now: Date,
    marketStatus: MarketStatus,
  ): Promise<PositionAnalysisCard> {
    const [currentPrice, estimatedOpen] = await Promise.all([
      this.resolveLivePrice(position),
      marketStatus.isOpen
        ? Promise.resolve(UNATTEMPTED_ESTIMATE)
        : this.resolveEstimatedOpen(position.ticker),
    ]);

    const scanner = scanResults.find(
      (result) => result.ticker.toUpperCase() === position.ticker,
    );

    if (!scanner) {
      return this.toCard({
        position,
        currentPrice,
        estimatedOpen,
        recommendation: TodayAction.WATCH,
        signalScore: 0,
        catalystScore: 0,
        setupQuality: SetupQuality.WEAK,
        catalyst: null,
        move: {
          move: PositionMove.WATCH,
          reason: `${profile} scanner evidence was unavailable for ${position.ticker}; watch the existing position without inventing a trade.`,
        },
      });
    }

    if (profile === AnalysisProfile.SHORT_TERM) {
      const candidate = evaluateShortTermCandidate(scanner, news, events, now);
      return this.toCard({
        position,
        currentPrice,
        estimatedOpen,
        recommendation: candidate.presentationRecommendation,
        signalScore: candidate.result.score,
        catalystScore: candidate.catalystScore,
        setupQuality: candidate.setupQuality,
        catalyst: candidate.catalyst,
        move: resolvePositionMove(candidate),
      });
    }

    const candidate = evaluateLongTermCandidate(scanner, news, events, now);
    return this.toCard({
      position,
      currentPrice,
      estimatedOpen,
      recommendation: candidate.presentationRecommendation,
      signalScore: candidate.result.score,
      catalystScore: longTermCatalystScore(
        candidate.setupQuality,
        candidate.catalyst,
      ),
      setupQuality: candidate.setupQuality,
      catalyst: candidate.catalyst,
      move: resolveLongTermPositionMove(candidate),
    });
  }

  private toCard(options: {
    position: PortfolioPositionInput;
    currentPrice: number;
    estimatedOpen: EstimatedOpen;
    recommendation: TodayAction;
    signalScore: number;
    catalystScore: number;
    setupQuality: SetupQuality;
    catalyst: MarketTodayCatalyst | null;
    move: { move: PositionMove; reason: string };
  }): PositionAnalysisCard {
    const {
      position,
      currentPrice,
      estimatedOpen,
      recommendation,
      signalScore,
      catalystScore,
      setupQuality,
      catalyst,
      move,
    } = options;
    const marketValue = position.shares * currentPrice;
    const costBasis = position.shares * position.avgCost;

    return {
      ticker: position.ticker,
      shares: position.shares,
      avgCost: position.avgCost,
      currentPrice,
      unrealizedPlPercent: calculateUnrealizedPlPercent(
        position.avgCost,
        currentPrice,
      ),
      marketValue: roundMoney(marketValue),
      unrealizedPlValue: roundMoney(marketValue - costBasis),
      scannerRecommendation: recommendation,
      signalScore,
      catalystScore,
      setupQuality,
      catalyst,
      marketDirection: MarketDirection.NEUTRAL,
      recommendedMove: move.move,
      reason: move.reason,
      estimatedOpen,
    };
  }

  /** Live quote when available; falls back to the last persisted price rather than fabricating one. */
  private async resolveLivePrice(
    position: PortfolioPositionInput,
  ): Promise<number> {
    try {
      const quote = await this.marketService.getQuote(position.ticker);
      return quote.price;
    } catch {
      return position.currentPrice;
    }
  }

  private async resolveEstimatedOpen(ticker: string): Promise<EstimatedOpen> {
    try {
      const extended = await this.marketService.getExtendedQuote(ticker);
      return estimateNextOpen(extended);
    } catch {
      return UNATTEMPTED_ESTIMATE;
    }
  }

  private async buildBuyCandidates(
    buyResults: readonly ScannerResult[],
    news: readonly NewsItem[],
    events: readonly MarketEvent[],
    profile: AnalysisProfile,
    now: Date,
  ): Promise<{ candidates: PortfolioBuyCandidate[]; note: string | null }> {
    const evaluated: EvaluatedCandidate[] =
      profile === AnalysisProfile.SHORT_TERM
        ? buyResults.map((result) => {
            const candidate = evaluateShortTermCandidate(
              result,
              news,
              events,
              now,
            );
            return {
              result: candidate.result,
              catalyst: candidate.catalyst,
              catalystScore: candidate.catalystScore,
              setupQuality: candidate.setupQuality,
              presentationRecommendation: candidate.presentationRecommendation,
            };
          })
        : buyResults.map((result) => {
            const candidate = evaluateLongTermCandidate(
              result,
              news,
              events,
              now,
            );
            return {
              result: candidate.result,
              catalyst: candidate.catalyst,
              catalystScore: longTermCatalystScore(
                candidate.setupQuality,
                candidate.catalyst,
              ),
              setupQuality: candidate.setupQuality,
              presentationRecommendation: candidate.presentationRecommendation,
            };
          });

    const qualified = evaluated
      .filter(
        (candidate) =>
          candidate.presentationRecommendation === TodayAction.BUY ||
          candidate.presentationRecommendation === TodayAction.WATCH,
      )
      .sort(
        (a, b) =>
          b.result.score - a.result.score || b.catalystScore - a.catalystScore,
      )
      .slice(0, MAX_BUY_CANDIDATES);

    const candidates = await Promise.all(
      qualified.map(async (candidate): Promise<PortfolioBuyCandidate> => {
        const { price, unavailable } = await this.resolveQuotePrice(
          candidate.result.ticker,
        );
        return {
          ticker: candidate.result.ticker,
          currentPrice: price,
          priceUnavailable: unavailable,
          signalScore: candidate.result.score,
          recommendation: candidate.presentationRecommendation,
          setupQuality: candidate.setupQuality,
          catalyst: candidate.catalyst,
          reason: `${candidate.result.ticker} is a ${profile} scanner candidate (score ${candidate.result.score}).`,
        };
      }),
    );

    const note =
      candidates.length < MAX_BUY_CANDIDATES
        ? `Only ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} met BUY/WATCH criteria today; showing ${candidates.length}.`
        : null;

    return { candidates, note };
  }

  private async resolveQuotePrice(
    ticker: string,
  ): Promise<{ price: number | null; unavailable: boolean }> {
    try {
      const quote = await this.marketService.getQuote(ticker);
      return { price: quote.price, unavailable: false };
    } catch {
      return { price: null, unavailable: true };
    }
  }
}
