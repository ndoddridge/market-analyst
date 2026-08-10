import { BadRequestException, Injectable } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { EventsService } from '../events/events.service';
import { NewsService } from '../news/news.service';
import { evaluateShortTermCandidate } from '../market/short-term-decision';
import {
  MarketDirection,
  SetupQuality,
  TodayAction,
} from '../market/types/market-today';
import { ScannerService } from '../scanner/scanner.service';
import { toMarketIsoString } from '../shared/market-clock';
import { parsePortfolioCsv } from './portfolio-csv';
import {
  calculateUnrealizedPlPercent,
  resolvePositionMove,
} from './position-move';
import type {
  AnalyzePortfolioRequest,
  PortfolioAnalysisResult,
  PortfolioPositionInput,
  PositionAnalysisCard,
} from './types/portfolio';
import { PositionMove } from './types/portfolio';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly newsService: NewsService,
    private readonly eventsService: EventsService,
  ) {}

  parseCsv(csvText: string) {
    return parsePortfolioCsv(csvText);
  }

  async analyze(
    request: AnalyzePortfolioRequest,
  ): Promise<PortfolioAnalysisResult> {
    const positions = this.normalizePositions(request?.positions ?? []);
    if (positions.length === 0) {
      throw new BadRequestException('At least one valid position is required.');
    }

    const tickers = positions.map((position) => position.ticker);
    const now = new Date();

    const [scannerResults, news, events] = await Promise.all([
      this.scannerService.scan({
        watchlist: tickers,
        profile: AnalysisProfile.SHORT_TERM,
      }),
      this.newsService.getRecentNews(tickers),
      this.eventsService.getUpcomingEvents(tickers),
    ]);

    const cards: PositionAnalysisCard[] = [];

    for (const position of positions) {
      const scanner = scannerResults.find(
        (result) => result.ticker.toUpperCase() === position.ticker,
      );

      if (!scanner) {
        cards.push(this.fallbackCard(position));
        continue;
      }

      const candidate = evaluateShortTermCandidate(
        scanner,
        news,
        events,
        now,
      );
      const move = resolvePositionMove(candidate);
      const marketValue = position.shares * position.currentPrice;
      const costBasis = position.shares * position.avgCost;
      const unrealizedPlPercent = calculateUnrealizedPlPercent(
        position.avgCost,
        position.currentPrice,
      );

      cards.push({
        ticker: position.ticker,
        shares: position.shares,
        avgCost: position.avgCost,
        currentPrice: position.currentPrice,
        unrealizedPlPercent,
        marketValue: roundMoney(marketValue),
        unrealizedPlValue: roundMoney(marketValue - costBasis),
        scannerRecommendation: candidate.presentationRecommendation,
        signalScore: candidate.result.score,
        catalystScore: candidate.catalystScore,
        setupQuality: candidate.setupQuality,
        catalyst: candidate.catalyst,
        marketDirection: MarketDirection.NEUTRAL,
        recommendedMove: move.move,
        reason: move.reason,
      });
    }

    // Attach a simple portfolio-level direction from the cards' scanner bias.
    const direction = this.resolvePortfolioDirection(cards);
    for (const card of cards) {
      card.marketDirection = direction;
    }

    return {
      summary: this.buildSummary(cards),
      positions: cards,
      generatedAt: toMarketIsoString(now),
    };
  }

  private normalizePositions(
    input: PortfolioPositionInput[],
  ): PortfolioPositionInput[] {
    const seen = new Set<string>();
    const positions: PortfolioPositionInput[] = [];

    for (const row of input) {
      const ticker = String(row?.ticker ?? '')
        .trim()
        .toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
        throw new BadRequestException(`Invalid ticker "${row?.ticker ?? ''}".`);
      }
      if (seen.has(ticker)) {
        throw new BadRequestException(`Duplicate ticker "${ticker}".`);
      }

      const shares = Number(row.shares);
      const avgCost = Number(row.avgCost);
      const currentPrice = Number(row.currentPrice);
      if (!Number.isFinite(shares) || shares <= 0) {
        throw new BadRequestException(`Invalid shares for ${ticker}.`);
      }
      if (!Number.isFinite(avgCost) || avgCost <= 0) {
        throw new BadRequestException(`Invalid avgCost for ${ticker}.`);
      }
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new BadRequestException(`Invalid currentPrice for ${ticker}.`);
      }

      seen.add(ticker);
      positions.push({ ticker, shares, avgCost, currentPrice });
    }

    return positions;
  }

  private fallbackCard(position: PortfolioPositionInput): PositionAnalysisCard {
    const marketValue = position.shares * position.currentPrice;
    const costBasis = position.shares * position.avgCost;
    return {
      ticker: position.ticker,
      shares: position.shares,
      avgCost: position.avgCost,
      currentPrice: position.currentPrice,
      unrealizedPlPercent: calculateUnrealizedPlPercent(
        position.avgCost,
        position.currentPrice,
      ),
      marketValue: roundMoney(marketValue),
      unrealizedPlValue: roundMoney(marketValue - costBasis),
      scannerRecommendation: TodayAction.WATCH,
      signalScore: 0,
      catalystScore: 0,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      marketDirection: MarketDirection.NEUTRAL,
      recommendedMove: PositionMove.WATCH,
      reason: `SHORT_TERM scanner evidence was unavailable for ${position.ticker}; watch the existing position without inventing a trade.`,
    };
  }

  private resolvePortfolioDirection(
    cards: PositionAnalysisCard[],
  ): MarketDirection {
    let bullish = 0;
    let bearish = 0;
    for (const card of cards) {
      if (
        card.scannerRecommendation === TodayAction.BUY ||
        card.scannerRecommendation === TodayAction.WATCH
      ) {
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

  private buildSummary(cards: PositionAnalysisCard[]) {
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
      .map((card) => ({
        move: card.recommendedMove,
        ticker: card.ticker,
      }));

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
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
