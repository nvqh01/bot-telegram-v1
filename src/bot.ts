import moment from 'moment';
import { eq, ne, sql } from 'drizzle-orm';
import {
  NewGroup,
  NewResult,
  NewTask,
  NewUser,
  Task,
  groupSchema,
  resultSchema,
  taskSchema,
  twitterCookieSchema,
  userSchema,
} from './schemas';
import { PgClient } from './pg-client';
import { RedisClient } from './redis-client';
import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { getTwitterCookies } from './utils';

export type Assignment = {
  userId: string;
  groupId: string;
  previousPoint: number;
  twitterProfileLink: string;
  taskIds: string[];
};

const pgClient = PgClient.getInstance();
const redisClient = RedisClient.getInstance();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TTL_IN_MS = 2 * 24 * 60 * 60;

const ADD_TWITTER_PROFILE_LINK =
  /^\/add-twitter-profile-link \"http(s)?:\/\/twitter.com\/.+\"/gi;
const CREATE_TASKS_PATTERN =
  /^\/create-tasks( \"http(s)?:\/\/twitter\.com\/.+\"){1,}/gi;
const GET_POINTS_PATTERN = /\/get-points$/gi;
const GET_TASKS_PATTERN = /^\/get-tasks$/gi;
const GET_TWITTER_COOKIES_PATTERN = /^\/get-twitter-cookies .+:.+/gi;
const REFRESH_TWITTER_COOKIES_PATTERN = /^\/refresh-twitter-cookies$/gi;
const REGISTER_GROUP_PATTERN = /^\/register-group$/gi;
const REGISTER_USER_PATTERN = /^\/register$/gi;

const PREFIX_GROUP_KEY = 'telegram_group';
const PREFIX_RESULT_KEY = 'telegram_result';
const PREFIX_USER_KEY = 'telegram_user';

export class TelegramBot {
  static instance: TelegramBot;

  private bot: Telegraf;

  constructor() {
    this.init();
    this.start();
  }

  static getInstance(): TelegramBot {
    return TelegramBot.instance || (TelegramBot.instance = new TelegramBot());
  }

  private init(): void {
    this.bot = new Telegraf(BOT_TOKEN);

    this.bot.hears(ADD_TWITTER_PROFILE_LINK, async (ctx) => {
      const { id: groupId, type } = ctx.chat;
      const { id: userId } = ctx.from;
      const { text: command } = ctx.message;

      if (type !== 'group')
        return ctx.reply('You must join group to execute commands.');

      try {
        const isExistedUser = await this.isExistedInCache(userId, 'user');

        if (!isExistedUser)
          return ctx.reply(
            'You have not registerd yet. (Please enter /help to get more infomation)',
          );

        const twitterProfileLink = command
          .split(' ')
          .pop()
          ?.replaceAll('"', '')
          ?.trim();

        if (!twitterProfileLink)
          return ctx.reply(
            'Your command have an invalid syntax. (Please enter /help to get more infomation)',
          );

        await pgClient.update(userSchema).set({
          twitterProfileLink,
        });

        return ctx.reply('You added twitter profile link.');
      } catch (error: any) {
        console.log(
          'User %s can not add twitter profile link because of %s.',
          userId,
          error.stack,
        );

        return ctx.reply(
          'You can not add twitter profile link because server meets error.',
        );
      }
    });

    this.bot.hears(CREATE_TASKS_PATTERN, async (ctx) => {
      const { id: groupId, type } = ctx.chat;
      const { id: userId } = ctx.from;
      const { text: command } = ctx.message;

      if (type !== 'group')
        return ctx.reply('You must join group to execute commands.');

      try {
        const isExistedUser = await this.isExistedInCache(userId, 'user');

        if (!isExistedUser)
          return ctx.reply(
            'You have not registerd yet. (Please enter /help to get more infomation)',
          );

        const startDate = moment('6:00pm', 'h:mma');
        const endDate = moment('8:30am', 'h:mma').add(1, 'day');
        const isBetweenDate = moment().isBetween(startDate, endDate);

        if (!isBetweenDate)
          return ctx.reply(
            `You must use this command from "${startDate.format(
              'DD/MM/YYYY hh:mm a',
            )}" to "${endDate.format('DD/MM/YYYY hh:mm a')}".`,
          );

        const users = await pgClient
          .select()
          .from(userSchema)
          .where(eq(userSchema.id, `${userId}`));

        if (!users[0].twitterProfileLink) {
          return ctx.reply(
            'You have not added twitter profile link yet. (Please enter /help to get more infomation)',
          );
        }

        const links = command.trim().split(' ') as string[];
        links.shift();

        const newTasks: NewTask[] = [];

        for (let link of links) {
          if (!link) continue;

          link = link.replaceAll('"', '').trim();
          const taskId = link.split('/').pop();

          if (!taskId) continue;

          newTasks.push({
            id: taskId,
            userId: `${userId}`,
            link,
          });
        }

        await pgClient.insert(taskSchema).values(newTasks);

        return ctx.reply(`You created ${newTasks.length} task(s).`);
      } catch (error: any) {
        const errorMessage = error.stack as string;

        if (errorMessage.includes('duplicate'))
          return ctx.reply('Your task(s) have already been created.');

        console.log(
          'User %s can not create tasks because of %s.',
          userId,
          error.stack,
        );

        return ctx.reply(
          'You can not create tasks because server meets error.',
        );
      }
    });

    this.bot.hears(GET_POINTS_PATTERN, async (ctx) => {
      const { id: groupId, type } = ctx.chat;
      const { id: userId } = ctx.from;
      const { text: command } = ctx.message;

      try {
        const isExistedUser = await this.isExistedInCache(userId, 'user');

        if (!isExistedUser)
          return ctx.reply(
            'You have not registerd yet. (Please enter /help to get more infomation)',
          );

        const [result] = await pgClient
          .select({
            userFullName: userSchema.fullName,
            point: resultSchema.point,
          })
          .from(userSchema)
          .innerJoin(resultSchema, eq(resultSchema.userId, userSchema.id))
          .where(eq(userSchema.id, `${userId}`))
          .limit(1);

        return ctx.reply(
          `User ${result.userFullName} has ${result.point} point(s).`,
        );
      } catch (error: any) {
        console.log(
          'User %s can not get point because of %s.',
          userId,
          error.stack,
        );

        return ctx.reply('You can not get points because server meets error.');
      }
    });

    this.bot.hears(GET_TASKS_PATTERN, async (ctx) => {
      const { id: groupId, type } = ctx.chat;
      const { id: userId } = ctx.from;
      const { text: command } = ctx.message;

      if (type !== 'group')
        return ctx.reply('You must join group to execute commands.');

      try {
        const isExistedUser = await this.isExistedInCache(userId, 'user');

        if (!isExistedUser)
          return ctx.reply(
            'You have not registerd yet. (Please enter /help to get more infomation)',
          );

        const startDate = moment('9:00am', 'h:mma');
        const endDate = moment('5:00pm', 'h:mma');
        const isBetweenDate = moment().isBetween(startDate, endDate);

        if (!isBetweenDate)
          return ctx.reply(
            `You must use this command from "${startDate.format(
              'DD/MM/YYYY hh:mm a',
            )}" to "${endDate.format('DD/MM/YYYY hh:mm a')}".`,
          );

        const [result] = await pgClient
          .select({
            userId: resultSchema.userId,
            userFullName: userSchema.fullName,
            groupId: resultSchema.groupId,
            point: resultSchema.point,
            twitterProfileLink: userSchema.twitterProfileLink,
          })
          .from(userSchema)
          .innerJoin(resultSchema, eq(resultSchema.userId, userSchema.id))
          .where(eq(userSchema.id, `${userId}`))
          .limit(1);

        const tasks: Task[] = await pgClient
          .select()
          .from(taskSchema)
          .where(
            sql`${taskSchema.userId} <> ${userId} AND DATE(${taskSchema.createdAt}) = CURRENT_DATE`,
          );

        if (!tasks.length)
          return ctx.reply('There are not any task(s) for you today.');

        const assigement: Assignment = {
          userId: result.userId,
          groupId: result.groupId,
          previousPoint: result.point,
          twitterProfileLink: result.twitterProfileLink,
          taskIds: tasks.map((task) => task.id),
        };

        const parrentKey = `telegram_assignments`;
        const childKey = `telegram_assignment_${groupId}_${userId}_${moment().format(
          'DDMMYYYY',
        )}`;

        await redisClient.set(childKey, assigement, TTL_IN_MS);
        await redisClient.sadd(parrentKey, [childKey]);

        return ctx.reply(
          `Tasks of user "${result.userFullName}":\n${tasks
            .map((task, index) => `${index + 1}. ${task.link}`)
            .join('\n')}`,
        );
      } catch (error: any) {
        console.log(
          'User %s can not get tasks because of %s.',
          userId,
          error.stack,
        );

        return ctx.reply('You can not get tasks because server meets error.');
      }
    });

    this.bot.hears(GET_TWITTER_COOKIES_PATTERN, async (ctx) => {
      const { type } = ctx.chat;

      if (type !== 'private')
        return ctx.reply(
          'You must chat to bot privately. (Please enter /help to get more infomation)',
        );

      let { text } = ctx.message;
      text = text.split(' ')[1];

      const [username, password] = text.split(':');

      ctx.reply('Please wait in a few minutes...');

      try {
        const token = await getTwitterCookies(username, password);
        return ctx.reply(`Twitter cookies:\n${JSON.stringify(token, null, 2)}`);
      } catch (error: any) {
        console.log('Can not get twitter cookies because of %s', error.stack);

        return ctx.reply(
          'Can not get twitter cookies because server meets error.',
        );
      }
    });

    this.bot.hears(REFRESH_TWITTER_COOKIES_PATTERN, async (ctx) => {
      const { type } = ctx.chat;

      if (type !== 'private')
        return ctx.reply(
          'You must chat to bot privately. (Please enter /help to get more infomation)',
        );

      const twitterCookies = await pgClient.select().from(twitterCookieSchema);
      const key = `telegram_refresh_twitter_cookies`;

      if (await redisClient.get(key))
        return ctx.reply(
          'Refreshed twitter cookies. Please try again in 2 hours later.',
        );

      await redisClient.set(key, true, 2 * 60 * 60); // Cache in 2 hours

      ctx.reply('Please wait in a few minutes...');

      for (const twitterCookie of twitterCookies) {
        const cookies = await getTwitterCookies(
          twitterCookie.username,
          twitterCookie.password,
        ).catch((error: any) => {
          console.log(
            'Fail to get twitter cookies of username %s because of %s',
            twitterCookie.username,
            error.stack,
          );

          return null;
        });

        if (!cookies) {
          ctx.reply(
            `Fail to refresh twitter cookies of username ${twitterCookie.username}.`,
          );
          continue;
        }

        await pgClient.update(twitterCookieSchema).set({ cookies });
      }

      return ctx.reply('Finshed to refresh twitter cookies.');
    });

    this.bot.hears(REGISTER_GROUP_PATTERN, async (ctx) => {
      const { id: groupId, title, type } = ctx.chat as any;
      const { id: userId } = ctx.from;
      const { text: command } = ctx.message;

      if (type !== 'group')
        return ctx.reply('You must join group to execute commands.');

      try {
        const isExistedGroup = await this.isExistedInCache(groupId, 'group');

        if (isExistedGroup)
          return ctx.reply('Group has been already registerd.');

        const newGroup: NewGroup = {
          id: groupId,
          groupName: title,
        };

        await pgClient.insert(groupSchema).values(newGroup);

        return ctx.reply('Group is registered successfully.');
      } catch (error: any) {
        console.log(
          'Group %s can not register because of %s.',
          groupId,
          error.stack,
        );

        return ctx.reply('Group can not register because server meets error.');
      }
    });

    this.bot.hears(REGISTER_USER_PATTERN, async (ctx) => {
      const { id: groupId, type } = ctx.chat;
      const { id: userId, first_name, last_name } = ctx.from;
      const { text: command } = ctx.message;

      if (type !== 'group')
        return ctx.reply('You must join group to execute commands.');

      try {
        const isExistedGroup = await this.isExistedInCache(groupId, 'group');

        if (!isExistedGroup)
          return ctx.reply('Group has been not registerd yet.');

        const isExistedUser = await this.isExistedInCache(userId, 'user');

        if (!isExistedUser) {
          const newUser: NewUser = {
            id: `${userId}`,
            fullName: `${first_name} ${last_name}`,
          };

          await pgClient.insert(userSchema).values(newUser);

          return ctx.reply('You have been already registerd.');
        }

        const isExistedResult = await this.isExistedInCache(userId, 'result');

        if (!isExistedResult) {
          const newResult: NewResult = {
            userId: `${userId}`,
            groupId: `${groupId}`,
          };

          await pgClient.insert(resultSchema).values(newResult);
        }

        return isExistedUser && isExistedResult
          ? ctx.reply('You have already registerd.')
          : ctx.reply('You registered successfully.');
      } catch (error: any) {
        console.log(
          'User %s can not register because of %s.',
          userId,
          error.stack,
        );

        return ctx.reply('You can not register because server meets error.');
      }
    });

    this.bot.help((ctx) => {
      ctx.reply(
        'Sytax:\n' +
          '1. Register user: /register\n' +
          '2. Add twitter profile link: /add-twitter-profile-link "https://twitter.com/elonmusk"\n' +
          '3. Create tasks: /create-tasks "https://twitter.com/elonmusk/status/1730331223992472029" "https://twitter.com/Bybit_Official/status/1729498119937622275"\n' +
          '4. Get tasks (from 09:00 am to 05:00 pm): /get-tasks\n' +
          '5. Get points: /get-points\n' +
          '6. Register group (Admin): /register-group' +
          '7. Refresh twitter cookies (Admin): /refresh-twitter-cookies',
      );
    });
  }

  private async isExistedInCache(
    id: string | number,
    type: 'group' | 'result' | 'user',
  ): Promise<boolean> {
    let key: string;
    switch (type) {
      case 'group':
        key = `${PREFIX_GROUP_KEY}_${id}`;
        break;
      case 'result':
        key = `${PREFIX_RESULT_KEY}_${id}`;
        break;
      case 'user':
        key = `${PREFIX_USER_KEY}_${id}`;
        break;
    }

    if (await redisClient.get(key)) return true;

    let isExisted: boolean;

    switch (type) {
      case 'group':
        {
          const records = await pgClient
            .select()
            .from(groupSchema)
            .where(eq(groupSchema.id, `${id}`))
            .limit(1);

          isExisted = !!records.length;
        }
        break;
      case 'result':
        {
          const records = await pgClient
            .select()
            .from(resultSchema)
            .where(eq(resultSchema.userId, `${id}`))
            .limit(1);

          isExisted = !!records.length;
        }
        break;
      case 'user':
        {
          const records = await pgClient
            .select()
            .from(userSchema)
            .where(eq(userSchema.id, `${id}`))
            .limit(1);

          isExisted = !!records.length;
        }
        break;
    }

    isExisted && (await redisClient.set(key, true, TTL_IN_MS));

    return isExisted;
  }

  public release(reason: string = 'Unknown'): void {
    this.bot.stop(reason);
  }

  public async sendMessage(chatId: string, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, text);
  }

  public async start(): Promise<void> {
    await this.bot.launch();
  }
}
