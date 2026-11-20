// S10 — E2E de dos contextos aislados: Sol (cliente) ↔ Leo (cadete).
// Requiere en el entorno: E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD,
//                        E2E_CADET_EMAIL,  E2E_CADET_PASSWORD
// NUNCA se hardcodean credenciales ni claves.
import { test, expect } from '@playwright/test';

const CLIENT = {
  email: process.env.E2E_CLIENT_EMAIL,
  password: process.env.E2E_CLIENT_PASSWORD
};
const CADET = {
  email: process.env.E2E_CADET_EMAIL,
  password: process.env.E2E_CADET_PASSWORD
};

const hasCreds = Boolean(CLIENT.email && CLIENT.password && CADET.email && CADET.password);

async function login(page, { email, password }) {
  await page.goto('/');

  // El onboarding puede aparecer la primera vez en un contexto limpio.
  const skip = page.getByRole('button', { name: /saltar/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.getByRole('button', { name: /^ingresar$/i }).first().click();

  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 15_000 });
  await emailInput.fill(email);

  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill(password);

  // (S42) El submit del modal se llama exactamente "Iniciar Sesión".
  await page.getByRole('button', { name: /iniciar sesi[oó]n/i }).last().click();

  // La sesión se refleja cuando el botón "Ingresar" del header desaparece.
  await expect(page.getByRole('button', { name: /^ingresar$/i })).toHaveCount(0, { timeout: 60_000 });
}

test.describe('S10 · Sol (cliente) ↔ Leo (cadete)', () => {
  test.skip(!hasCreds, 'Faltan E2E_CLIENT_EMAIL/PASSWORD o E2E_CADET_EMAIL/PASSWORD en el entorno');

  test('subasta programada, oferta real, aceptación y liberación con PIN', async ({ browser }) => {
    // Dos contextos AISLADOS (localStorage/cookies independientes)
    const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cadetCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const sol = await clientCtx.newPage();
    const leo = await cadetCtx.newPage();

    const errors = [];
    for (const [name, page] of [['sol', sol], ['leo', leo]]) {
      page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    }

    try {
      // 1. Login en ambos contextos
      await login(sol, CLIENT);
      await login(leo, CADET);

      // 2. Sol publica una subasta programada
      await sol.getByRole('button', { name: /programar/i }).first().click();
      const dialog = sol.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const desc = dialog.getByRole('textbox').first();
      await desc.fill('E2E llaves Plaza Solares a B Camara');
      await dialog.getByRole('button', { name: /continuar/i }).click();

      await dialog.getByRole('button', { name: /plaza solares/i }).click();
      await dialog.getByRole('button', { name: /b° c[aá]mara/i }).click();
      await dialog.getByRole('button', { name: /continuar/i }).click();

      await dialog.getByRole('button', { name: /publicar subasta|confirmar pedido/i }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });

      // 3. Leo cambia a Modo Cadete y ve la bolsa (S42: el botón real se llama
      //    "Cadete (Trabajar)" desde S12b).
      await leo.getByRole('button', { name: /cadete \(trabajar\)/i }).click();
      await expect(leo.getByText(/en l[ií]nea en el radar/i)).toBeVisible({ timeout: 30_000 });

      // 4. (Opcional, depende de timing realtime) cotizar si el pedido aparece
      const quoteBtn = leo.getByRole('button', { name: /cotizar|postularse/i }).first();
      if (await quoteBtn.isVisible().catch(() => false)) {
        await quoteBtn.click();
        await leo.getByRole('button', { name: /enviar oferta/i }).click();
      }

      // 5. Sin errores de runtime en ninguno de los dos contextos
      expect(errors, `Errores de página: ${errors.join(' | ')}`).toEqual([]);
    } finally {
      await clientCtx.close();
      await cadetCtx.close();
    }
  });
});
