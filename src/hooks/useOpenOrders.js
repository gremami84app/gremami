import { useCallback, useEffect, useRef, useState } from 'react';
import { orderService } from '../lib/supabaseClient';

/**
 * (S09.6a) Bolsa real de pedidos abiertos para cadetes.
 *
 * - Consulta `orderService.getOrders({ status: 'pendiente' })`
 * - Se suscribe a cambios en tiempo real (`subscribeToLiveOrders`)
 * - Fallback: polling cada `pollMs` (20 s por defecto) y refresco manual
 * - Si no hay Supabase configurado, `getOrders` devuelve el cache local (sandbox)
 */
export default function useOpenOrders({ enabled = true, pollMs = 20000 } = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      if (mountedRef.current) setLoading(false);
      return [];
    }
    try {
      const list = await orderService.getOrders({ status: 'pendiente' });
      if (mountedRef.current) {
        setOrders(Array.isArray(list) ? list : []);
        setError(null);
      }
      return Array.isArray(list) ? list : [];
    } catch (e) {
      if (mountedRef.current) setError(e);
      return [];
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }

    let cancelled = false;
    let unsubscribe = null;
    let timer = null;

    refresh();

    // Tiempo real (si el canal falla, el polling cubre el hueco)
    try {
      const sub = orderService.subscribeToLiveOrders(() => {
        if (!cancelled) refresh();
      });
      unsubscribe = typeof sub === 'function' ? sub : sub?.unsubscribe;
    } catch (e) {
      console.warn('[S09.6a] Realtime de órdenes no disponible, se usa polling:', e?.message || e);
    }

    timer = setInterval(() => {
      if (!cancelled) refresh();
    }, pollMs);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timer) clearInterval(timer);
      try { unsubscribe?.(); } catch (e) {}
    };
  }, [enabled, pollMs, refresh]);

  return { orders, loading, error, refresh };
}
