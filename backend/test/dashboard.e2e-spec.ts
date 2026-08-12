import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EventsService } from '../src/events/events.service';
import { MarketService } from '../src/market/market.service';
import { NewsService } from '../src/news/news.service';
import { ScannerService } from '../src/scanner/scanner.service';

type PortfolioPosition = {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
};

type DashboardBody = {
  portfolioEverUploaded: boolean;
  positions: Array<{ ticker: string }>;
  summary: unknown;
};

type PortfolioBody = {
  positions: PortfolioPosition[];
  uploadedAt: string | null;
};

describe('Dashboard + Portfolio persistence (e2e)', () => {
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    previousDataDir = process.env.PORTFOLIO_DATA_DIR;
    dataDir = await fs.mkdtemp(join(tmpdir(), 'dashboard-e2e-'));
    process.env.PORTFOLIO_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (previousDataDir === undefined) {
      delete process.env.PORTFOLIO_DATA_DIR;
    } else {
      process.env.PORTFOLIO_DATA_DIR = previousDataDir;
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  /**
   * Overrides the network-dependent leaf services so the e2e run is fast and
   * deterministic — this test exercises persistence + API wiring, not live
   * market-data providers (those are covered elsewhere).
   */
  async function buildApp(): Promise<INestApplication<App>> {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ScannerService)
      .useValue({ scan: jest.fn().mockResolvedValue([]) })
      .overrideProvider(NewsService)
      .useValue({ getRecentNews: jest.fn().mockResolvedValue([]) })
      .overrideProvider(EventsService)
      .useValue({ getUpcomingEvents: jest.fn().mockResolvedValue([]) })
      .overrideProvider(MarketService)
      .useValue({
        getQuote: jest.fn().mockRejectedValue(new Error('no quotes in test')),
        getExtendedQuote: jest
          .fn()
          .mockRejectedValue(new Error('no extended quotes in test')),
      })
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();
    return app;
  }

  it('GET /dashboard before any upload reports portfolioEverUploaded=false with no fabricated positions', async () => {
    const app = await buildApp();
    try {
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .expect(200);
      const body = response.body as DashboardBody;

      expect(body.portfolioEverUploaded).toBe(false);
      expect(body.positions).toEqual([]);
      expect(body.summary).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('POST /portfolio/import replaces the portfolio and GET /dashboard reflects it', async () => {
    const app = await buildApp();
    try {
      const csv = 'ticker,shares,avgCost,currentPrice\nAAPL,10,285,313.33';
      const importResponse = await request(app.getHttpServer())
        .post('/portfolio/import')
        .send({ csv, filename: 'test.csv' })
        .expect(201);
      const importBody = importResponse.body as PortfolioBody;

      expect(importBody.positions).toEqual([
        { ticker: 'AAPL', shares: 10, avgCost: 285, currentPrice: 313.33 },
      ]);

      const dashboardResponse = await request(app.getHttpServer())
        .get('/dashboard')
        .expect(200);
      const dashboardBody = dashboardResponse.body as DashboardBody;

      expect(dashboardBody.portfolioEverUploaded).toBe(true);
      expect(dashboardBody.positions).toHaveLength(1);
      expect(dashboardBody.positions[0].ticker).toBe('AAPL');
    } finally {
      await app.close();
    }
  });

  it('rejects a CSV import with zero valid rows and does not touch the stored portfolio', async () => {
    const app = await buildApp();
    try {
      await request(app.getHttpServer())
        .post('/portfolio/import')
        .send({ csv: 'not,a,valid,header\n1,2,3,4' })
        .expect(400);

      const portfolioResponse = await request(app.getHttpServer())
        .get('/portfolio')
        .expect(200);
      const body = portfolioResponse.body as PortfolioBody;
      expect(body.uploadedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('persists the portfolio across a simulated server restart (new app instance, same data dir)', async () => {
    const app1 = await buildApp();
    try {
      const csv = 'ticker,shares,avgCost,currentPrice\nMSFT,5,400,410.5';
      await request(app1.getHttpServer())
        .post('/portfolio/import')
        .send({ csv })
        .expect(201);
    } finally {
      await app1.close();
    }

    const app2 = await buildApp();
    try {
      const response = await request(app2.getHttpServer())
        .get('/portfolio')
        .expect(200);
      const body = response.body as PortfolioBody;

      expect(body.positions).toEqual([
        { ticker: 'MSFT', shares: 5, avgCost: 400, currentPrice: 410.5 },
      ]);
      expect(body.uploadedAt).not.toBeNull();
    } finally {
      await app2.close();
    }
  });
});
