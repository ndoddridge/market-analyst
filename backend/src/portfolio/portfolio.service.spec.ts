import { BadRequestException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService input hardening', () => {
  const scannerService = { scan: jest.fn() };
  const newsService = { getRecentNews: jest.fn() };
  const eventsService = { getUpcomingEvents: jest.fn() };

  it('rejects non-array positions without throwing a TypeError', async () => {
    const service = new PortfolioService(
      scannerService as never,
      newsService as never,
      eventsService as never,
    );

    await expect(
      service.analyze({ positions: { ticker: 'AAPL' } as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scannerService.scan).not.toHaveBeenCalled();
  });
});
