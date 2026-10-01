import { Module } from '@nestjs/common';
import { HTTP_TRANSPORT } from './http-transport.interface.js';
import { FetchTransport } from './fetch-transport.js';
import { ScraperClient } from './scraper-client.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: HTTP_TRANSPORT,
      useClass: FetchTransport,
    },
    ScraperClient,
  ],
  exports: [HTTP_TRANSPORT, ScraperClient],
})
export class HttpModule {}
