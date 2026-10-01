import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SyncService } from './modules/sync/sync.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const syncService = app.get(SyncService);
    console.log('Initiating manual catalogue synchronization...');
    await syncService.build({ throwOnLockBusy: true });
    console.log('Catalogue synchronization finished successfully.');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('Catalogue synchronization failed:', err);
    await app.close();
    process.exit(1);
  }
}

bootstrap();
