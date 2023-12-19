import moment from 'moment';
import { eq, sql } from 'drizzle-orm';
import { getTwitterCookies } from './utils';
import { PgClient } from './pg-client';
import { RedisClient } from './redis-client';
import { Telegraf } from 'telegraf';
import 'dotenv/config';
import {
  NewGroup,
  NewResult,
  NewTask,
  NewTwitterCookie,
  NewUser,
  Task,
  groupSchema,
  resultSchema,
  taskSchema,
  twitterCookieSchema,
  userSchema,
} from './schemas';

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

const ADD_TWITTER_ACCOUNTS = /\/add-twitter-accounts( \".+:.+\"){1,}/gi;
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

    this.bot.hears(ADD_TWITTER_ACCOUNTS, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const { text: command } = ctx.message;
      const fullName = `${first_name} ${last_name}`;
      const twitterAccounts: NewTwitterCookie[] = [];

      try {
        if (!(await this.canExecuteCommand(ctx, ['private']))) return;

        if (!(await this.isAdmin(userId)))
          return ctx.reply(
            `User ${fullName} not admin. So you can not use command "/get-twitter-cookies".`,
          );

        command.split(' ').forEach((twitterAccount, index) => {
          if (index === 0) return;
          twitterAccount = twitterAccount.replaceAll('"', '');
          const [username, password] = twitterAccount.split(':');
          twitterAccounts.push({ username, password });
        });

        let numOfNewAccounts = 0;

        await Promise.all(
          twitterAccounts.map(async (twitterAccount) => {
            await pgClient
              .insert(twitterCookieSchema)
              .values([twitterAccount])
              .then(() => {
                numOfNewAccounts++;
              })
              .catch(async (error: any) => {
                const errorMessage = error.stack as string;
                if (errorMessage.includes('duplicate')) {
                  await ctx.reply(
                    `Twitter username "${twitterAccount.username}" has already existed.`,
                  );
                  return;
                }
                throw error;
              });
          }),
        );

        return ctx.reply(`Added ${numOfNewAccounts} twitter accounts.`);
      } catch (error: any) {
        console.log('Fail to add twitter accounts because of %s.', error.stack);

        return ctx.reply(
          'Fail to add twitter accounts because server meets error.',
        );
      }
    });

    this.bot.hears(ADD_TWITTER_PROFILE_LINK, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const { text: command } = ctx.message;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['group', 'supergroup'])))
          return;

        if (!(await this.isExistedUser(userId)))
          ctx.reply(
            `User ${fullName} have not registerd yet. User must register by using command "/register".`,
          );

        const twitterProfileLink = command
          .split(' ')
          .pop()
          ?.replaceAll('"', '')
          ?.trim();

        if (!twitterProfileLink)
          return ctx.reply(
            `Command of user ${fullName} has an invalid syntax. (Please enter /help to get more infomation)`,
          );

        await pgClient.update(userSchema).set({
          twitterProfileLink,
        });

        return ctx.reply(`User ${fullName} added twitter profile link.`);
      } catch (error: any) {
        console.log(
          'User %s (id: %s) can not add twitter profile link because of %s.',
          fullName,
          userId,
          error.stack,
        );

        return ctx.reply(
          `User ${fullName} can not add twitter profile link because server meets error.`,
        );
      }
    });

    this.bot.hears(CREATE_TASKS_PATTERN, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const { text: command } = ctx.message;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['group', 'supergroup'])))
          return;

        if (!(await this.isExistedUser(userId)))
          ctx.reply(
            `User ${fullName} have not registerd yet. User must register by using command "/register".`,
          );

        const startDate = moment('6:00pm', 'h:mma');
        const endDate = moment('8:30am', 'h:mma').add(1, 'day');

        const isBetweenDate = this.isBetweenDate(
          startDate,
          endDate,
          fullName,
          '/create-tasks',
          ctx,
        );

        if (!isBetweenDate) return;

        const users = await pgClient
          .select()
          .from(userSchema)
          .where(eq(userSchema.id, `${userId}`));

        if (!users[0].twitterProfileLink)
          return ctx.reply(
            `User ${fullName} has not added twitter profile link yet. User must use command "/add-twitter-profile-link".`,
          );

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

        return ctx.reply(
          `User ${fullName} created ${newTasks.length} task(s).`,
        );
      } catch (error: any) {
        const errorMessage = error.stack as string;

        if (errorMessage.includes('duplicate'))
          return ctx.reply(
            `Task(s) of user ${fullName} have already been created.`,
          );

        console.log(
          'User %s (id: %s) can not create tasks because of %s.',
          fullName,
          userId,
          error.stack,
        );

        return ctx.reply(
          `User ${fullName} can not create tasks because server meets error.`,
        );
      }
    });

    this.bot.hears(GET_POINTS_PATTERN, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.isExistedUser(userId)))
          ctx.reply(
            `User ${fullName} have not registerd yet. User must register by using command "/register".`,
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

        return ctx.reply(`User ${fullName} has ${result.point} point(s).`);
      } catch (error: any) {
        console.log(
          'User %s (id: %s) can not get point because of %s.',
          fullName,
          userId,
          error.stack,
        );

        return ctx.reply(
          `User ${fullName} can not get points because server meets error.`,
        );
      }
    });

    this.bot.hears(GET_TASKS_PATTERN, async (ctx) => {
      const { id: groupId, title: groupName } = ctx.chat as any;
      const { id: userId, first_name, last_name } = ctx.from;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['group', 'supergroup'])))
          return;

        if (!(await this.isExistedUser(userId)))
          ctx.reply(
            `User ${fullName} have not registerd yet. User must register by using command "/register".`,
          );

        const startDate = moment('9:00am', 'h:mma');
        const endDate = moment('5:00pm', 'h:mma');

        const isBetweenDate = this.isBetweenDate(
          startDate,
          endDate,
          fullName,
          '/get-tasks',
          ctx,
        );

        if (!isBetweenDate) return;

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
          return ctx.reply(
            `There are not any task(s) for user ${fullName} today.`,
          );

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
          'User %s (id: %s) can not get tasks because of %s.',
          fullName,
          userId,
          error.stack,
        );

        return ctx.reply(
          `User ${fullName} can not get tasks because server meets error.`,
        );
      }
    });

    this.bot.hears(GET_TWITTER_COOKIES_PATTERN, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['private']))) return;

        if (!(await this.isAdmin(userId)))
          return ctx.reply(
            `User ${fullName} not admin. So you can not use command "/get-twitter-cookies".`,
          );

        let { text } = ctx.message;
        text = text.split(' ')[1];

        const [username, password] = text.split(':');

        ctx.reply('Please wait in a few minutes...');

        const token = await getTwitterCookies(username, password);

        return ctx.reply(`Twitter cookies:\n${JSON.stringify(token, null, 2)}`);
      } catch (error: any) {
        console.log('Fail to get twitter cookies because of %s', error.stack);

        return ctx.reply(
          'Fail to get twitter cookies because server meets error.',
        );
      }
    });

    this.bot.hears(REFRESH_TWITTER_COOKIES_PATTERN, async (ctx) => {
      const { id: userId, first_name, last_name } = ctx.from;
      const fullName = `${first_name} ${last_name}`;
      const key = `telegram_refresh_twitter_cookies`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['private']))) return;

        if (!(await this.isAdmin(userId)))
          return ctx.reply(
            `User ${fullName} not admin. So you can not use command "/refresh-twitter-cookies".`,
          );

        const twitterCookies = await pgClient
          .select()
          .from(twitterCookieSchema);

        if (!twitterCookies.length)
          return ctx.reply(
            'There are not any twitter accounts. Please add twitter accounts before refreshing twitter cookies.',
          );

        let numOfRefreshedCookies = 0;

        if (await redisClient.get(key))
          return ctx.reply(
            'Refreshed twitter cookies. Please try again in 2 hours later.',
          );

        await redisClient.set(key, true, 2 * 60 * 60); // Cache in 2 hours

        ctx.reply('Please wait in a few minutes...');

        for (const twitterCookie of twitterCookies) {
          const cookies = await getTwitterCookies(
            twitterCookie.username as string,
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
            await ctx.reply(
              `Fail to refresh twitter cookies of username ${twitterCookie.username}.`,
            );
            continue;
          }

          await pgClient.update(twitterCookieSchema).set({ cookies });
          numOfRefreshedCookies++;
        }

        if (numOfRefreshedCookies <= 0) {
          await redisClient.del([key]);
          return ctx.reply('Please try refreshing twitter cookies again.');
        }

        return ctx.reply(
          `Finshed to refresh ${numOfRefreshedCookies} twitter cookies.`,
        );
      } catch (error: any) {
        await redisClient.del([key]);

        console.log(
          'Fail to refresh twitter cookies because of: %s',
          error.stack,
        );

        return ctx.reply(
          'Fail to refresh twitter cookies because of server meets error.',
        );
      }
    });

    this.bot.hears(REGISTER_GROUP_PATTERN, async (ctx) => {
      const { id: groupId, title: groupName } = ctx.chat as any;
      const { id: userId, first_name, last_name } = ctx.from;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['group', 'supergroup'])))
          return;

        if (!(await this.isAdmin(userId)))
          return ctx.reply(
            `User ${fullName} is not admin. So you can not use command "/register-group".`,
          );

        if (await this.isExistedGroup(groupId))
          return ctx.reply(`Group ${groupName} have already registerd. `);

        const newGroup: NewGroup = {
          id: groupId,
          groupName,
        };

        await pgClient.insert(groupSchema).values(newGroup);

        return ctx.reply(`Group ${groupName} registered successfully.`);
      } catch (error: any) {
        console.log(
          'Group %s (id: %s) can not register because of %s.',
          groupName,
          groupId,
          error.stack,
        );

        return ctx.reply(
          `Group ${groupName} can not register because server meets error.`,
        );
      }
    });

    this.bot.hears(REGISTER_USER_PATTERN, async (ctx) => {
      const { id: groupId, title: groupName } = ctx.chat as any;
      const { id: userId, first_name, last_name, username } = ctx.from;
      const fullName = `${first_name} ${last_name}`;

      try {
        if (!(await this.canExecuteCommand(ctx, ['group', 'supergroup'])))
          return;

        if (!(await this.isExistedGroup(groupId)))
          return ctx.reply(
            `Group ${groupName} have not registerd yet. Admin must register by using command "/register-group".`,
          );

        const [isExistedUser, isExistedResult] = await Promise.all([
          this.isExistedUser(userId),
          this.isExistedResult(userId),
        ]);

        if (!isExistedUser) {
          const newUser: NewUser = {
            id: `${userId}`,
            username: username || '',
            fullName: `${first_name} ${last_name}`,
          };

          await pgClient.insert(userSchema).values(newUser);
        }

        if (!isExistedResult) {
          const newResult: NewResult = {
            userId: `${userId}`,
            groupId: `${groupId}`,
          };

          await pgClient.insert(resultSchema).values(newResult);
        }

        return isExistedUser && isExistedResult
          ? ctx.reply(`User ${fullName} has already registerd.`)
          : ctx.reply(`User ${fullName} registered successfully.`);
      } catch (error: any) {
        console.log(
          'User %s (id: %s) can not register because of %s.',
          fullName,
          userId,
          error.stack,
        );

        return ctx.reply(
          `User ${fullName} can not register because server meets error.`,
        );
      }
    });

    this.bot.hears('/provide-info', (ctx) => {
      console.log(ctx.from);
      return ctx.reply('Received your info');
    });

    this.bot.help(async (ctx) => {
      const { type } = ctx.chat;
      const { id: userId } = ctx.from;

      const isAdmin = await this.isAdmin(userId).catch((error) => {
        console.log(error);
        return false;
      });

      const commandsInGroup =
        'Commands are used in group:\n' +
        '1. Resgister user: /register\n' +
        '2. Add twitter profile link: /add-twitter-profile-link "https://twitter.com/elonmusk"\n ' +
        '3. Create tasks: /create-tasks "https://twitter.com/elonmusk/status/1730331223992472029" "https://twitter.com/Bybit_Official/status/1729498119937622275"\n' +
        '4. Get points: /get-points\n' +
        '5. Get tasks (from 09:00 am to 05:00 pm): /get-tasks\n' +
        '6. Register group (Just Admin): /register-group';

      ctx.reply(commandsInGroup);

      if (isAdmin && type === 'private') {
        const commandsInBot =
          'Commands are used in bot:\n' +
          '1. Refresh twitter cookies: /refresh-twitter-cookies\n' +
          '2. Add twitter accounts: /add-twitter-accounts "username1:password1" "username2:password2"';

        ctx.reply(commandsInBot);
      }
    });
  }

  public async canExecuteCommand(
    ctx: any,
    types: ('group' | 'private' | 'supergroup')[],
  ): Promise<boolean> {
    const { type } = ctx.chat;

    if (types.filter((_type) => _type === type)) return true;

    switch (type) {
      case 'group':
        ctx.reply('You can not execute this command in private group.');
        break;
      case 'private':
        ctx.reply('You can not execute this command in bot.');
        break;
      case 'supergroup':
        ctx.reply('You can not execute this command in public group.');
        break;
      default:
        ctx.reply(`Can not define type "${type}"`);
    }

    return false;
  }

  public async getBotName(): Promise<string> {
    return (await this.bot.telegram.getMyName()).name;
  }

  private async isAdmin(userId: number | string): Promise<boolean> {
    const [user] = await pgClient
      .select({
        isAdmin: userSchema.isAdmin,
      })
      .from(userSchema)
      .where(eq(userSchema.id, `${userId}`))
      .limit(1);

    return user.isAdmin;
  }

  private isBetweenDate(
    startDate: moment.Moment,
    endDate: moment.Moment,
    fullName: string,
    command: string,
    ctx: any,
  ): boolean {
    const isBetweenDate = moment().isBetween(startDate, endDate);

    if (isBetweenDate) return true;

    ctx.reply(
      `User ${fullName} must use ${command} from "${startDate.format(
        'DD/MM/YYYY hh:mm a',
      )}" to "${endDate.format('DD/MM/YYYY hh:mm a')}".`,
    );

    return false;
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

  private async isExistedGroup(groupId: number | string): Promise<boolean> {
    const isExistedGroup = await this.isExistedInCache(groupId, 'group');
    return isExistedGroup;
  }

  private async isExistedUser(userId: number | string): Promise<boolean> {
    const isExistedUser = await this.isExistedInCache(userId, 'user');
    return isExistedUser;
  }

  private async isExistedResult(userId: number | string): Promise<boolean> {
    const isExistedResult = await this.isExistedInCache(userId, 'result');
    return isExistedResult;
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
