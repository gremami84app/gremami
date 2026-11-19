// S10 — Configuración E2E de dos contextos aislados (Sol ↔ Leo)
// Las credenciales se leen SIEMPRE de variables de entorno; nunca hardcodeadas.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1, // dos contextos dentro de un solo test, no en paralelo de suites
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 60_000
  }
});
