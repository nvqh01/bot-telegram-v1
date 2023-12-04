import moment from 'moment';
import { ScheduledTask, schedule } from 'node-cron';
import { RedisClient } from './redis-client';
import { launchPuppeteer, puppeteerUtils, sleep } from 'crawlee';
import { HTTPResponse, Page, Protocol } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { newInjectedPage } from 'fingerprint-injector';
import { writeFileSync } from 'fs';

type User = {
  id: string;
  fullName: string;
  point: number;
  createdAt: Date;
  twitterProfileLink: string;
};

type Task = {
  id: string;
  link: string;
  createdAt: Date;
  userId: string;
};

const users: User[] = [
  {
    id: '1921006708',
    fullName: 'Huy Nguyễn',
    point: 0,
    createdAt: new Date(),
    twitterProfileLink: 'https://twitter.com/asmodeus2k1',
  },
];

const tasks: Task[] = [
  {
    id: '1728936946049974650',
    link: 'https://twitter.com/elonmusk/status/1728936946049974650',
    createdAt: new Date(),
    userId: '1921006696',
  },
  {
    id: '1729039158692528210',
    link: 'https://twitter.com/elonmusk/status/1729039158692528210',
    createdAt: new Date(),
    userId: '1921006696',
  },
];

type Assigment = {
  userId: string;
  twitterProfileLink: string;
  taskIds: string[];
};

type TwitterResponse = {
  data: {
    user: {
      result: {
        timeline_v2: {
          timeline: {
            instructions: {
              entries?: {
                content: any;
                entryId: string;
                sortIndex: string;
              }[];
              type: string;
            }[];
            metadata: {
              srcibeConfig: {
                page: string;
              };
            };
          };
        };
        __typename: string;
      };
    };
  };
};

const cronJobs: ScheduledTask[] = [];

(async () => {
  const redis = RedisClient.getInstance();

  await redis.set('Hi', 1);
  const job1 = schedule('00 00 06 * * *', async () => {
    const assisgements: Assigment[] = [];

    // 1. Query all users
    const allUsers = users;

    // 2. Query all tasks for each user
    for (const user of allUsers) {
      const allTasks = tasks;

      assisgements.push({
        userId: user.id,
        twitterProfileLink: user.twitterProfileLink,
        taskIds: allTasks.map((task) => task.id),
      });

      // 3. Bot sends task links for users
      const links: string[] = [];

      allTasks.forEach((task) => {
        links.push(task.link);
      });
    }

    const key = `assigments-${moment().format('DD-MM-YYYY')}`;
    await redis.set(key, assisgements, 1 * 24 * 60 * 60);

    console.log('Finished cron job 1 !');
  });

  const job2 = schedule('00 00 18 * * *', async () => {
    const key = `assigments-${moment().format('DD-MM-YYYY')}`;
    const assigments = await redis.get<Assigment[]>(key);

    if (!assigments) {
      console.log("Can't get assgiment from cache.");
      return;
    }

    for (const assignment of assigments) {
      const cookies: any[] = [
        {
          name: 'auth_token',
          value: '512b67c92cb46fcdf312f01152eab06c228737dd',
          domain: '.twitter.com',
          path: '/',
          expires: 1736176375.078041,
          httpOnly: true,
          secure: true,
          sameSite: 'None',
          sameParty: false,
          sourceScheme: 'Secure',
          sourcePort: 443,
        },
      ];

      const shareLink = assignment.twitterProfileLink;
      const commentLink = assignment.twitterProfileLink + '/with_replies';
      const likeLink = assignment.twitterProfileLink + '/likes';

      const lishHtml = await getHtml(
        [shareLink, commentLink, likeLink],
        cookies,
      );

      let totalPoints = 0;

      assignment.taskIds.forEach(async (taskId) => {
        console.log('User id: %s; Task id: %s', assignment.userId, taskId);

        let pointInContext = 0;

        lishHtml[0].includes(taskId) && pointInContext++;
        lishHtml[1].includes(taskId) && pointInContext++;
        lishHtml[2].includes(taskId) && pointInContext++;

        pointInContext >= 3 && totalPoints++;
      });

      // Plus point for user
      console.log(
        'Total points of user %s are %s point(s)',
        assignment.userId,
        totalPoints,
      );
    }
  });

  cronJobs.push(job1, job2);
})();

process.on('SIGINT', () => {
  cronJobs.forEach((job) => job.stop());
});

async function getHtml(links: string[], cookies: any[]): Promise<string[]> {
  puppeteerExtra.use(stealthPlugin());

  const browser = await launchPuppeteer({
    launcher: puppeteerExtra,
    launchOptions: {
      args: [
        '--autoplay-policy=user-gesture-required',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-domain-reliability',
        '--disable-extensions',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-print-preview',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-setuid-sandbox',
        '--disable-speech-api',
        '--disable-sync',
        '--hide-scrollbars',
        '--ignore-gpu-blacklist',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--no-sandbox',
        '--no-zygote',
        '--password-store=basic',
        '--use-gl=swiftshader',
        '--use-mock-keychain',
      ],
      headless: false,
      userDataDir: './.puppeteer/userData',
    },
    useChrome: false,
    useIncognitoPages: true,
  });

  const page = await newInjectedPage(browser, {
    fingerprintOptions: {
      browsers: ['chrome'],
      devices: ['desktop'],
      locales: ['en-US'],
      operatingSystems: ['windows', 'linux'],
      strict: true,
    },
  });

  await page.setCookie(...cookies);

  const listHtml: string[] = [];

  for (const link of links) {
    await page.goto(link, {
      waitUntil: 'load',
      timeout: 60_000,
    });

    await sleep(15_000);

    let times = 0;

    await puppeteerUtils.infiniteScroll(page, {
      timeoutSecs: 20,
      waitForSecs: 20,
      scrollDownAndUp: true,
      stopScrollCallback: () => {
        if (times++ > 10) return true;
      },
    });

    listHtml.push(await page.content());
  }

  await browser.close();

  return listHtml;
}
