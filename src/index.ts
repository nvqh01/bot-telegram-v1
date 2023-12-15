import 'dotenv/config';
import moment from 'moment';
import { Assignment, TelegramBot } from './bot';
import { crawlHtml, getRoundRobin } from './utils';
import { sql } from 'drizzle-orm';
import { PgClient } from './pg-client';
import { RedisClient } from './redis-client';
import { schedule, ScheduledTask } from 'node-cron';
import { resultSchema, twitterCookieSchema, userSchema } from './schemas';

// const users: User[] = [
//   {
//     id: '1921006708',
//     fullName: 'Huy Nguyễn',
//     point: 0,
//     createdAt: new Date(),
//     twitterProfileLink: 'https://twitter.com/asmodeus2k1',
//   },
// ];

// const tasks: Task[] = [
//   {
//     id: '1728936946049974650',
//     link: 'https://twitter.com/elonmusk/status/1728936946049974650',
//     createdAt: new Date(),
//     userId: '1921006696',
//   },
//   {
//     id: '1729039158692528210',
//     link: 'https://twitter.com/elonmusk/status/1729039158692528210',
//     createdAt: new Date(),
//     userId: '1921006696',
//   },
// ];

const COOKIES: any[] = [
  {
    name: 'auth_token',
    value: '94e387268305db239d2ac5d333f62207de955a9b',
    domain: '.twitter.com',
    path: '/',
    expires: 1736772697.959146,
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    sameParty: false,
    sourceScheme: 'Secure',
    sourcePort: 443,
  },
];

const errorReceiverTelegramId = process.env.ERROR_RECEIVER_TELEGRAM_ID || '';

const cronJobs: ScheduledTask[] = [];

const pgClient = PgClient.getInstance();
const redisClient: RedisClient = RedisClient.getInstance();
const telegramBot: TelegramBot = TelegramBot.getInstance();

cronJobs.push(
  schedule('00 30 18 * * *', async () => {
    const key = `telegram_assignments`;
    const assigmentKeys = await redisClient.smembers(key);
    const nowDate = moment().format('DD-MM-YYYY');

    if (!assigmentKeys) {
      console.log("Can't get assgiments from cache. (key: %s)", key);
      return;
    }

    const _cookies = await pgClient
      .select({ cookies: twitterCookieSchema.cookies })
      .from(twitterCookieSchema);

    for (const assignmentKey of assigmentKeys) {
      const assignment = (await redisClient.get(assignmentKey)) as Assignment;

      const shareLink = assignment.twitterProfileLink;
      const commentLink = assignment.twitterProfileLink + '/with_replies';
      const likeLink = assignment.twitterProfileLink + '/likes';

      let cookies: any = getRoundRobin(_cookies).cookies;
      cookies = cookies ? JSON.parse(cookies) : COOKIES;
      !Array.isArray(cookies) && (cookies = [cookies]);

      const lishHtml = await crawlHtml(
        [shareLink, commentLink, likeLink],
        cookies,
      ).catch((error: any) => {
        const errorMessage = `Fail to check assignments of user "${assignment.userId}" at group "${assignment.groupId}" because of ${error.stack}`;

        console.log(errorMessage);

        errorReceiverTelegramId &&
          telegramBot.sendMessage(errorReceiverTelegramId, errorMessage);

        return [];
      });

      if (!lishHtml.length) continue;

      let totalPoints = 0;

      assignment.taskIds.forEach(async (taskId) => {
        console.log(
          'Group id: %s, User id: %s; Task id: %s',
          assignment.groupId,
          assignment.userId,
          taskId,
        );

        let pointInContext = 0;

        lishHtml[0].includes(taskId) && pointInContext++;
        lishHtml[1].includes(taskId) && pointInContext++;
        lishHtml[2].includes(taskId) && pointInContext++;

        pointInContext >= 3 && totalPoints++;
      });

      await pgClient
        .update(resultSchema)
        .set({
          point: assignment.previousPoint + totalPoints,
        })
        .where(
          sql`${resultSchema.userId} = ${assignment.userId} AND ${resultSchema.groupId} = ${assignment.groupId}`,
        );

      await redisClient.srem(key, [assignmentKey]);

      console.log(
        'Total points of user %s at group %s are %s point(s)',
        assignment.userId,
        assignment.groupId,
        totalPoints,
      );
    }
  }),
);

process.on('SIGINT', () => {
  console.log('Bot meets error from SIGINT.');
  release('SIGTERM');
});

process.on('SIGTERM', () => {
  release('SIGTERM');
  console.log('Restart bot.');
  telegramBot.start();
});

function release(reason: string, stop: boolean = false): void {
  if (stop) {
    cronJobs.forEach((job) => job.stop());
    redisClient.release();
  }

  telegramBot.release(reason);
}

async function insertUser(): Promise<void> {
  await pgClient
    .insert(userSchema)
    .values([
      {
        id: process.env.ADMIN_ID_1 as string,
        fullName: 'MMOLoginS Long Ân',
        isAdmin: true,
        isGroupAdmin: true,
      },
      {
        id: process.env.ADMIN_ID_2 as string,
        fullName: 'Huy Nguyễn',
        isAdmin: true,
        isGroupAdmin: true,
      },
    ])
    .catch((error: any) => {
      const errorMessage = error.stack as string;

      if (errorMessage.includes('duplicate')) return;

      console.log('Fail to insert default users because of %s', errorMessage);
    });
}

insertUser();
