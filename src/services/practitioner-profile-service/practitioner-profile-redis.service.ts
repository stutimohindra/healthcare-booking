import 'dotenv/config';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

type RedisClient = ReturnType<typeof createClient>;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class PractitionerProfileRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(PractitionerProfileRedisService.name);
  private readonly client: RedisClient;
  private connectPromise?: Promise<void>;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
      socket: {
        reconnectStrategy: false,
      },
    });

    this.client.on('error', (error: unknown) => {
      this.logger.warn(`Redis error: ${formatError(error)}`);
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      await this.ensureConnected();

      const value = await this.client.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(
        `Failed to read Redis key "${key}": ${formatError(error)}`,
      );

      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.ensureConnected();

      await this.client.set(key, JSON.stringify(value), {
        EX: ttlSeconds,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write Redis key "${key}": ${formatError(error)}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(
        `Failed to delete Redis key "${key}": ${formatError(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }

    this.connectPromise ??= this.client.connect().then(() => undefined);

    try {
      await this.connectPromise;
    } catch (error) {
      this.connectPromise = undefined;
      throw error;
    }
  }
}
