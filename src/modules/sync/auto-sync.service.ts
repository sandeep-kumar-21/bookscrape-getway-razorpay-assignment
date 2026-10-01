import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { CatalogueNotReadyError } from '../../common/errors/app-error.js';

@Injectable()
export class AutoSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutoSyncService.name);

  constructor(
    @Inject(SyncService) private readonly syncService: SyncService,
    @Inject(CatalogueService)
    private readonly catalogueService: CatalogueService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.autoSyncOnBoot) {
      this.logger.log('AUTO_SYNC_ON_BOOT is disabled. Skipping boot crawl.');
      return;
    }

    try {
      await this.catalogueService.getCatalogue();
      this.logger.log(
        'Existing catalogue found in store. Skipping boot crawl.',
      );
    } catch (err) {
      if (err instanceof CatalogueNotReadyError) {
        this.logger.log(
          'No catalogue ready on boot. Initiating background sync crawl...',
        );
        // Start background build without awaiting; catch errors to prevent crashing boot
        this.syncService.build({ throwOnLockBusy: false }).catch((buildErr) => {
          this.logger.error(
            `Background boot sync failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`,
          );
        });
      }
    }
  }
}
