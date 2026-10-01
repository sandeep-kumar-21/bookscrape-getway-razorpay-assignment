import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { AppConfigService } from './common/config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const config = app.get(AppConfigService);
  await app.listen(config.port);

  logger.log(
    `Application is running on: http://localhost:${config.port}/api/v1`,
  );
  logger.log(
    `Swagger documentation available at: http://localhost:${config.port}/docs`,
  );
}

await bootstrap();
