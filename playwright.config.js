// Browser tests: `npm run e2e`. The specs are e2e/*.spec.js, a name `npm test` (node --test) never picks up,
// and testDir keeps Playwright away from the unit tests in test/.
import { defineConfig } from '@playwright/test';

const PORT = 8799; // not the README's 8765, so a dev server left running is never mistaken for this one

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
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
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore', // http.server logs every request there
  },
});
