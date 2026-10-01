import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './common/config/config.module.js';
import { AppConfigService } from './common/config/app-config.service.js';
import { StoreModule } from './common/store/store.module.js';
import { HttpModule } from './common/http/http.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { BooksModule } from './modules/books/books.module.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isTest
            ? 'silent'
            : config.isProduction
              ? 'info'
              : 'debug',
          transport:
            config.isProduction || config.isTest
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          customProps: (req: { id?: string }) => ({
            requestId: req.id,
          }),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: config.throttleTtl * 1000,
          limit: config.throttleLimit,
        },
      ],
    }),
    StoreModule,
    HttpModule,
    CatalogueModule,
    SyncModule,
    HealthModule,
    CategoriesModule,
    BooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Reflector,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
