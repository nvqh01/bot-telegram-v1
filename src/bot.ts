import { RedisClient } from './redis-client';
import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { PgClient } from './pg-client';

const pgClient = PgClient.getInstance();
const redisClient = RedisClient.getInstance();

const BOT_TOKEN = process.env.TOKEN || '';

const CREATE_TASKS_PATTERN =
  /^\/create-tasks( \"http(s)?:\/\/twitter\.com\/.+\"){1,}/gi;
const CREATE_TWITTER_PROFILE =
  /^\/add-twitter-profile-link \"http(s)?:\/\/twitter.com\/.+\"/gi;
const REGISTER_PATTERN = /^\/register$/gi;

export class TelegramBot {
  private bot: Telegraf;

  constructor() {
    this.init();
  }

  private init(): void {
    this.bot = new Telegraf(BOT_TOKEN);

    this.bot.on();

    this.bot.on();

    this.bot.on();
  }

  public sendMessage(): void {
    this.bot.sendMessage();
  }
}
