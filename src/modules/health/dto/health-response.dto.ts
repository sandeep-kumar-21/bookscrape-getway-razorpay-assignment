import { ApiProperty } from '@nestjs/swagger';

export class CatalogueSummaryDto {
  @ApiProperty({
    example: 'ready',
    enum: ['ready', 'building', 'missing', 'failed'],
    description: 'Current catalogue availability state',
  })
  status!: 'ready' | 'building' | 'missing' | 'failed';

  @ApiProperty({
    example: 1000,
    nullable: true,
    description: 'Total number of books in the catalogue',
  })
  total!: number | null;

  @ApiProperty({
    example: '2026-10-02T02:00:00.000Z',
    nullable: true,
    description: 'Timestamp when the catalogue was published',
  })
  builtAt!: string | null;
}

export class SyncStatusDto {
  @ApiProperty({
    example: 'ready',
    enum: ['idle', 'building', 'ready', 'failed'],
    description: 'Current crawler sync state',
  })
  state!: 'idle' | 'building' | 'ready' | 'failed';

  @ApiProperty({
    example: '2026-10-02T02:00:00.000Z',
    nullable: true,
    description: 'Timestamp when the last sync finished',
  })
  lastSync!: string | null;

  @ApiProperty({
    example: 1000,
    nullable: true,
    description: 'Number of books crawled in the last sync',
  })
  bookCount!: number | null;
}

export class RedisHealthDto {
  @ApiProperty({
    example: true,
    description: 'Whether Redis is connected and responsive',
  })
  connected!: boolean;

  @ApiProperty({
    example: 2,
    nullable: true,
    description: 'Redis ping latency in milliseconds',
  })
  latencyMs!: number | null;
}

export class HealthResponseDto {
  @ApiProperty({
    example: 'healthy',
    enum: ['healthy', 'degraded'],
    description: 'Overall service health',
  })
  status!: 'healthy' | 'degraded';

  @ApiProperty({
    example: '2026-10-02T02:00:00.000Z',
    description: 'Current server UTC ISO timestamp',
  })
  timestamp!: string;

  @ApiProperty({ example: '1.0.0', description: 'API application version' })
  version!: string;

  @ApiProperty({ type: CatalogueSummaryDto })
  catalogue!: CatalogueSummaryDto;

  @ApiProperty({ type: SyncStatusDto })
  sync!: SyncStatusDto;

  @ApiProperty({ type: RedisHealthDto })
  redis!: RedisHealthDto;
}
