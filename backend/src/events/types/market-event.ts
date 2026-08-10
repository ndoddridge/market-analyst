export enum MarketEventType {
  EARNINGS = 'EARNINGS',
  DIVIDEND = 'DIVIDEND',
  OTHER = 'OTHER',
}

export type MarketEvent = {
  id: string;
  title: string;
  type: MarketEventType;
  ticker: string;
  eventDate: string;
  provider: string;
};
