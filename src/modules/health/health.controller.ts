import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import { SyncStatusService } from '../sync/sync-status.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { HealthResponseDto } from './dto/health-response.dto.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    private readonly syncStatusService: SyncStatusService,
    private readonly catalogueService: CatalogueService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Health check and service status',
    description:
      'Always returns HTTP 200 while the process is alive. Reports Redis connection status, crawler sync status, and catalogue availability.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service health information',
    type: HealthResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    const startTime = Date.now();
    let redisConnected = false;
    let redisLatencyMs: number | null = null;

    try {
      redisConnected = await this.store.ping();
      redisLatencyMs = redisConnected ? Date.now() - startTime : null;
    } catch {
      redisConnected = false;
      redisLatencyMs = null;
    }

    const syncStatus = await this.syncStatusService.getStatus();
    const cachedCatalogue = this.catalogueService.getCachedCatalogue();

    let catalogueStatus: 'ready' | 'building' | 'missing' | 'failed' =
      'missing';
    let total: number | null = null;
    let builtAt: string | null = null;

    if (cachedCatalogue) {
      catalogueStatus = 'ready';
      total = cachedCatalogue.books.length;
      builtAt = cachedCatalogue.builtAt;
    } else if (syncStatus?.state === 'building') {
      catalogueStatus = 'building';
    } else if (syncStatus?.state === 'failed') {
      catalogueStatus = 'failed';
    } else {
      // Check if catalogue exists in store
      try {
        const storedCatalogue = await this.catalogueService.getCatalogue();
        catalogueStatus = 'ready';
        total = storedCatalogue.catalogue.books.length;
        builtAt = storedCatalogue.catalogue.builtAt;
      } catch {
        catalogueStatus = 'missing';
      }
    }

    return {
      status: redisConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      catalogue: {
        status: catalogueStatus,
        total,
        builtAt,
      },
      sync: {
        state: syncStatus?.state ?? 'idle',
        lastSync: syncStatus?.finishedAt ?? null,
        bookCount: syncStatus?.sourceTotal ?? total,
      },
      redis: {
        connected: redisConnected,
        latencyMs: redisLatencyMs,
      },
    };
  }
}
