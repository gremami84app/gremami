import { supabase, isSupabaseConfigured } from './supabaseClient';

// --------------------------------------------------------------------
// Utilidades de identidad (S07): las tablas Postgres usan columnas UUID.
// Enviar IDs tipo "ord-123" o "current-cadet-satoshidev" hace fallar el
// insert (22P02 / FK). Estos helpers garantizan UUIDs reales.
// --------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value.trim());

export const newUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Categorías aceptadas por el CHECK de public.orders.category
const ALLOWED_ORDER_CATEGORIES = [
  'caminando', 'bicicleta', 'moto', 'motocicleta', 'auto', 'automovil', 'flete', 'fletes'
];

export const normalizeOrderCategory = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  const map = {
    negocios: 'moto', negocio: 'moto', comercio: 'moto', comercios: 'moto',
    caminando: 'caminando', pie: 'caminando',
    bicicleta: 'bicicleta', bici: 'bicicleta',
    moto: 'moto', motocicleta: 'motocicleta', moto_taxi: 'motocicleta',
    auto: 'auto', automovil: 'automovil', 'automóvil': 'automovil', coche: 'auto',
    flete: 'flete', fletes: 'fletes', camion: 'flete'
  };
  const mapped = map[value] || value;
  return ALLOWED_ORDER_CATEGORIES.includes(mapped) ? mapped : 'moto';
};

/**
 * Guarda o actualiza una cotización en la tabla 'bids' de Supabase
 * Campos requeridos por especificación: order_id, cadet_id, amount_ars, note, created_at
 */
export const saveBidToSupabase = async ({ order_id, cadet_id, amount_ars, note }) => {
  const newBid = {
    order_id,
    cadet_id: cadet_id || 'current-cadet-satoshidev',
    amount_ars: Number(amount_ars),
    note: String(note || '').trim(),
    created_at: new Date().toISOString()
  };

  // 1. Respaldo y sincronización en almacenamiento local reactivo
  try {
    const cachedBids = JSON.parse(localStorage.getItem('gremami_supabase_bids') || '[]');
    const existingIndex = cachedBids.findIndex(
      (b) => b.order_id === order_id && b.cadet_id === newBid.cadet_id
    );
    if (existingIndex >= 0) {
      cachedBids[existingIndex] = { ...cachedBids[existingIndex], ...newBid };
    } else {
      cachedBids.push(newBid);
    }
    localStorage.setItem('gremami_supabase_bids', JSON.stringify(cachedBids));
  } catch (err) {
    console.warn('Aviso de almacenamiento local para bids:', err);
  }

  // 2. Persistencia en la tabla remota 'bids' de Supabase
  //    (S07) Solo se intenta si order_id y cadet_id son UUID reales: ambos son FK
  //    (orders.id / profiles.id). Con IDs locales se mantiene el respaldo local.
  if (isSupabaseConfigured && isUuid(newBid.order_id) && isUuid(newBid.cadet_id)) {
    try {
      const { data, error } = await supabase
        .from('bids')
        .insert([newBid]);

      if (error) {
        console.warn('Aviso al insertar en tabla bids de Supabase:', error.message);
      }
      return { success: !error, bid: newBid, remote: !error, error };
    } catch (e) {
      console.warn('Excepción de red al enviar bid a Supabase:', e);
      return { success: true, bid: newBid, remote: false };
    }
  }

  return { success: true, bid: newBid, remote: false };
};

/**
 * Obtiene todas las cotizaciones de una orden desde Supabase (con fallback a cache local)
 */
export const getBidsForOrder = async (order_id) => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('bids')
        .select('*')
        .eq('order_id', order_id);

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Aviso al leer bids de Supabase:', e);
    }
  }

  try {
    const cachedBids = JSON.parse(localStorage.getItem('gremami_supabase_bids') || '[]');
    return cachedBids.filter((b) => b.order_id === order_id);
  } catch (e) {
    return [];
  }
};

/**
 * Registra una transacción fiduciaria y de token por entrega verificada con PIN en Supabase
 * Tabla 'deliveries': delivery_id, order_id, cadet_id, client_name, amount_ars, amount_val, pin, created_at
 */
export const recordDeliveryTransactionInSupabase = async ({
  delivery_id,
  order_id,
  cadet_id,
  client_name,
  amount_ars,
  amount_val,
  pin,
  created_at
}) => {
  const deliveryRecord = {
    // (S07) public.deliveries NO tiene columna delivery_id: la PK es 'id'.
    id: isUuid(delivery_id) ? delivery_id.trim() : newUuid(),
    order_id: order_id || null,
    cadet_id: cadet_id || null,
    client_name: client_name || 'Cliente Alta Gracia',
    amount_ars: Number(amount_ars || 2000),
    amount_val: Number(amount_val || 1.0),
    pin: String(pin || '4821'),
    created_at: created_at || new Date().toISOString()
  };

  // 1. Respaldo y sincronización en almacenamiento local reactivo
  try {
    const cached = JSON.parse(localStorage.getItem('gremami_supabase_deliveries') || '[]');
    cached.unshift(deliveryRecord);
    localStorage.setItem('gremami_supabase_deliveries', JSON.stringify(cached.slice(0, 50)));
  } catch (err) {
    console.warn('Aviso de almacenamiento local para deliveries:', err);
  }

  // 2. Persistencia remota en la tabla 'deliveries' de Supabase
  //    (S07) Requiere UUIDs válidos: deliveries.order_id tiene FK a orders.id y
  //    deliveries.cadet_id FK a profiles.id. Con IDs locales no se toca la red.
  if (!isUuid(deliveryRecord.order_id) || !isUuid(deliveryRecord.cadet_id)) {
    return { success: true, delivery: deliveryRecord, remote: false, reason: 'invalid-uuid' };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .insert([deliveryRecord]);

      if (error) {
        console.warn('Aviso al insertar en tabla deliveries de Supabase:', error.message);
      }
      return { success: !error, delivery: deliveryRecord, remote: !error, error };
    } catch (e) {
      console.warn('Excepción de red al enviar delivery a Supabase:', e);
      return { success: true, delivery: deliveryRecord, remote: false };
    }
  }

  return { success: true, delivery: deliveryRecord, remote: false };
};

/**
 * (S07) Inserta una orden en public.orders con IDs UUID reales.
 * Mapea la categoría al CHECK de la tabla y valida las FK antes de tocar la red.
 */
export const saveOrderToSupabase = async ({
  id,
  client_id = null,
  cadete_id = null,
  title = 'Mandado Gremami P2P',
  description = 'Mandado / entrega rápida en Alta Gracia',
  category = 'moto',
  status = 'pendiente',
  origin_address = 'Centro de Alta Gracia (Tajamar / Belgrano)',
  destination_address = 'Bv. Pellegrini / Plaza Solares',
  origin_lat = -31.6529,
  origin_lng = -64.4283,
  price_ars = 2500,
  reward_val = 1.0,
  delivery_pin,
  whatsapp_shared = false
} = {}) => {
  const orderId = isUuid(id) ? id.trim() : newUuid();
  const priceArs = Number(price_ars) || 2500;
  const rewardVal = Number(reward_val) || 1.0;

  const orderRecord = {
    id: orderId,
    client_id: client_id || null,
    cadete_id: cadete_id || null,
    assigned_cadet_id: cadete_id || null,
    title: String(title || 'Mandado Gremami P2P').slice(0, 120),
    description: String(description || 'Mandado / entrega rápida en Alta Gracia'),
    category: normalizeOrderCategory(category),
    status: status || 'pendiente',
    origin_address: origin_address || 'Centro de Alta Gracia (Tajamar / Belgrano)',
    destination_address: destination_address || 'Bv. Pellegrini / Plaza Solares',
    origin_lat: Number(origin_lat) || -31.6529,
    origin_lng: Number(origin_lng) || -64.4283,
    price_ars: priceArs,
    base_price_ars: priceArs,
    reward_val: rewardVal,
    val_incentive: rewardVal,
    delivery_pin: String(delivery_pin || Math.floor(1000 + Math.random() * 9000)),
    pin_attempts: 0,
    whatsapp_shared: Boolean(whatsapp_shared),
    created_at: new Date().toISOString()
  };

  // Respaldo local (mismo patrón que el resto de la capa)
  try {
    const cached = JSON.parse(localStorage.getItem('gremami_supabase_orders') || '[]');
    cached.unshift(orderRecord);
    localStorage.setItem('gremami_supabase_orders', JSON.stringify(cached.slice(0, 100)));
  } catch (e) {}

  if (!isSupabaseConfigured) {
    return { success: true, order: orderRecord, remote: false, reason: 'offline' };
  }

  // Las FK de orders apuntan a profiles.id: si vienen IDs locales, no se envía nada.
  if (client_id && !isUuid(client_id)) {
    return { success: true, order: orderRecord, remote: false, reason: 'invalid-client-id' };
  }
  if (cadete_id && !isUuid(cadete_id)) {
    return { success: true, order: orderRecord, remote: false, reason: 'invalid-cadet-id' };
  }

  try {
    const { error } = await supabase
      .from('orders')
      .insert([orderRecord]);

    if (error) {
      // 23505 = unique_violation: la orden ya existe (reintento). No es fatal.
      if (error.code === '23505') {
        return { success: true, order: orderRecord, remote: true, reason: 'already-exists' };
      }
      console.warn('Aviso al insertar orden en Supabase:', error.message);
    }
    return { success: !error, order: orderRecord, remote: !error, error };
  } catch (e) {
    console.warn('Excepción de red al insertar orden en Supabase:', e);
    return { success: true, order: orderRecord, remote: false };
  }
};

/**
 * (S07) Persiste primero la orden y luego la entrega, respetando la FK
 * deliveries.order_id -> orders.id. Devuelve el detalle de cada paso.
 */
export const persistDeliveryWithOrder = async ({ order, delivery } = {}) => {
  const orderResult = await saveOrderToSupabase(order);

  if (!orderResult.remote && orderResult.reason !== 'already-exists') {
    return { success: false, remote: false, step: 'order', order: orderResult, delivery: null };
  }

  const deliveryResult = await recordDeliveryTransactionInSupabase({
    ...delivery,
    order_id: orderResult.order.id
  });

  return {
    success: Boolean(deliveryResult.remote),
    remote: Boolean(deliveryResult.remote),
    step: 'delivery',
    order: orderResult,
    delivery: deliveryResult
  };
};

/**
 * Obtiene el historial de entregas registradas desde Supabase (con fallback local)
 */
export const getDeliveriesFromSupabase = async (cadet_id) => {
  // (S07) Solo se consulta la red si el cadet_id es un UUID real.
  if (isSupabaseConfigured && (!cadet_id || isUuid(cadet_id))) {
    try {
      let query = supabase.from('deliveries').select('*').order('created_at', { ascending: false });
      if (cadet_id) {
        query = query.eq('cadet_id', cadet_id);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Aviso al consultar deliveries de Supabase:', e);
    }
  }

  try {
    const cached = JSON.parse(localStorage.getItem('gremami_supabase_deliveries') || '[]');
    if (cadet_id) {
      return cached.filter((d) => d.cadet_id === cadet_id);
    }
    return cached;
  } catch (e) {
    return [];
  }
};

/**
 * Guarda o actualiza la configuración de cobro FIAT ($ ARS) en la tabla 'profiles' de Supabase
 * Campos requeridos por especificación: fiat_provider, fiat_alias, fiat_cbu_cvu
 */
export const saveFiatPaymentConfigToSupabase = async ({
  cadet_id = 'current-cadet-satoshidev',
  fiat_provider = 'Mercado Pago',
  fiat_alias = 'cadete.gremami.mp',
  fiat_cbu_cvu = '',
  fiat_holder_name = '',
  fiat_cuit = ''
}) => {
  const profileRecord = {
    id: cadet_id,
    fiat_provider: String(fiat_provider || 'Mercado Pago'),
    fiat_alias: String(fiat_alias || 'cadete.gremami.mp').trim(),
    fiat_cbu_cvu: String(fiat_cbu_cvu || '').trim(),
    fiat_holder_name: String(fiat_holder_name || '').trim(),
    fiat_cuit: String(fiat_cuit || '').trim(),
    updated_at: new Date().toISOString()
  };

  // 1. Respaldo local reactivo e indetectable
  try {
    const cachedProfiles = JSON.parse(localStorage.getItem('gremami_supabase_profiles') || '{}');
    cachedProfiles[cadet_id] = { ...(cachedProfiles[cadet_id] || {}), ...profileRecord };
    localStorage.setItem('gremami_supabase_profiles', JSON.stringify(cachedProfiles));
  } catch (err) {
    console.warn('Aviso de almacenamiento local para profiles FIAT:', err);
  }

  // 2. Persistencia en la tabla 'profiles' de Supabase
  //    (S07) profiles.id es UUID: con un id local no se intenta el upsert.
  if (isSupabaseConfigured && isUuid(profileRecord.id)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert([
          {
            id: cadet_id,
            fiat_provider: profileRecord.fiat_provider,
            fiat_alias: profileRecord.fiat_alias,
            fiat_cbu_cvu: profileRecord.fiat_cbu_cvu,
            updated_at: profileRecord.updated_at
          }
        ]);

      if (error) {
        console.warn('Aviso al guardar perfil en Supabase (profiles):', error.message);
      }
      return { success: !error, profile: profileRecord, remote: !error, error };
    } catch (e) {
      console.warn('Excepción de red al enviar perfil a Supabase:', e);
      return { success: true, profile: profileRecord, remote: false };
    }
  }

  return { success: true, profile: profileRecord, remote: false };
};

/**
 * Obtiene la configuración de cobro FIAT desde Supabase (con fallback local)
 */
export const getFiatPaymentConfigFromSupabase = async (cadet_id = 'current-cadet-satoshidev') => {
  // (S07) profiles.id es UUID: sin un id válido se responde desde el cache local.
  if (isSupabaseConfigured && isUuid(cadet_id)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, fiat_provider, fiat_alias, fiat_cbu_cvu')
        .eq('id', cadet_id)
        .single();

      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn('Aviso al consultar profiles en Supabase:', e);
    }
  }

  try {
    const cachedProfiles = JSON.parse(localStorage.getItem('gremami_supabase_profiles') || '{}');
    return cachedProfiles[cadet_id] || null;
  } catch (e) {
    return null;
  }
};

/**
 * Ejecuta el procedimiento almacenado (RPC) release_reward_by_pin en Supabase
 * Realiza la liquidación atómica de orden, fianza VAL y recaudación ARS
 */
export const releaseRewardByPin = async ({ order_id, pin, cadet_id = 'current-cadet-satoshidev' }) => {
  // (S07) La RPC espera UUIDs: orders.id y profiles.id. Con IDs locales se usa el
  // fallback simulado de abajo.
  if (isSupabaseConfigured && isUuid(order_id) && isUuid(cadet_id)) {
    try {
      const { data, error } = await supabase.rpc('release_reward_by_pin', {
        p_order_id: order_id,
        p_pin: String(pin).trim(),
        p_cadet_id: cadet_id
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        console.warn('Aviso RPC release_reward_by_pin en Supabase:', error.message);
      }
    } catch (e) {
      console.warn('Excepción ejecutando RPC en Supabase:', e);
    }
  }

  return {
    success: true,
    order_id,
    cadet_id,
    amount_ars: 2500,
    amount_val: 1.0,
    message: 'Entrega verificada con PIN local (Modo Offline/Simulado)'
  };
};

export { default as supabaseClient } from './supabaseClient';
export * from './supabaseClient';

