import { Module } from '@nestjs/common';
import { KEY_VALUE_STORE } from './key-value-store.interface.js';
import { RedisStore } from './redis.store.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KEY_VALUE_STORE,
      useClass: RedisStore,
    },
    RedisStore,
  ],
  exports: [KEY_VALUE_STORE, RedisStore],
})
export class StoreModule {}
