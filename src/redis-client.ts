import { catchAsync } from './utils';
import { Redis } from 'ioredis';
import 'dotenv/config';

const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6369';

export class RedisClient {
  static instance: RedisClient;

  private client: Redis;
  private context: string;

  constructor() {
    this.client = new Redis(REDIS_URI, {
      connectTimeout: 30_000,
    });

    this.client.on('connect', () => {
      console.log('Created connection to Redis.');
    });

    this.client.on('error', (error) => {
      console.log('Redis meets error: %s', error.stack);
    });

    this.client.on('close', () => {
      console.log('Closed connection to Redis.');
    });

    this.context = RedisClient.name;
  }

  static getInstance(): RedisClient {
    return RedisClient.instance || (RedisClient.instance = new RedisClient());
  }

  async del(keys: string[]): Promise<boolean | null> {
    return await catchAsync(this.context, async () => {
      await this.client.del(...keys);
      return true;
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    return await catchAsync(this.context, async () => {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    });
  }

  async release(): Promise<void> {
    this.client && (await this.client.quit());
  }

  async set<T = any>(
    key: string,
    value: T,
    ttlInMs?: number,
  ): Promise<boolean | null> {
    return await catchAsync(this.context, async () => {
      if (ttlInMs)
        await this.client.set(key, JSON.stringify(value), 'EX', ttlInMs);
      else await this.client.set(key, JSON.stringify(value));
      return true;
    });
  }

  async sadd(key: string, values: string[]): Promise<boolean | null> {
    return await catchAsync(this.context, async () => {
      await this.client.sadd(key, values);
      return true;
    });
  }

  async smembers(key: string): Promise<string[] | null> {
    return await catchAsync(this.context, async () => {
      return await this.client.smembers(key);
    });
  }

  async srem(key: string, values: string[]): Promise<boolean | null> {
    return await catchAsync(this.context, async () => {
      await this.client.srem(key, values);
      return true;
    });
  }
}
