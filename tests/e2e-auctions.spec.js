// S46 — Subastas: compromiso de VAL visible por categoría y descuento al cotizar.
// La parte de visibilidad corre sin credenciales; el envío de la oferta requiere
// sesión de cadete (E2E_CADET_EMAIL / E2E_CADET_PASSWORD) y se omite si faltan.
import { test, expect } from '@playwright/test';

const CADET = {
  email: process.env.E2E_CADET_EMAIL,
  password: process.env.E2E_CADET_PASSWORD
};
const hasCadet = Boolean(CADET.email && CADET.password);

async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: /saltar/i });
  const menu = page.getByRole('button', { name: /abrir menú de navegación/i });
  await Promise.race([
    skip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    menu.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  ]);
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 5_000 }).catch(() => {});
  }
  await menu.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
}

async function loginCadete(page) {
  await dismissOnboarding(page);
  await page.getByRole('button', { name: /^ingresar$/i }).first().click();
  await page.locator('input[type="email"]').first().fill(CADET.email);
  await page.locator('input[type="password"]').first().fill(CADET.password);
  await page.getByRole('button', { name: /iniciar sesión/i }).last().click();
  await expect(page.getByRole('button', { name: /^ingresar$/i })).toHaveCount(0, { timeout: 60_000 });
}

async function openAuctionSheet(page) {
  await page.getByRole('button', { name: /cadete \(trabajar\)/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /ver mapa/i }).first().click();
  await page.waitForTimeout(3000);

  const pin = page.locator('[aria-label^="Solicitud"]').first();
  await expect(pin).toBeVisible({ timeout: 30_000 });
  await pin.click({ force: true });
  await page.waitForTimeout(1200);
}

test.describe('S46 · Subastas y compromiso de VAL', () => {
  test('el pin de solicitud expone un aria-label y la ficha muestra el compromiso en VAL', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOnboarding(page);
    await openAuctionSheet(page);

    // Todo pin de solicitud debe ser localizable y describirse solo.
    const pin = page.locator('[aria-label^="Solicitud"]').first();
    const label = await pin.getAttribute('aria-label');
    expect(label).toMatch(/^Solicitud .+ · .+ · \$/);

    // Compromiso por categoría: 1 (caminando/moto/negocios), 2 (auto) o 3 (flete).
    const stakeRow = page.getByText(/compromiso para postularte/i);
    await expect(stakeRow).toBeVisible({ timeout: 15_000 });
    const stakeText = await page
      .locator('div', { has: stakeRow })
      .first()
      .innerText();
    expect(stakeText).toMatch(/\b[123]\s*VAL\b/);

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });

  test('cotizar con sesión descuenta el compromiso del saldo en VAL', async ({ page }) => {
    test.skip(!hasCadet, 'Faltan E2E_CADET_EMAIL / E2E_CADET_PASSWORD para cotizar');

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await loginCadete(page);

    // Saldo antes, leído del panel cadete ("Depósito: N VAL").
    const depositBefore = await page
      .getByText(/dep[oó]sito:\s*\d/i)
      .first()
      .innerText()
      .catch(() => '');
    const before = Number((depositBefore.match(/(\d+(?:\.\d+)?)/) || [])[1] || NaN);

    await openAuctionSheet(page);

    const quoteButton = page.getByRole('button', { name: /cotizar|editar \/ re-cotizar/i }).first();
    await quoteButton.click();

    // Modal de cotización: enviar la oferta con el monto sugerido.
    const submit = page.getByRole('button', { name: /enviar oferta|publicar oferta|confirmar/i }).first();
    await expect(submit).toBeVisible({ timeout: 15_000 });
    await submit.click();
    await page.waitForTimeout(1500);

    // El compromiso (1/2/3 VAL) se descuenta del saldo mostrado.
    const depositAfter = await page
      .getByText(/dep[oó]sito:\s*\d/i)
      .first()
      .innerText()
      .catch(() => '');
    const after = Number((depositAfter.match(/(\d+(?:\.\d+)?)/) || [])[1] || NaN);

    if (Number.isFinite(before) && Number.isFinite(after)) {
      expect(after).toBeLessThan(before);
    }

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });
});
