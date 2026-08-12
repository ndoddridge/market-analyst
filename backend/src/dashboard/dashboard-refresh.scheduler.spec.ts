import { AnalysisProfile } from '../analysis/types/analysis-profile';
import * as marketHours from '../shared/market-hours';
import { DashboardRefreshScheduler } from './dashboard-refresh.scheduler';

jest.mock('../shared/market-hours');

const mockIsMarketOpen = marketHours.isMarketOpen as jest.Mock;

describe('DashboardRefreshScheduler', () => {
  let dashboardService: { refresh: jest.Mock; getSnapshot: jest.Mock };
  let portfolioRepository: { getSettings: jest.Mock };
  let configService: { getAnalysisRefreshIntervalMs: jest.Mock };
  let scheduler: DashboardRefreshScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    dashboardService = {
      refresh: jest.fn().mockResolvedValue(undefined),
      getSnapshot: jest.fn().mockReturnValue(null),
    };
    portfolioRepository = {
      getSettings: jest
        .fn()
        .mockResolvedValue({ horizonProfile: AnalysisProfile.SHORT_TERM }),
    };
    configService = {
      getAnalysisRefreshIntervalMs: jest.fn().mockReturnValue(300000),
    };
    scheduler = new DashboardRefreshScheduler(
      dashboardService as never,
      portfolioRepository as never,
      configService as never,
    );
    mockIsMarketOpen.mockReturnValue(true);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });

  it('refreshes once immediately on module init using the persisted horizon', async () => {
    await scheduler.onModuleInit();
    expect(dashboardService.refresh).toHaveBeenCalledTimes(1);
    expect(dashboardService.refresh).toHaveBeenCalledWith(
      AnalysisProfile.SHORT_TERM,
    );
  });

  it('refreshes on every tick while the market is open', async () => {
    await scheduler.onModuleInit();
    dashboardService.refresh.mockClear();
    mockIsMarketOpen.mockReturnValue(true);

    await jest.advanceTimersByTimeAsync(300000);
    expect(dashboardService.refresh).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(300000);
    expect(dashboardService.refresh).toHaveBeenCalledTimes(2);
  });

  it('skips a closed-market tick when the last refresh is still fresh', async () => {
    mockIsMarketOpen.mockReturnValue(false);
    dashboardService.getSnapshot.mockReturnValue({
      staleness: {
        isStale: false,
        lastSuccessfulRefreshAt: new Date().toISOString(),
        lastAttemptError: null,
      },
    });

    await scheduler.onModuleInit();
    dashboardService.refresh.mockClear();

    // Well under the 300s interval — the last refresh is still fresh.
    await jest.advanceTimersByTimeAsync(60000);
    expect(dashboardService.refresh).not.toHaveBeenCalled();
  });

  it('refreshes while closed when there is no previous snapshot yet', async () => {
    mockIsMarketOpen.mockReturnValue(false);
    dashboardService.getSnapshot.mockReturnValue(null);

    await scheduler.onModuleInit();
    expect(dashboardService.refresh).toHaveBeenCalledTimes(1);
  });

  it('stops ticking after onModuleDestroy', async () => {
    await scheduler.onModuleInit();
    dashboardService.refresh.mockClear();
    scheduler.onModuleDestroy();

    await jest.advanceTimersByTimeAsync(300000 * 3);
    expect(dashboardService.refresh).not.toHaveBeenCalled();
  });
});
