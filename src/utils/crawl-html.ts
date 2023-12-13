import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { launchPuppeteer, puppeteerUtils, sleep } from 'crawlee';
import { newInjectedPage } from 'fingerprint-injector';

export async function crawlHtml(
  links: string[],
  cookies: any[],
): Promise<string[]> {
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
      headless: true,
      ignoreDefaultArgs: true,
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
