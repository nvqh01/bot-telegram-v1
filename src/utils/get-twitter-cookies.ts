import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { launchPuppeteer, puppeteerUtils, sleep } from 'crawlee';
import { newInjectedPage } from 'fingerprint-injector';

export async function getTwitterCookies(
  username: string,
  password: string,
): Promise<string> {
  let browser: Browser | null = null;
  let token: any = {};

  try {
    puppeteerExtra.use(stealthPlugin());

    browser = await launchPuppeteer({
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
        headless: true,
        ignoreHTTPSErrors: true,
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

    await page.goto('https://twitter.com/home', {
      waitUntil: 'load',
      timeout: 30_000,
    });

    const usernameSelector =
      '#layers > div > div > div > div > div > div > div.css-175oi2r.r-1ny4l3l.r-18u37iz.r-1pi2tsx.r-1777fci.r-1xcajam.r-ipm5af.r-g6jmlv.r-1awozwy > div.css-175oi2r.r-1wbh5a2.r-htvplk.r-1udh08x.r-1867qdf.r-kwpbio.r-rsyp9y.r-1pjcn9w.r-1279nm1 > div > div > div.css-175oi2r.r-1ny4l3l.r-6koalj.r-16y2uox.r-kemksi.r-1wbh5a2 > div.css-175oi2r.r-16y2uox.r-1wbh5a2.r-1jgb5lz.r-13qz1uu.r-1ye8kvj > div > div > div > div.css-175oi2r.r-1f1sjgu.r-mk0yit.r-13qz1uu > label > div > div.css-175oi2r.r-18u37iz.r-16y2uox.r-1wbh5a2.r-1wzrnnt.r-1udh08x.r-xd6kpl.r-1pn2ns4.r-ttdzmv > div > input';
    await page.waitForSelector(usernameSelector, {
      timeout: 30_000,
    });
    await page.type(usernameSelector, username, { delay: 250 });

    const nextSelector =
      '#layers > div > div > div > div > div > div > div.css-175oi2r.r-1ny4l3l.r-18u37iz.r-1pi2tsx.r-1777fci.r-1xcajam.r-ipm5af.r-g6jmlv.r-1awozwy > div.css-175oi2r.r-1wbh5a2.r-htvplk.r-1udh08x.r-1867qdf.r-kwpbio.r-rsyp9y.r-1pjcn9w.r-1279nm1 > div > div > div.css-175oi2r.r-1ny4l3l.r-6koalj.r-16y2uox.r-kemksi.r-1wbh5a2 > div.css-175oi2r.r-16y2uox.r-1wbh5a2.r-1jgb5lz.r-13qz1uu.r-1ye8kvj > div > div > div > div:nth-child(6)';
    await page.waitForSelector(nextSelector, {
      timeout: 30_000,
    });
    await page.click(nextSelector);

    const passwordSelector =
      '#layers > div > div > div > div > div > div > div.css-175oi2r.r-1ny4l3l.r-18u37iz.r-1pi2tsx.r-1777fci.r-1xcajam.r-ipm5af.r-g6jmlv.r-1awozwy > div.css-175oi2r.r-1wbh5a2.r-htvplk.r-1udh08x.r-1867qdf.r-kwpbio.r-rsyp9y.r-1pjcn9w.r-1279nm1 > div > div > div.css-175oi2r.r-1ny4l3l.r-6koalj.r-16y2uox.r-kemksi.r-1wbh5a2 > div.css-175oi2r.r-16y2uox.r-1wbh5a2.r-1jgb5lz.r-13qz1uu.r-1ye8kvj > div.css-175oi2r.r-16y2uox.r-1wbh5a2.r-1dqxon3 > div > div > div.css-175oi2r.r-mk0yit.r-13qz1uu > div > label > div > div.css-175oi2r.r-18u37iz.r-16y2uox.r-1wbh5a2.r-1wzrnnt.r-1udh08x.r-xd6kpl.r-1pn2ns4.r-ttdzmv > div.css-1rynq56.r-bcqeeo.r-qvutc0.r-37j5jr.r-135wba7.r-16dba41.r-1awozwy.r-6koalj.r-1inkyih.r-13qz1uu > input';
    await page.waitForSelector(passwordSelector, {
      timeout: 30_000,
    });
    await page.type(passwordSelector, password, { delay: 500 });

    const loginSelector =
      '#layers > div > div > div > div > div > div > div.css-175oi2r.r-1ny4l3l.r-18u37iz.r-1pi2tsx.r-1777fci.r-1xcajam.r-ipm5af.r-g6jmlv.r-1awozwy > div.css-175oi2r.r-1wbh5a2.r-htvplk.r-1udh08x.r-1867qdf.r-kwpbio.r-rsyp9y.r-1pjcn9w.r-1279nm1 > div > div > div.css-175oi2r.r-1ny4l3l.r-6koalj.r-16y2uox.r-kemksi.r-1wbh5a2 > div.css-175oi2r.r-16y2uox.r-1wbh5a2.r-1jgb5lz.r-13qz1uu.r-1ye8kvj > div.css-175oi2r.r-1isdzm1 > div > div.css-175oi2r > div > div > div';
    await page.waitForSelector(loginSelector, {
      timeout: 30_000,
    });
    await page.click(loginSelector);

    await sleep(15_000);

    let num = 0;
    await puppeteerUtils.infiniteScroll(page, {
      timeoutSecs: 10,
      waitForSecs: 10,
      stopScrollCallback: () => {
        if (num++ >= 10) return true;
      },
    });

    const cookies = await page.cookies();

    for (const cookie of cookies) {
      if (cookie.name !== 'auth_token') continue;
      const { size, session, ..._cookie } = cookie;
      token = { ..._cookie };
    }
  } catch (error) {
    browser && (await browser.close());
    throw error;
  }

  return token;
}
