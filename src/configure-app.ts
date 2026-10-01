import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';

export function configureApp(app: INestApplication): void {
  // Security headers
  app.use(helmet());

  // Global versioned prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['docs'],
  });

  // Strict validation pipeline
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Unified global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Swagger API Documentation at /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BookScrape Gateway API')
    .setDescription(
      'Production-grade RESTful API for books.toscrape.com featuring atomic catalogue sync, Redis caching, robust error handling, and high-performance querying.',
    )
    .setVersion('1.0.0')
    .addTag('books', 'Book listing, full-text search, and lazy scraped detail')
    .addTag('categories', 'Catalogue categories and live book counts')
    .addTag('health', 'Health checks and Redis/sync status')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'BookScrape Gateway API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
