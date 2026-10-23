import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../../playwright.config';

// All original tests and assertions are retained. Video recording is disabled
// for this measurement so collection can use an installed Chromium executable
// without requiring a separate FFmpeg download.
export default defineConfig({
  ...base,
  testDir: path.resolve(__dirname, '../../../../scripts/e2e'),
  outputDir: path.resolve(__dirname, '../../../../.artifacts/i2-coverage/test-results'),
  reporter: [['line'], ['html', {
    outputFolder: path.resolve(__dirname, '../../../../.artifacts/i2-coverage/playwright-report'),
    open: 'never',
  }]],
  use: {
    ...base.use,
    video: 'off',
    launchOptions: process.env.FARMCLUB_COVERAGE_BROWSER
      ? { executablePath: process.env.FARMCLUB_COVERAGE_BROWSER }
      : {},
  },
});
