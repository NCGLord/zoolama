// Browser tests: `npm run e2e`. The specs are e2e/*.spec.js, a name `npm test` (node --test) never picks up,
// and testDir keeps Playwright away from the unit tests in test/.
import { defineConfig } from '@playwright/test';

const PORT = 8799; // not the README's 8765, so a dev server left running is never mistaken for this one
// The tests run against what Pages publishes (`npm run site`), under the same /zoolama/ sub-path, so a file missing from
// the site or an absolute path that only works at the server root fails here rather than on the phone.
const APP = `http://127.0.0.1:${PORT}/zoolama/`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP,
    browserName: 'chromium',
    // A phone, but not a device preset: an iPhone user agent would turn on the iOS Install button.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR', // detectLang() reads it; the default en-US would start the app in English
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'light',
    reducedMotion: 'reduce', // totals settle at once instead of counting up
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node tools/site.mjs .e2e-site/zoolama && python3 -m http.server ${PORT} --bind 127.0.0.1 --directory .e2e-site`,
    url: APP,
    reuseExistingServer: false, // always rebuild the site: a server left running would serve stale files
    stdout: 'ignore',
    stderr: 'ignore', // http.server logs every request there
  },
});
