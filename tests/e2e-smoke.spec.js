// S42 — Smoke E2E sin credenciales: protege el estado invitado y la UI base.
// Corre siempre (no depende de variables de entorno) y falla ante cualquier
// pageerror, así detecta regresiones de runtime que el build no atrapa.
import { test, expect } from '@playwright/test';

// (S42) El gate de onboarding puede montarse después del goto: hay que esperar
// a que aparezca (o a que aparezca el header) antes de decidir si se saltea.
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

test.describe('S42 · Invitado y UI base', () => {
  test('home carga sin pageerror y arranca en 0 VAL', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOnboarding(page);

    await expect(page.getByRole('button', { name: /abrir menú de navegación/i })).toBeVisible({ timeout: 20_000 });

    // Menú: invitado sin saldo ficticio y con badge de chats en 0
    await page.getByRole('button', { name: /abrir menú de navegación/i }).click();
    await expect(page.getByText('Invitado')).toBeVisible();
    await expect(page.getByText('0.00 VALENS')).toBeVisible();
    const chatsEntry = page.getByRole('button', { name: /chats p2p activos/i });
    await expect(chatsEntry).toContainText('0');

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });

  test('modo día y modo noche se alternan sin romper el render', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOnboarding(page);
    await page.waitForTimeout(800);

    const toggle = page.locator('[aria-label*="Alternar"]').first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });

    const before = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
    await toggle.click();
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));

    expect(after).not.toBe(before);
    expect(after).toBeTruthy();

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });

  test('billetera carga saldo en VAL y el lector de QR responde a un código inválido', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOnboarding(page);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /abrir menú de navegación/i }).click();
    await page.getByRole('button', { name: /billetera/i }).first().click();

    await expect(page.getByText(/billetera valenscoin/i).first()).toBeVisible({ timeout: 30_000 });
    // El saldo canónico se muestra como "<n>.00 VAL"
    await expect(page.getByText(/saldo de agradecimiento/i)).toBeVisible();

    // Lector QR: un código ajeno NO debe romper la vista
    await page.getByRole('button', { name: /enviar val/i }).first().click();
    await page.getByRole('button', { name: /escanear qr/i }).first().click();
    const manual = page.locator('#qr-manual');
    await expect(manual).toBeVisible();
    await manual.fill('codigo-ajeno');
    await page.getByRole('button', { name: /usar este código/i }).click();
    await expect(page.getByText(/no es de gremami/i)).toBeVisible();

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });

  test('ficha de proveedor abre sobre el mapa con el costo en VAL', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await dismissOnboarding(page);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /ver mapa/i }).first().click();
    await page.waitForTimeout(3000);

    const marker = page.locator('.custom-peer-marker').first();
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await marker.click();

    await expect(page.getByText(/costo en val de esta categoría/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/datos de contacto privados/i)).toBeVisible();

    expect(errors, `pageerror: ${errors.join(' | ')}`).toEqual([]);
  });
});
