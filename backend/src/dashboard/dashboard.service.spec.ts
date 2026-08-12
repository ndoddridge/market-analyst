import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { evaluateLongTermCandidate } from '../market/long-term-decision';
import { evaluateShortTermCandidate } from '../market/short-term-decision';
import { SetupQuality, TodayAction } from '../market/types/market-today';
import type { PersistedPortfolio } from '../portfolio/types/portfolio-store';
import { DashboardService } from './dashboard.service';

jest.mock('../market/short-term-decision');
jest.mock('../market/long-term-decision');

const mockEvaluateShortTerm = evaluateShortTermCandidate as jest.Mock;
const mockEvaluateLongTerm = evaluateLongTermCandidate as jest.Mock;

function scannerResult(
  ticker: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    ticker,
    companyName: ticker,
    profile: AnalysisProfile.SHORT_TERM,
    recommendation: 'WATCH',
    score: 60,
    confidence: 0.6,
    suggestedHoldingWindow: { minDays: 1, maxDays: 5 },
    recommendedAction: 'Wait.',
    ...overrides,
  };
}

function emptyPortfolio(): PersistedPortfolio {
  return {
    positions: [],
    uploadedAt: null,
    sourceFilename: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function quote(symbol: string, price: number) {
  return {
    symbol,
    price,
    currency: 'USD',
    timestamp: '2026-08-01T00:00:00.000Z',
    source: 'Test',
  };
}

describe('DashboardService', () => {
  let portfolioRepository: {
    getPortfolio: jest.Mock;
    getSettings: jest.Mock;
  };
  let scannerService: { scan: jest.Mock };
  let newsService: { getRecentNews: jest.Mock };
  let eventsService: { getUpcomingEvents: jest.Mock };
  let marketService: { getQuote: jest.Mock; getExtendedQuote: jest.Mock };
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();

    portfolioRepository = {
      getPortfolio: jest.fn(),
      getSettings: jest.fn(),
    };
    scannerService = { scan: jest.fn() };
    newsService = { getRecentNews: jest.fn().mockResolvedValue([]) };
    eventsService = { getUpcomingEvents: jest.fn().mockResolvedValue([]) };
    marketService = {
      getQuote: jest.fn().mockRejectedValue(new Error('no quote configured')),
      getExtendedQuote: jest
        .fn()
        .mockRejectedValue(new Error('no extended quote')),
    };

    service = new DashboardService(
      portfolioRepository as never,
      scannerService as never,
      newsService as never,
      eventsService as never,
      marketService as never,
    );

    mockEvaluateShortTerm.mockImplementation((result: { ticker: string }) => ({
      result,
      catalyst: null,
      catalystScore: 0,
      catalystNote: null,
      setupQuality: SetupQuality.MODERATE,
      presentationRecommendation: TodayAction.WATCH,
    }));
    mockEvaluateLongTerm.mockImplementation((result: { ticker: string }) => ({
      result,
      catalyst: null,
      setupQuality: SetupQuality.MODERATE,
      presentationRecommendation: TodayAction.WATCH,
    }));
  });

  it('excludes held tickers from the buy-candidate universe scan', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue({
      positions: [
        { ticker: 'AAPL', shares: 1, avgCost: 100, currentPrice: 110 },
      ],
      uploadedAt: '2026-08-01T00:00:00.000Z',
      sourceFilename: 'x.csv',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    portfolioRepository.getSettings.mockResolvedValue({
      horizonProfile: AnalysisProfile.SHORT_TERM,
    });
    scannerService.scan.mockImplementation(
      ({ watchlist }: { watchlist: string[] }) =>
        Promise.resolve(
          watchlist.includes('AAPL') ? [scannerResult('AAPL')] : [],
        ),
    );
    marketService.getQuote.mockResolvedValue(quote('AAPL', 111));

    await service.refresh(AnalysisProfile.SHORT_TERM);

    expect(scannerService.scan).toHaveBeenCalledTimes(2);
    const watchlists = scannerService.scan.mock.calls.map(
      (call: [{ watchlist: string[] }]) => call[0].watchlist,
    );
    const buyWatchlist = watchlists.find(
      (list: string[]) => !list.includes('AAPL'),
    );
    expect(buyWatchlist).toBeDefined();
    expect(buyWatchlist).not.toContain('AAPL');
  });

  it('returns 5 buy candidates with WATCH fallback when the universe supports it', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue(emptyPortfolio());
    const results = Array.from({ length: 6 }, (_, i) =>
      scannerResult(`T${i}`, { score: 90 - i }),
    );
    scannerService.scan.mockResolvedValue(results);
    marketService.getQuote.mockResolvedValue(quote('X', 100));

    await service.refresh(AnalysisProfile.SHORT_TERM);
    const snapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM)!;

    expect(snapshot.buyCandidates).toHaveLength(5);
    expect(snapshot.buyCandidatesNote).toBeNull();
    expect(
      snapshot.buyCandidates.every(
        (c) => c.recommendation === TodayAction.WATCH,
      ),
    ).toBe(true);
  });

  it('returns fewer than 5 candidates with an explicit note instead of padding', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue(emptyPortfolio());
    scannerService.scan.mockResolvedValue([
      scannerResult('ONLYONE', { score: 90 }),
    ]);
    marketService.getQuote.mockResolvedValue(quote('ONLYONE', 100));

    await service.refresh(AnalysisProfile.SHORT_TERM);
    const snapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM)!;

    expect(snapshot.buyCandidates).toHaveLength(1);
    expect(snapshot.buyCandidatesNote).toMatch(/Only 1 candidate/);
  });

  it('marks a candidate priceUnavailable (never fabricates $0) when the quote fetch fails', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue(emptyPortfolio());
    scannerService.scan.mockResolvedValue([scannerResult('FAIL')]);
    marketService.getQuote.mockRejectedValue(new Error('no quote'));

    await service.refresh(AnalysisProfile.SHORT_TERM);
    const snapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM)!;

    expect(snapshot.buyCandidates[0].priceUnavailable).toBe(true);
    expect(snapshot.buyCandidates[0].currentPrice).toBeNull();
  });

  it('produces position cards without inventing a catalyst when news/events are empty', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue({
      positions: [
        { ticker: 'AAPL', shares: 1, avgCost: 100, currentPrice: 110 },
      ],
      uploadedAt: '2026-08-01T00:00:00.000Z',
      sourceFilename: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    scannerService.scan.mockImplementation(
      ({ watchlist }: { watchlist: string[] }) =>
        Promise.resolve(
          watchlist.includes('AAPL') ? [scannerResult('AAPL')] : [],
        ),
    );
    marketService.getQuote.mockResolvedValue(quote('AAPL', 111));

    await service.refresh(AnalysisProfile.SHORT_TERM);
    const snapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM)!;

    expect(snapshot.positions[0].catalyst).toBeNull();
  });

  it('uses evaluateLongTermCandidate (not evaluateShortTermCandidate) for LONG_TERM', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue(emptyPortfolio());
    scannerService.scan.mockResolvedValue([scannerResult('X')]);
    marketService.getQuote.mockResolvedValue(quote('X', 10));

    await service.refresh(AnalysisProfile.LONG_TERM);

    expect(mockEvaluateLongTerm).toHaveBeenCalled();
    expect(mockEvaluateShortTerm).not.toHaveBeenCalled();
  });

  it('produces a buy-only snapshot with empty (not zeroed) positions when never uploaded', async () => {
    portfolioRepository.getPortfolio.mockResolvedValue(emptyPortfolio());
    scannerService.scan.mockResolvedValue([scannerResult('X')]);
    marketService.getQuote.mockResolvedValue(quote('X', 10));

    await service.refresh(AnalysisProfile.SHORT_TERM);
    const snapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM)!;

    expect(snapshot.portfolioEverUploaded).toBe(false);
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.summary).toBeNull();
  });

  it('keeps the last-good snapshot and marks it stale when a refresh throws', async () => {
    portfolioRepository.getPortfolio.mockResolvedValueOnce(emptyPortfolio());
    scannerService.scan.mockResolvedValue([]);
    await service.refresh(AnalysisProfile.SHORT_TERM);
    const goodSnapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM);
    expect(goodSnapshot?.staleness.isStale).toBe(false);

    portfolioRepository.getPortfolio.mockRejectedValueOnce(new Error('boom'));
    await service.refresh(AnalysisProfile.SHORT_TERM);
    const staleSnapshot = service.getSnapshot(AnalysisProfile.SHORT_TERM);

    expect(staleSnapshot?.staleness.isStale).toBe(true);
    expect(staleSnapshot?.staleness.lastAttemptError).toMatch(/boom/);
    expect(staleSnapshot?.buyCandidates).toEqual(goodSnapshot?.buyCandidates);
  });
});
