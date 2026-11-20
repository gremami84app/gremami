-- ============================================================================
-- S15 · Bloqueo de "completado" sin PIN  ·  GREMAMI  ·  Alta Gracia
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   Impide que una orden pase a 'completado' con un PATCH directo del cliente
--   (salteando el PIN), pero permite que la complete release_reward_by_pin.
--
-- CÓMO SE USA:
--   1. Entrá a https://supabase.com/dashboard  ->  tu proyecto  ->  SQL Editor
--   2. Pegá TODO este archivo y presioná "Run"
--   3. Es idempotente: se puede correr las veces que haga falta.
--
-- POR QUÉ FUNCIONA:
--   - Un PATCH del navegador llega a PostgREST con rol efectivo 'authenticated'.
--   - release_reward_by_pin es SECURITY DEFINER: adentro corre como su dueño
--     (normalmente 'postgres'), así que NO es 'authenticated' y pasa.
--   - Un cliente no puede convertirse en 'postgres': no hay forma de saltearlo.
--
-- NOTA: este bloque REEMPLAZA la versión anterior del trigger (la que dependía
--       de current_setting('app.release_pin')). No toca release_reward_by_pin.
-- ============================================================================

-- 1) Función de guardia ------------------------------------------------------
-- OJO: NO lleva SECURITY DEFINER a propósito.
--   - Un PATCH del cliente llega como rol 'authenticated' -> current_user = 'authenticated' -> bloquea.
--   - release_reward_by_pin ES SECURITY DEFINER (dueño postgres); el trigger
--     se ejecuta dentro de ella con current_user = 'postgres' -> permite.
--   Si esta función fuera SECURITY DEFINER, current_user sería SIEMPRE su dueño
--   y el bloqueo nunca se activaría (bug detectado en la prueba del turno 141).
CREATE OR REPLACE FUNCTION public.guard_order_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'completado' AND OLD.status IS DISTINCT FROM 'completado' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'La orden solo puede completarse validando el PIN'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Trigger (se recrea para que tome la función nueva) ----------------------
DROP TRIGGER IF EXISTS trg_guard_order_completion ON public.orders;

CREATE TRIGGER trg_guard_order_completion
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_completion();

-- 3) Verificación ------------------------------------------------------------
-- Esperado: duenio = postgres (o el owner del proyecto) en AMBAS funciones.
-- Si release_reward_by_pin aparece como 'authenticated', avisame: en ese caso
-- hay que usar la variante con set_config en la RPC.
SELECT
  p.proname                                   AS funcion,
  pg_get_userbyid(p.proowner)                 AS duenio,
  (p.prosrc LIKE '%set_config%')              AS tiene_set_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('guard_order_completion', 'release_reward_by_pin')
ORDER BY p.proname;
