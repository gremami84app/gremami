-- ====================================================================
-- GREMAMI P2P - ESQUEMA INTEGRAL DE BASE DE DATOS, STORAGE Y BACKEND
-- Región: Alta Gracia, Valle de Paravachasca y Gran Córdoba
-- Auditoría Integral: Tablas, RLS, Realtime y Storage Buckets
-- ====================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 0. LIMPIEZA PREVIA (idempotente)
-- Elimina versiones previas/incompletas para recrear el esquema desde cero.
-- Las tablas están vacías, por lo que no se pierde información.
-- ====================================================================
DROP VIEW IF EXISTS public.transactions CASCADE;
DROP VIEW IF EXISTS public.profiles_public CASCADE;
DROP VIEW IF EXISTS public.mandados CASCADE;
DROP TABLE IF EXISTS public.valens_transactions CASCADE;
DROP TABLE IF EXISTS public.dex_orders CASCADE;
DROP TABLE IF EXISTS public.user_reports CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.bids CASCADE;
DROP TABLE IF EXISTS public.offers CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.token_genesis CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Funciones previas (evita "cannot change return type of existing function")
DROP FUNCTION IF EXISTS public.search_community_users(text) CASCADE;
DROP FUNCTION IF EXISTS public.set_order_pin(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.claim_faucet_tokens(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_wallet_address() CASCADE;
DROP FUNCTION IF EXISTS public.claim_school_reward(integer) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_valens_tokens(uuid, text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_valens_tokens(uuid, text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.release_reward_by_pin(uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_blocked_between(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.sync_wallet_columns() CASCADE;
DROP FUNCTION IF EXISTS public.sync_order_columns() CASCADE;

-- ====================================================================
-- 1. TABLA: PROFILES (Usuarios, Cadetes, Clientes y Comercios)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'Usuario Gremami',
  avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  role TEXT CHECK (role IN ('cliente', 'cadete', 'comercio', 'ambos')) DEFAULT 'cadete',
  vehicle_type TEXT CHECK (vehicle_type IN ('caminando', 'bicicleta', 'moto', 'auto', 'flete')) DEFAULT 'moto',
  service_modality TEXT CHECK (service_modality IN ('pasajeros', 'paqueteria', 'mixto', 'envios')) DEFAULT 'mixto',
  is_online BOOLEAN DEFAULT false,
  payment_alias TEXT DEFAULT 'cadete.gremami.mp',
  whatsapp TEXT DEFAULT '',
  coverage_zone TEXT DEFAULT 'Alta Gracia & Valle de Paravachasca',
  lat DOUBLE PRECISION DEFAULT -31.6529,
  lng DOUBLE PRECISION DEFAULT -64.4283,
  last_location_update TIMESTAMPTZ DEFAULT NOW(),
  referral_code TEXT,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- (S11) Dirección pública ValensCoin persistente y única por usuario.
  wallet_address TEXT,
  
  -- Campos auxiliares de cobro y reputación
  fiat_provider TEXT DEFAULT 'Mercado Pago',
  fiat_alias TEXT DEFAULT 'cadete.gremami.mp',
  fiat_cbu_cvu TEXT,
  fiat_holder_name TEXT,
  fiat_cuit TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibilidad con proyectos donde profiles se creó antes de vehicle_type.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'moto'
  CHECK (vehicle_type IN ('caminando', 'bicicleta', 'moto', 'auto', 'flete'));

-- Añadir email y username a profiles para búsqueda pública sin acceder a auth.users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- (S11) Billetera real: dirección pública ValensCoin persistente por perfil.
-- ensure_wallet_address() la genera de forma determinista a partir del UUID.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Índice único parcial: varias filas pueden estar en NULL (usuarios aún sin
-- dirección), pero una dirección ya asignada no puede repetirse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_wallet_address
  ON public.profiles(wallet_address)
  WHERE wallet_address IS NOT NULL;

-- Índices para búsqueda rápida por email y username
CREATE INDEX IF NOT EXISTS idx_profiles_email    ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- ====================================================================
-- 2. TABLA: ORDERS (Mandados / Solicitudes de Logística P2P)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cadete_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_cadet_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- compatibilidad
  title TEXT NOT NULL DEFAULT 'Mandado Gremami P2P',
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('caminando', 'bicicleta', 'moto', 'motocicleta', 'auto', 'automovil', 'flete', 'fletes')),
  status TEXT CHECK (status IN (
    'pendiente', 'ofertado', 'en_curso', 'completado', 'cancelado',
    'open', 'assigned', 'in_transit', 'completed', 'cancelled'
  )) DEFAULT 'pendiente',
  origin_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL DEFAULT -31.6529,
  origin_lng DOUBLE PRECISION NOT NULL DEFAULT -64.4283,
  price_ars NUMERIC(12, 2) NOT NULL DEFAULT 2500.0,
  base_price_ars NUMERIC(12, 2) DEFAULT 2500.0, -- compatibilidad
  reward_val NUMERIC(8, 2) NOT NULL DEFAULT 1.0,
  val_incentive NUMERIC(8, 2) DEFAULT 1.0, -- compatibilidad
  -- (S08) El PIN ya NO se guarda en claro: solo su hash bcrypt.
  delivery_pin VARCHAR(4),   -- obsoleto: se mantiene por compatibilidad y queda NULL
  pin_hash TEXT,             -- hash bcrypt (pgcrypto) del PIN de entrega
  pin_attempts INT NOT NULL DEFAULT 0,
  whatsapp_shared BOOLEAN NOT NULL DEFAULT false,
  -- (S09.6a) Pedidos urgentes vs. subastas programadas
  scheduled_for TIMESTAMPTZ,                    -- NULL = urgente / ahora
  is_urgent BOOLEAN NOT NULL DEFAULT true,      -- false cuando es programado
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vista Segura: Perfiles Públicos con Enmascaramiento de WhatsApp Sensible
-- NOTA DE SEGURIDAD (S05): esta vista es owner-privileged A PROPÓSITO (security_invoker = false).
-- Necesita leer todas las filas de profiles (la RLS de profiles solo permite la fila propia) y su
-- seguridad depende de la lista curada de columnas + el enmascarado de whatsapp por auth.uid().
-- NO cambiar a security_invoker = true sin rediseñar el mapa de cadetes y la búsqueda de usuarios.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.role,
    p.vehicle_type,
    p.service_modality,
    p.is_online,
    p.payment_alias,
    p.coverage_zone,
    p.lat,
    p.lng,
    p.last_location_update,
    p.referral_code,
    p.referred_by,
    p.created_at,
    -- El número de WhatsApp permanece privado por defecto, solo visible si se compartió en una orden activa
    CASE 
      WHEN auth.uid() = p.id THEN p.whatsapp
      WHEN EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.whatsapp_shared = true
          AND ((o.client_id = auth.uid() AND (o.cadete_id = p.id OR o.assigned_cadet_id = p.id))
            OR ((o.cadete_id = auth.uid() OR o.assigned_cadet_id = auth.uid()) AND o.client_id = p.id))
      ) THEN p.whatsapp
      ELSE NULL
    END AS whatsapp
  FROM public.profiles p;

-- Vista de compatibilidad para "mandados" — security_invoker fuerza evaluación de RLS con el usuario llamante
CREATE OR REPLACE VIEW public.mandados WITH (security_invoker = true) AS
  SELECT * FROM public.orders;

-- ====================================================================
-- 3. TABLA: OFFERS / BIDS (Ofertas y Subastas P2P en Vivo)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cadete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_price_ars NUMERIC(12, 2) NOT NULL,
  note TEXT,
  status TEXT CHECK (status IN ('pendiente', 'aceptada', 'rechazada', 'pending', 'accepted', 'rejected')) DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vista/Tabla de compatibilidad para "bids"
CREATE TABLE IF NOT EXISTS public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cadet_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ars NUMERIC(12, 2) NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'pendiente', 'aceptada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 4. TABLA: MESSAGES / CHATS (Mensajería P2P por Mandado)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_system_event BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 5. TABLA: REVIEWS (Sistema de Reputación y Estrellas)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars INT CHECK (stars BETWEEN 1 AND 5) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 6. TABLA: USER_BLOCKS (Seguridad y Bloqueo P2P)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_blocker_blocked UNIQUE (blocker_id, blocked_id)
);

-- ====================================================================
-- 7. TABLA: USER_REPORTS (Denuncias y Moderación Comunitaria)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT CHECK (status IN ('pendiente', 'revisado')) DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 8. TABLA: DEX_ORDERS (Mercado P2P de Tokens ValensCoin)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.dex_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_type TEXT CHECK (order_type IN ('donacion', 'venta_val', 'compra_val')) NOT NULL,
  amount_val NUMERIC(14, 2) NOT NULL,
  price_ars_unit NUMERIC(14, 2) NOT NULL,
  payment_method TEXT DEFAULT 'Mercado Pago',
  status TEXT CHECK (status IN ('abierta', 'completada', 'cancelada')) DEFAULT 'abierta',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 9. TABLA: WALLETS (Billeteras Duales)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_ars NUMERIC(14, 2) NOT NULL DEFAULT 0.0,
  balance_val NUMERIC(14, 2) NOT NULL DEFAULT 10.0,
  ars_collected NUMERIC(14, 2) DEFAULT 0.0, -- compatibilidad
  valens_balance NUMERIC(14, 2) DEFAULT 10.0, -- compatibilidad
  -- (S12.0) Se declara acá y no en la sección 19: la política wallets_insert_own_initial
  -- (sección 15) la referencia antes, y con check_function_bodies daba 42703.
  balance_valens BIGINT DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 9b. TABLA: CRYPTO_SCHOOL_PROGRESS (Escuela Cripto — recompensa única)
-- --------------------------------------------------------------------
-- (S11) Estado del cuestionario de la Escuela Cripto. La recompensa de
-- 5 VAL se acredita UNA sola vez al aprobar con ≥ 4/5 respuestas
-- correctas. La escritura ocurre únicamente dentro de
-- public.claim_school_reward() (SECURITY DEFINER): no hay políticas de
-- INSERT/UPDATE para clientes anon/authenticated.
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.crypto_school_progress (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_score INT NOT NULL DEFAULT 0 CHECK (quiz_score BETWEEN 0 AND 5),
  passed BOOLEAN NOT NULL DEFAULT false,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  reward_amount INT NOT NULL DEFAULT 5,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 10. TABLA: VALENS_TRANSACTIONS / TRANSACTIONS (Historial y Libro Mayor)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.valens_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  from_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- compatibilidad
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- compatibilidad
  amount_ars NUMERIC(14, 2) DEFAULT 0.0,
  amount_val NUMERIC(14, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'servicio', 'recompensa_pin', 'dex', 'faucet',
    'reward_release', 'direct_transfer', 'tip'
  )),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 10b. TABLA: DELIVERIES (Entregas validadas con PIN)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cadet_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  amount_ars NUMERIC(14, 2) NOT NULL,
  amount_val NUMERIC(14, 2) NOT NULL,
  pin TEXT,                  -- (S08) obsoleto: el PIN vive como hash en orders.pin_hash
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_cadet ON public.deliveries(cadet_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON public.deliveries(created_at);

-- RLS en deliveries
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliveries_select_parties" ON public.deliveries;
CREATE POLICY "deliveries_select_parties" ON public.deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (o.client_id = auth.uid() OR o.cadete_id = auth.uid() OR o.assigned_cadet_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "deliveries_insert_cadet" ON public.deliveries;
CREATE POLICY "deliveries_insert_cadet" ON public.deliveries
  FOR INSERT WITH CHECK (
    auth.uid() = cadet_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (o.client_id = auth.uid() OR o.cadete_id = auth.uid() OR o.assigned_cadet_id = auth.uid())
    )
  );

-- ====================================================================
-- 11. ÍNDICES DE ALTO RENDIMIENTO
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_online ON public.profiles(is_online);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_category ON public.orders(category);
CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_cadete ON public.orders(cadete_id);
CREATE INDEX IF NOT EXISTS idx_offers_order ON public.offers(order_id);
CREATE INDEX IF NOT EXISTS idx_offers_cadete ON public.offers(cadete_id);
CREATE INDEX IF NOT EXISTS idx_messages_order ON public.messages(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON public.reviews(reviewed_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_dex_status ON public.dex_orders(status);
CREATE INDEX IF NOT EXISTS idx_tx_from ON public.valens_transactions(from_user);
CREATE INDEX IF NOT EXISTS idx_tx_to ON public.valens_transactions(to_user);

-- ====================================================================
-- 12. TRIGGERS DE SINCRONIZACIÓN AUTOMÁTICA
-- ====================================================================

-- A. Creación Automática de Perfil y Billetera tras Registro en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_avatar TEXT;
  v_role TEXT;
  v_ref_code TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    SPLIT_PART(NEW.email, '@', 1),
    'Usuario Gremami'
  );

  v_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  );

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cadete');
  v_ref_code := 'ref-' || SUBSTRING(NEW.id::text, 1, 8);

  -- 1. Insertar Perfil (con email y username para búsqueda pública)
  INSERT INTO public.profiles (
    id, full_name, avatar_url, role, referral_code, payment_alias, email, username
  )
  VALUES (
    NEW.id, v_name, v_avatar, v_role, v_ref_code, 'cadete.gremami.mp',
    NEW.email,
    LOWER(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)), '[^a-z0-9]', '_', 'g'))
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    email      = EXCLUDED.email,
    username   = COALESCE(profiles.username, EXCLUDED.username),
    updated_at = NOW();

  -- 2. Insertar Billetera Dual (10.0 VAL + $0.0 ARS)
  INSERT INTO public.wallets (
    user_id, balance_val, balance_ars, valens_balance, ars_collected
  )
  VALUES (
    NEW.id, 10.0, 0.0, 10.0, 0.0
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Transacción Inicial de Faucet de Bienvenida
  INSERT INTO public.valens_transactions (
    from_user, to_user, receiver_id, amount_val, amount_ars, type, description
  )
  VALUES (
    NULL, NEW.id, NEW.id, 10.0, 0.0, 'faucet', 'Airdrop Inicial de Bienvenida (10.0 VALENS)'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. Sincronizar columnas duales en wallets (balance_val <-> valens_balance)
CREATE OR REPLACE FUNCTION public.sync_wallet_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.balance_val IS DISTINCT FROM OLD.balance_val THEN
    NEW.valens_balance := NEW.balance_val;
  ELSIF NEW.valens_balance IS DISTINCT FROM OLD.valens_balance THEN
    NEW.balance_val := NEW.valens_balance;
  END IF;

  IF NEW.balance_ars IS DISTINCT FROM OLD.balance_ars THEN
    NEW.ars_collected := NEW.balance_ars;
  ELSIF NEW.ars_collected IS DISTINCT FROM OLD.ars_collected THEN
    NEW.balance_ars := NEW.ars_collected;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wallet_columns ON public.wallets;
CREATE TRIGGER trg_sync_wallet_columns
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.sync_wallet_columns();

-- C. Sincronizar columnas duales en orders (cadete_id <-> assigned_cadet_id, price_ars <-> base_price_ars)
CREATE OR REPLACE FUNCTION public.sync_order_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cadete_id IS NOT NULL AND NEW.assigned_cadet_id IS NULL THEN
    NEW.assigned_cadet_id := NEW.cadete_id;
  ELSIF NEW.assigned_cadet_id IS NOT NULL AND NEW.cadete_id IS NULL THEN
    NEW.cadete_id := NEW.assigned_cadet_id;
  END IF;

  IF NEW.price_ars IS NOT NULL THEN
    NEW.base_price_ars := NEW.price_ars;
  END IF;

  IF NEW.reward_val IS NOT NULL THEN
    NEW.val_incentive := NEW.reward_val;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_columns ON public.orders;
CREATE TRIGGER trg_sync_order_columns
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_columns();

-- ====================================================================
-- 13a. FUNCIÓN RPC: REGISTRO DEL PIN (S08) — hash bcrypt
-- ====================================================================
CREATE OR REPLACE FUNCTION public.set_order_pin(
  p_order_id UUID,
  p_pin      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- (S08-Fix) pgcrypto vive en el schema "extensions" en Supabase: sin él,
-- crypt()/gen_salt() no resuelven y PostgREST responde 404.
SET search_path = public, extensions
AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_pin IS NULL OR length(btrim(p_pin)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN inválido (mínimo 4 caracteres)');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;

  -- Solo el cliente dueño de la orden define el PIN
  IF v_order.client_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el cliente puede definir el PIN');
  END IF;

  UPDATE public.orders
  SET pin_hash     = crypt(btrim(p_pin), gen_salt('bf')),
      delivery_pin = NULL,
      pin_attempts = 0,
      updated_at   = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

-- ====================================================================
-- 13. FUNCIÓN RPC: LIBERACIÓN POR PIN CON CONTROL DE INTENTOS
-- ====================================================================
-- (S15, certificado en vivo) Anti-salto del PIN.
-- IMPORTANTE: esta función NO debe ser SECURITY DEFINER. Con DEFINER,
-- current_user pasa a ser el dueño de la función y el chequeo nunca se
-- cumpliría (la orden se completaría sin PIN). Con invoker rights:
--   · PATCH del cliente  -> current_user = 'authenticated' -> bloquea (42501)
--   · release_reward_by_pin (DEFINER, dueño postgres) -> current_user = 'postgres' -> permite
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

DROP TRIGGER IF EXISTS trg_guard_order_completion ON public.orders;
CREATE TRIGGER trg_guard_order_completion
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_completion();

CREATE OR REPLACE FUNCTION public.release_reward_by_pin(
  p_order_id UUID,
  p_pin TEXT,
  p_cadet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- (S08-Fix) pgcrypto vive en el schema "extensions" en Supabase: sin él,
-- crypt() no resuelve y PostgREST responde 404 al validar el PIN.
SET search_path = public, extensions
AS $$
DECLARE
  v_order RECORD;
  v_tx_id UUID;
  v_ars NUMERIC;
  v_val NUMERIC;
BEGIN
  -- Autorización: rechazar llamadas anónimas antes de revelar si la orden existe
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado para liberar esta orden');
  END IF;

  -- 1. Bloquear registro de la orden
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;

  -- (S12.1 / B2) Puede liberar el CLIENTE o el CADETE asignado a la entrega.
  -- La posesión del PIN (hash bcrypt) sigue siendo la prueba real: el cadete
  -- no puede leerlo porque nunca se guarda en claro.
  IF auth.uid() IS DISTINCT FROM v_order.client_id
     AND auth.uid() IS DISTINCT FROM v_order.cadete_id
     AND auth.uid() IS DISTINCT FROM v_order.assigned_cadet_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado para liberar esta orden');
  END IF;

  IF v_order.status IN ('completado', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta orden ya fue completada');
  END IF;

  -- 2. Control de Intentos Fallidos de PIN (Máximo 3)
  IF COALESCE(v_order.pin_attempts, 0) >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Límite de intentos de PIN excedido (3/3). Contacta a soporte por seguridad.'
    );
  END IF;

  -- 3. Validar PIN contra el hash bcrypt (nunca contra texto plano)
  IF v_order.pin_hash IS NULL OR crypt(TRIM(p_pin), v_order.pin_hash) <> v_order.pin_hash THEN
    UPDATE public.orders
    SET pin_attempts = COALESCE(pin_attempts, 0) + 1, updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Código PIN incorrecto. Intento ' || (COALESCE(v_order.pin_attempts, 0) + 1) || ' de 3.'
    );
  END IF;

  v_ars := COALESCE(v_order.price_ars, v_order.base_price_ars, 0);
  v_val := COALESCE(v_order.reward_val, v_order.val_incentive, 1.0);

  -- (S15) Habilita la transición a 'completado' SOLO dentro de esta transacción.
  PERFORM set_config('app.release_pin', 'on', true);

  -- 4. Marcar orden como completada
  UPDATE public.orders
  SET 
    status = 'completado',
    cadete_id = COALESCE(cadete_id, p_cadet_id),
    assigned_cadet_id = COALESCE(assigned_cadet_id, p_cadet_id),
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 5. Acreditar saldo en la billetera del cadete
  INSERT INTO public.wallets (
    user_id, balance_val, balance_ars, valens_balance, ars_collected, updated_at
  )
  VALUES (
    p_cadet_id, 10.0 + v_val, v_ars, 10.0 + v_val, v_ars, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    balance_val = public.wallets.balance_val + v_val,
    valens_balance = public.wallets.valens_balance + v_val,
    balance_ars = public.wallets.balance_ars + v_ars,
    ars_collected = public.wallets.ars_collected + v_ars,
    updated_at = NOW();

  -- 6. Debitar fianza del cliente si existe
  IF v_order.client_id IS NOT NULL THEN
    UPDATE public.wallets
    SET 
      balance_val = GREATEST(0, balance_val - v_val),
      valens_balance = GREATEST(0, valens_balance - v_val),
      updated_at = NOW()
    WHERE user_id = v_order.client_id;
  END IF;

  -- 7. Registrar en el libro de transacciones
  INSERT INTO public.valens_transactions (
    order_id, from_user, to_user, sender_id, receiver_id,
    amount_val, amount_ars, type, description
  )
  VALUES (
    p_order_id, v_order.client_id, p_cadet_id, v_order.client_id, p_cadet_id,
    v_val, v_ars, 'recompensa_pin',
    'Entrega finalizada con PIN soberano: ' || v_order.title
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'completado',
    'cadet_id', p_cadet_id,
    'amount_ars', v_ars,
    'amount_val', v_val,
    'transaction_id', v_tx_id,
    'message', 'Entrega verificada exitosamente. Fondos acreditados al cadete.'
  );
END;
$$;

-- ====================================================================
-- 14. FUNCIÓN HELPER: VALIDACIÓN DE BLOQUEOS P2P
-- ====================================================================
CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF user_a IS NULL OR user_b IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ====================================================================
-- 15. SEGURIDAD: ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dex_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valens_transactions ENABLE ROW LEVEL SECURITY;

-- 1. Políticas Profiles
-- Solo el dueño puede leer su fila completa (contiene WhatsApp, CBU/CVU, CUIT, teléfono).
-- Las lecturas públicas deben usar la vista segura public.profiles_public.
DROP POLICY IF EXISTS "profiles_select_public_filtered" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Políticas Orders
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT USING (
    -- Abiertas para todos sin bloqueos, o visibles para las partes de la orden
    (status IN ('pendiente', 'ofertado', 'open') AND NOT public.is_blocked_between(auth.uid(), client_id))
    OR auth.uid() = client_id
    OR auth.uid() = cadete_id
    OR auth.uid() = assigned_cadet_id
  );

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (client_id IS NULL OR client_id = auth.uid())
  );

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders
  FOR UPDATE USING (
    auth.uid() = client_id 
    OR auth.uid() = cadete_id 
    OR auth.uid() = assigned_cadet_id
  );

-- 3. Políticas Offers & Bids
DROP POLICY IF EXISTS "offers_select_policy" ON public.offers;
CREATE POLICY "offers_select_policy" ON public.offers
  FOR SELECT USING (
    NOT public.is_blocked_between(auth.uid(), cadete_id)
  );

DROP POLICY IF EXISTS "offers_insert_policy" ON public.offers;
CREATE POLICY "offers_insert_policy" ON public.offers
  FOR INSERT WITH CHECK (auth.uid() = cadete_id);

DROP POLICY IF EXISTS "offers_update_policy" ON public.offers;
CREATE POLICY "offers_update_policy" ON public.offers
  FOR UPDATE USING (auth.uid() = cadete_id);

-- (S12.1 / B1) El CLIENTE dueño de la orden también puede aceptar/rechazar ofertas.
-- Sin esto, aceptar un cadete fallaba con 403: la única política de UPDATE era
-- del cadete sobre su propia oferta.
DROP POLICY IF EXISTS "offers_update_client" ON public.offers;
CREATE POLICY "offers_update_client" ON public.offers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = offers.order_id AND o.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = offers.order_id AND o.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bids_select_policy" ON public.bids;
CREATE POLICY "bids_select_policy" ON public.bids
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bids_insert_policy" ON public.bids;
CREATE POLICY "bids_insert_policy" ON public.bids
  FOR INSERT WITH CHECK (auth.uid() = cadet_id);

-- 4. Políticas Messages (Chat P2P Seguro)
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (o.client_id = auth.uid() OR o.cadete_id = auth.uid() OR o.assigned_cadet_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (o.client_id = auth.uid() OR o.cadete_id = auth.uid() OR o.assigned_cadet_id = auth.uid())
      AND NOT public.is_blocked_between(o.client_id, o.cadete_id)
    )
  );

-- 5. Políticas Reviews
DROP POLICY IF EXISTS "reviews_select_all" ON public.reviews;
CREATE POLICY "reviews_select_all" ON public.reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;
CREATE POLICY "reviews_insert_authenticated" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- 6. Políticas User Blocks
DROP POLICY IF EXISTS "user_blocks_policy" ON public.user_blocks;
CREATE POLICY "user_blocks_policy" ON public.user_blocks
  FOR ALL USING (auth.uid() = blocker_id);

-- 7. Políticas User Reports
DROP POLICY IF EXISTS "user_reports_insert" ON public.user_reports;
CREATE POLICY "user_reports_insert" ON public.user_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "user_reports_select_own" ON public.user_reports;
CREATE POLICY "user_reports_select_own" ON public.user_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- 8. Políticas DEX Orders
DROP POLICY IF EXISTS "dex_orders_select" ON public.dex_orders;
CREATE POLICY "dex_orders_select" ON public.dex_orders
  FOR SELECT USING (status = 'abierta' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "dex_orders_manage_own" ON public.dex_orders;
CREATE POLICY "dex_orders_manage_own" ON public.dex_orders
  FOR ALL USING (auth.uid() = user_id);

-- 9. Políticas Wallets
DROP POLICY IF EXISTS "wallets_select" ON public.wallets;
CREATE POLICY "wallets_select" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

-- (S07-Fix) Permite crear la billetera inicial si el trigger handle_new_user no la creó.
-- El WITH CHECK congela los valores de bienvenida: no se pueden inventar saldos.
-- No habilita UPDATE: los saldos se mueven solo por RPC SECURITY DEFINER.
DROP POLICY IF EXISTS "wallets_insert_own_initial" ON public.wallets;
CREATE POLICY "wallets_insert_own_initial" ON public.wallets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND balance_val    = 10.0
    AND valens_balance = 10.0
    AND balance_ars    = 0.0
    AND ars_collected  = 0.0
    AND COALESCE(balance_valens, 10) = 10
  );

-- IMPORTANTE (S06.0): NO existe política de UPDATE sobre public.wallets, a propósito.
--   * Con RLS habilitada y sin política de UPDATE, PostgreSQL DENIEGA todo UPDATE
--     hecho por anon/authenticated (deny-by-default): el cliente no puede tocar saldos.
--   * Se eliminó la política previa "wallets_update_own" porque su WITH CHECK consultaba
--     public.wallets desde una política de public.wallets, lo que dispara
--     "infinite recursion detected in policy for relation wallets" (SQLSTATE 42P17).
--   * Las mutaciones de saldo SOLO ocurren dentro de funciones SECURITY DEFINER
--     (transfer_valens_tokens, claim_faucet_tokens, release_reward_by_pin) y del trigger
--     on_auth_user_created. Esas rutinas corren como owner y no pasan por RLS.
--   * La línea DROP de abajo se mantiene para limpiar la política vieja si este script
--     se vuelve a ejecutar sobre una base que ya la tenía.
DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;

-- 9b. Políticas Crypto School Progress (solo lectura propia; escritura por RPC)
ALTER TABLE public.crypto_school_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crypto_school_progress_select_own" ON public.crypto_school_progress;
CREATE POLICY "crypto_school_progress_select_own" ON public.crypto_school_progress
  FOR SELECT USING (auth.uid() = user_id);

-- IMPORTANTE: NO existe política de INSERT/UPDATE sobre crypto_school_progress.
-- El progreso y la recompensa de 5 VAL solo se escriben dentro de
-- public.claim_school_reward(), que corre como owner (SECURITY DEFINER) y
-- valida el puntaje y el doble reclamo de forma atómica.

-- 10. Políticas Transactions
DROP POLICY IF EXISTS "tx_select" ON public.valens_transactions;
CREATE POLICY "tx_select" ON public.valens_transactions
  FOR SELECT USING (
    auth.uid() = from_user 
    OR auth.uid() = to_user
    OR auth.uid() = sender_id 
    OR auth.uid() = receiver_id
  );

-- ====================================================================
-- 16. CANALES SUPABASE REALTIME
-- ====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'dex_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dex_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  END IF;
END $$;

-- ====================================================================
-- 17. STORAGE BUCKETS (Avatars, Verifications/Documents, Shops)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('shops', 'shops', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('verifications', 'verifications', false, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas de Storage: Avatars (Público para lectura, autenticado para subida)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
  );

-- Políticas de Storage: Shops (Público para lectura, autenticado para subida)
DROP POLICY IF EXISTS "shops_public_select" ON storage.objects;
CREATE POLICY "shops_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'shops');

DROP POLICY IF EXISTS "shops_auth_insert" ON storage.objects;
CREATE POLICY "shops_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'shops' 
    AND auth.role() = 'authenticated'
  );

-- Políticas de Storage: Verifications / Documents (Privado, solo usuario propietario)
DROP POLICY IF EXISTS "verifications_owner_select" ON storage.objects;
CREATE POLICY "verifications_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "verifications_owner_insert" ON storage.objects;
CREATE POLICY "verifications_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verifications'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ====================================================================
-- 18. TOKEN GENESIS — ValensCoin (VAL) Tokenomics y Configuración de Red
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.token_genesis (
  id SERIAL PRIMARY KEY,
  token_symbol TEXT NOT NULL DEFAULT 'VAL',
  token_name TEXT NOT NULL DEFAULT 'ValensCoin',
  total_supply BIGINT NOT NULL DEFAULT 1000000000000,
  decimals INTEGER NOT NULL DEFAULT 0,
  faucet_drip_amount INTEGER NOT NULL DEFAULT 5,
  initial_user_airdrop INTEGER NOT NULL DEFAULT 10,
  reserve_balance BIGINT NOT NULL DEFAULT 1000000000000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registro único de génesis
INSERT INTO public.token_genesis (
  token_symbol, token_name, total_supply, decimals,
  faucet_drip_amount, initial_user_airdrop, reserve_balance
)
SELECT 'VAL', 'ValensCoin', 1000000000000, 0, 5, 10, 1000000000000
WHERE NOT EXISTS (SELECT 1 FROM public.token_genesis WHERE token_symbol = 'VAL');

-- Seguridad de token_genesis: legible públicamente, pero solo escribible
-- por las funciones SECURITY DEFINER internas (no por clientes anon/authenticated).
ALTER TABLE public.token_genesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_genesis_select_public" ON public.token_genesis;
CREATE POLICY "token_genesis_select_public" ON public.token_genesis
  FOR SELECT USING (true);

-- ====================================================================
-- 19. EXTENSIÓN DE WALLETS — Campos Cripto para ValensCoin L1
-- ====================================================================
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS public_address TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS balance_valens BIGINT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS encrypted_seed_phrase TEXT;

-- Sincronizar balance_valens con balance_val al arrancar (redondeo entero)
UPDATE public.wallets SET balance_valens = FLOOR(COALESCE(balance_val, valens_balance, 10)) WHERE balance_valens IS NULL;

-- ====================================================================
-- 20. TABLA: TRANSACTIONS (Alias uniforme de valens_transactions)
-- ====================================================================
CREATE OR REPLACE VIEW public.transactions WITH (security_invoker = true) AS
  SELECT
    id,
    order_id,
    from_user      AS sender_id,
    to_user        AS receiver_id,
    sender_id      AS sender_user_id,
    receiver_id    AS receiver_user_id,
    amount_val     AS amount,
    amount_ars,
    type,
    description,
    created_at,
    NULL::TEXT     AS tx_hash,
    NULL::TEXT     AS sender_address,
    NULL::TEXT     AS receiver_address,
    'confirmed'::TEXT AS status
  FROM public.valens_transactions;

-- ====================================================================
-- 21. FUNCIÓN RPC: TRANSFERENCIA ATÓMICA DE VALENSCOIN (Integers Only)
-- --------------------------------------------------------------------
-- (S11) Versión blindada:
--   * Resuelve el receptor por public.profiles.wallet_address y, por
--     compatibilidad, por public.wallets.public_address.
--   * Rechaza direcciones inexistentes y auto-transferencias ANTES de
--     debitar: una dirección inválida nunca quema tokens del emisor.
--   * El débito es atómico: UPDATE ... WHERE balance_valens >= p_amount.
--     Si no afecta ninguna fila => saldo insuficiente (nunca saldo negativo).
--   * Acredita al receptor con UPSERT: crea la billetera si aún no existe.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.transfer_valens_tokens(
  p_sender_id        UUID,
  p_receiver_address TEXT,
  p_amount           INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id    UUID;
  v_tx_hash        TEXT;
  v_sender_updated INTEGER := 0;
BEGIN
  -- Validaciones
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El monto debe ser mayor a 0 VAL entero.');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: solo puedes transferir desde tu propia billetera.');
  END IF;

  IF p_receiver_address IS NULL OR btrim(p_receiver_address) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dirección no encontrada: la dirección de destino está vacía.');
  END IF;

  -- Receptor por la dirección persistente del perfil (S11)
  SELECT id INTO v_receiver_id
  FROM public.profiles
  WHERE wallet_address = btrim(p_receiver_address)
  LIMIT 1;

  -- Compatibilidad con billeteras que solo tienen public_address
  IF v_receiver_id IS NULL THEN
    SELECT user_id INTO v_receiver_id
    FROM public.wallets
    WHERE public_address = btrim(p_receiver_address)
    LIMIT 1;
  END IF;

  IF v_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dirección no encontrada en la red Valens.');
  END IF;

  IF v_receiver_id = p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes transferirte a tu propia dirección.');
  END IF;

  -- Generar hash de transacción único
  v_tx_hash := '0x' || encode(gen_random_bytes(16), 'hex');

  -- Débito atómico: la condición WHERE evita el doble gasto y los saldos
  -- negativos incluso con dos transferencias concurrentes.
  UPDATE public.wallets
  SET balance_valens = COALESCE(balance_valens, FLOOR(balance_val)) - p_amount,
      balance_val    = GREATEST(0, COALESCE(balance_val, 0) - p_amount),
      valens_balance = GREATEST(0, COALESCE(valens_balance, 0) - p_amount),
      updated_at     = NOW()
  WHERE user_id = p_sender_id
    AND COALESCE(balance_valens, FLOOR(balance_val)) >= p_amount;

  GET DIAGNOSTICS v_sender_updated = ROW_COUNT;

  IF v_sender_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo VAL insuficiente.');
  END IF;

  -- Crédito al receptor (crea la billetera si todavía no existe)
  INSERT INTO public.wallets (user_id, balance_valens, balance_val, valens_balance, updated_at)
  VALUES (v_receiver_id, p_amount, p_amount, p_amount, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET balance_valens = COALESCE(wallets.balance_valens, 0) + p_amount,
      balance_val    = COALESCE(wallets.balance_val, 0) + p_amount,
      valens_balance = COALESCE(wallets.valens_balance, 0) + p_amount,
      updated_at     = NOW();

  -- Registrar transacción
  INSERT INTO public.valens_transactions (
    from_user, to_user, sender_id, receiver_id,
    amount_val, amount_ars, type, description
  ) VALUES (
    p_sender_id, v_receiver_id, p_sender_id, v_receiver_id,
    p_amount, 0, 'direct_transfer',
    'Transferencia P2P ValensCoin: ' || p_amount || ' VAL → ' || btrim(p_receiver_address)
  );

  -- Reducir reserva del token_genesis
  UPDATE public.token_genesis
  SET reserve_balance = GREATEST(0, reserve_balance - p_amount)
  WHERE token_symbol = 'VAL';

  RETURN jsonb_build_object(
    'success', true,
    'tx_hash', v_tx_hash,
    'amount', p_amount,
    'receiver_address', btrim(p_receiver_address),
    'receiver_id', v_receiver_id,
    'message', 'Transferencia de ' || p_amount || ' VAL confirmada.'
  );
END;
$$;

-- ====================================================================
-- 21b. FUNCIÓN RPC: DIRECCIÓN VALENS PERSISTENTE (S11)
-- --------------------------------------------------------------------
-- Devuelve la dirección del usuario autenticado, creándola de forma
-- determinista a partir de su UUID si todavía no existe. Replica el valor
-- en public.wallets.public_address para que transfer_valens_tokens()
-- pueda resolver al receptor desde cualquiera de las dos tablas.
-- Si el perfil todavía no tenía dirección, esta función es la única que
-- la crea (el cliente nunca inventa direcciones ajenas).
-- ====================================================================
CREATE OR REPLACE FUNCTION public.ensure_wallet_address()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_address TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado: se requiere sesión para obtener la dirección Valens.';
  END IF;

  SELECT wallet_address INTO v_address
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario autenticado.';
  END IF;

  IF v_address IS NULL OR btrim(v_address) = '' THEN
    v_address := 'valens1q' || replace(v_uid::text, '-', '');
    UPDATE public.profiles
    SET wallet_address = v_address,
        updated_at     = NOW()
    WHERE id = v_uid
      AND (wallet_address IS NULL OR btrim(wallet_address) = '');
  END IF;

  SELECT wallet_address INTO v_address
  FROM public.profiles
  WHERE id = v_uid;

  UPDATE public.wallets
  SET public_address = v_address,
      updated_at     = NOW()
  WHERE user_id = v_uid
    AND (public_address IS NULL OR public_address <> v_address);

  RETURN v_address;
END;
$$;

-- ====================================================================
-- 22. FUNCIÓN RPC: GRIFO (FAUCET) — +5 VAL Atómico
-- ====================================================================
CREATE OR REPLACE FUNCTION public.claim_faucet_tokens(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_drip    INTEGER := 5;
  v_tx_hash TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: solo puedes reclamar para tu propia billetera.');
  END IF;

  v_tx_hash := '0xfa' || encode(gen_random_bytes(8), 'hex');

  -- Acreditar 5 VAL enteros al usuario
  INSERT INTO public.wallets (user_id, balance_valens, balance_val, valens_balance, updated_at)
  VALUES (p_user_id, v_drip, v_drip, v_drip, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET balance_valens = COALESCE(wallets.balance_valens, 0) + v_drip,
      balance_val    = COALESCE(wallets.balance_val, 0) + v_drip,
      valens_balance = COALESCE(wallets.valens_balance, 0) + v_drip,
      updated_at     = NOW();

  -- Registrar transacción de faucet
  INSERT INTO public.valens_transactions (
    from_user, to_user, receiver_id, amount_val, amount_ars, type, description
  ) VALUES (
    NULL, p_user_id, p_user_id, v_drip, 0, 'faucet',
    'Grifo ValensCoin Testnet: +' || v_drip || ' VAL'
  );

  -- Reducir reserva
  UPDATE public.token_genesis
  SET reserve_balance = GREATEST(0, reserve_balance - v_drip)
  WHERE token_symbol = 'VAL';

  RETURN jsonb_build_object(
    'success', true,
    'tx_hash', v_tx_hash,
    'amount', v_drip,
    'message', '+' || v_drip || ' VAL acreditados desde el Grifo Testnet.'
  );
END;
$$;

-- ====================================================================
-- 22b. FUNCIÓN RPC: RECOMPENSA ESCUELA CRIPTO — +5 VAL (S11)
-- --------------------------------------------------------------------
-- Acredita 5 VAL una única vez cuando el usuario autenticado aprueba el
-- cuestionario con ≥ 4/5 respuestas correctas.
--   * El control de doble reclamo es atómico:
--     INSERT ... ON CONFLICT (user_id) DO UPDATE ... WHERE reward_claimed = false.
--     Si no se reserva la fila, la recompensa ya había sido reclamada.
--   * El crédito de la billetera y el registro en valens_transactions
--     ocurren en la misma transacción que la reserva.
--   * type = 'faucet' se reutiliza a propósito para no alterar el CHECK
--     existente de valens_transactions; la descripción identifica la Escuela.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.claim_school_reward(p_quiz_score INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_reward  INT := 5;
  v_rows    INT := 0;
  v_tx_hash TEXT;
  v_already BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: se requiere sesión para reclamar la recompensa.');
  END IF;

  IF p_quiz_score IS NULL OR p_quiz_score < 0 OR p_quiz_score > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Puntaje inválido: debe estar entre 0 y 5.');
  END IF;

  IF p_quiz_score < 4 THEN
    RETURN jsonb_build_object(
      'success', false,
      'passed', false,
      'error', 'Necesitás al menos 4/5 respuestas correctas para aprobar la Escuela Cripto.'
    );
  END IF;

  -- Reserva idempotente de la recompensa (una sola vez por usuario).
  INSERT INTO public.crypto_school_progress AS csp (
    user_id, quiz_score, passed, reward_claimed, reward_amount, completed_at, updated_at
  )
  VALUES (
    v_uid, p_quiz_score, true, true, v_reward, NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET quiz_score     = GREATEST(csp.quiz_score, EXCLUDED.quiz_score),
      passed         = true,
      reward_claimed = true,
      completed_at   = COALESCE(csp.completed_at, NOW()),
      updated_at     = NOW()
  WHERE csp.reward_claimed = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT reward_claimed INTO v_already
    FROM public.crypto_school_progress
    WHERE user_id = v_uid;

    RETURN jsonb_build_object(
      'success', false,
      'already_claimed', COALESCE(v_already, true),
      'reward_amount', v_reward,
      'error', 'La recompensa de 5 VAL ya fue reclamada.'
    );
  END IF;

  v_tx_hash := '0xsc' || encode(gen_random_bytes(12), 'hex');

  -- Crédito de la recompensa (crea la billetera si aún no existe).
  INSERT INTO public.wallets (user_id, balance_valens, balance_val, valens_balance, updated_at)
  VALUES (v_uid, v_reward, v_reward, v_reward, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET balance_valens = COALESCE(wallets.balance_valens, 0) + v_reward,
      balance_val    = COALESCE(wallets.balance_val, 0) + v_reward,
      valens_balance = COALESCE(wallets.valens_balance, 0) + v_reward,
      updated_at     = NOW();

  INSERT INTO public.valens_transactions (
    from_user, to_user, receiver_id, amount_val, amount_ars, type, description
  ) VALUES (
    NULL, v_uid, v_uid, v_reward, 0, 'faucet',
    'Recompensa Escuela Cripto P2P: +' || v_reward || ' VAL (quiz ' || p_quiz_score || '/5)'
  );

  UPDATE public.token_genesis
  SET reserve_balance = GREATEST(0, reserve_balance - v_reward)
  WHERE token_symbol = 'VAL';

  RETURN jsonb_build_object(
    'success', true,
    'tx_hash', v_tx_hash,
    'amount', v_reward,
    'quiz_score', p_quiz_score,
    'message', 'Recompensa de ' || v_reward || ' VAL acreditada (quiz ' || p_quiz_score || '/5).'
  );
END;
$$;

-- ====================================================================
-- 23. FUNCIÓN RPC: BÚSQUEDA DE USUARIOS (requiere autenticación, sin emails)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.search_community_users(search_term TEXT)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  avatar_url TEXT,
  role TEXT,
  is_online BOOLEAN,
  coverage_zone TEXT,
  vehicle_type TEXT,
  payment_alias TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Exigir autenticación: sin usuario logueado, no hay resultados
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.username, p.avatar_url, p.role,
         p.is_online, p.coverage_zone, p.vehicle_type, p.payment_alias
  FROM public.profiles p
  WHERE btrim(search_term) <> ''
    AND (
      p.full_name ILIKE '%' || btrim(search_term) || '%'
      OR p.username ILIKE '%' || btrim(search_term) || '%'
      OR p.payment_alias ILIKE '%' || btrim(search_term) || '%'
    )
  LIMIT 50;
END;
$$;

-- ====================================================================
-- 24. PERMISOS (GRANTS) — evita 403 de PostgREST en instalaciones nuevas
-- --------------------------------------------------------------------
-- Sin estos GRANT, PostgREST responde 403 (42501 permission denied)
-- ANTES de evaluar la RLS: las políticas nunca llegan a aplicarse.
-- RLS sigue siendo la que filtra filas; los GRANT solo abren la puerta.
-- Idempotente. Solo permisos: no modifica datos ni estructura.
-- ====================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ---------- LECTURA (authenticated) ----------
GRANT SELECT ON
  public.profiles, public.profiles_public, public.orders, public.mandados,
  public.offers, public.bids, public.messages, public.reviews,
  public.user_blocks, public.user_reports, public.dex_orders,
  public.wallets, public.valens_transactions, public.transactions,
  public.deliveries, public.token_genesis, public.crypto_school_progress
TO authenticated;

-- ---------- ESCRITURA (authenticated) — la RLS decide qué filas ----------
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.orders TO authenticated;
GRANT INSERT, UPDATE ON public.offers TO authenticated;
GRANT INSERT ON public.bids TO authenticated;
GRANT INSERT ON public.messages TO authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT INSERT ON public.user_reports TO authenticated;
GRANT INSERT, UPDATE ON public.dex_orders TO authenticated;
GRANT INSERT ON public.wallets TO authenticated;
GRANT INSERT ON public.deliveries TO authenticated;

-- ---------- Secuencias (token_genesis.id es SERIAL) ----------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------- RPCs ----------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ---------- Visitantes (mapa público y tokenomics) ----------
GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT ON public.token_genesis TO anon;
