import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useOpenOrders from '../hooks/useOpenOrders';
import { Button } from '../ui/Button';
import { AlertTriangle, Bike, Car, CheckCircle2, Clock, Footprints, MapPin, RefreshCw, ShieldCheck, Store, Truck, Zap } from 'lucide-react';

/**
 * (S09.6b) Panel operativo del cadete:
 * disponibilidad, fianza mínima, bolsa de urgentes y subastas programadas,
 * filtro por vehículo y cotización real (offers).
 */

const CATEGORY_FILTERS = [
  { id: 'all', label: 'Todas', icon: Zap },
  { id: 'caminando', label: 'A pie', icon: Footprints },
  { id: 'bicicleta', label: 'Bici', icon: Bike },
  { id: 'motocicleta', label: 'Moto', icon: Bike },
  { id: 'automovil', label: 'Auto', icon: Car },
  { id: 'fletes', label: 'Flete', icon: Truck },
  { id: 'comercio', label: 'Comercio', icon: Store }
];

const FIANZA_MINIMA = 1;

export default function CadetePanel() {
  const { isDark, isOnline, toggleOnlineStatus, balance, submitOfferReal, showToast, currentUser } = useApp();
  const { orders, loading, refresh } = useOpenOrders({ enabled: true });

  const [tab, setTab] = useState('urgent'); // 'urgent' | 'scheduled'
  const [category, setCategory] = useState('all');
  const [quotingId, setQuotingId] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const hasFianza = Number(balance) >= FIANZA_MINIMA;

  const filtered = useMemo(() => {
    const base = (orders || []).filter((o) => {
      const isScheduled = Boolean(o.scheduled_for);
      if (tab === 'urgent' && isScheduled) return false;
      if (tab === 'scheduled' && !isScheduled) return false;
      if (category !== 'all' && o.category !== category) return false;
      return true;
    });
    return base.slice(0, 20);
  }, [orders, tab, category]);

  const openQuote = (order) => {
    if (!hasFianza) {
      showToast('Necesitás al menos 1 VAL de fianza para cotizar.', 'warning');
      return;
    }
    setQuotingId(order.id);
    setAmount(String(order.price_ars || 2000));
    setNote('');
  };

  const submitQuote = async (order) => {
    if (!currentUser?.id) {
      showToast('Iniciá sesión para cotizar.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await submitOfferReal({ orderId: order.id, amountArs: Number(amount), note });
      if (res?.success) {
        showToast('Oferta enviada al cliente.', 'success');
        setQuotingId(null);
      } else {
        showToast('No se pudo enviar la oferta.', 'warning');
      }
    } finally {
      setBusy(false);
    }
  };

  const card = `rounded-2xl border p-3 ${isDark ? 'bg-card border-line' : 'bg-card border-line shadow-elev1'}`;

  return (
    <section className="space-y-2">
      {/* Estado operativo */}
      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <div className="min-w-0">
              <p className={`text-xs font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isOnline ? 'En línea en el radar' : 'Fuera de línea'}
              </p>
              <p className={`text-xs ${isDark ? 'text-ink3' : 'text-slate-500'}`}>
                {isOnline ? 'Recibís pedidos de Alta Gracia' : 'Pausado: no aparecés en el mapa'}
              </p>
            </div>
          </div>
          <Button
            variant={isOnline ? 'secondary' : 'primary'}
            className="text-xs px-3 flex-shrink-0"
            onClick={() => toggleOnlineStatus?.()}
          >
            {isOnline ? 'Pausar' : 'En línea'}
          </Button>
        </div>

        <div className={`mt-2 flex items-center justify-between rounded-xl px-2.5 py-2 ${
          hasFianza
            ? isDark ? 'bg-[#0A2218] border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'
            : isDark ? 'bg-[#2D0A11] border border-rose-500/40' : 'bg-rose-50 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {hasFianza ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <p className={`text-xs ${hasFianza ? (isDark ? 'text-emerald-300' : 'text-emerald-800') : isDark ? 'text-rose-300' : 'text-rose-700'}`}>
              {hasFianza
                ? `Fianza operativa: ${Number(balance).toFixed(2)} VAL (mínimo ${FIANZA_MINIMA} VAL)`
                : `Fianza insuficiente: ${Number(balance).toFixed(2)} VAL. Necesitás ${FIANZA_MINIMA} VAL para cotizar.`}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="Bolsa de pedidos">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'urgent'}
          onClick={() => setTab('urgent')}
          className={`min-h-touch rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
            tab === 'urgent'
              ? 'bg-accent text-slate-950 border-transparent'
              : isDark ? 'bg-card border-line text-slate-300' : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <Zap className="w-4 h-4" /> Urgentes Ahora
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'scheduled'}
          onClick={() => setTab('scheduled')}
          className={`min-h-touch rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
            tab === 'scheduled'
              ? 'bg-accent text-slate-950 border-transparent'
              : isDark ? 'bg-card border-line text-slate-300' : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" /> Subastas
        </button>
      </div>

      {/* Filtro por vehículo */}
      <div className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory scroll-px-2 pb-1" role="group" aria-label="Filtro por vehículo">
        {CATEGORY_FILTERS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategory(f.id)}
              aria-pressed={category === f.id}
              className={`snap-start shrink-0 min-h-touch px-3 rounded-xl text-xs font-semibold border flex items-center gap-1 transition-all ${
                category === f.id
                  ? 'bg-accent text-slate-950 border-transparent'
                  : isDark ? 'bg-card border-line text-slate-300' : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {f.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="flex items-center justify-between px-1">
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {loading ? 'Buscando pedidos…' : `${filtered.length} pedido${filtered.length === 1 ? '' : 's'} disponibles`}
        </p>
        <button
          type="button"
          onClick={refresh}
          className={`min-h-touch min-w-touch flex items-center justify-center rounded-xl ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
          aria-label="Actualizar pedidos"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {!loading && filtered.length === 0 && (
        <div className={`${card} text-xs ${isDark ? 'text-ink3' : 'text-slate-500'}`}>
          No hay {tab === 'urgent' ? 'pedidos urgentes' : 'subastas programadas'} para este filtro.
        </div>
      )}

      {filtered.map((order) => (
        <div key={order.id} className={card}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {order.title || 'Pedido P2P'}
              </p>
              <p className={`text-xs truncate mt-0.5 flex items-center gap-1 ${isDark ? 'text-ink3' : 'text-slate-500'}`}>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {order.origin_address} → {order.destination_address}
              </p>
              {order.scheduled_for && (
                <p className={`text-xs mt-0.5 ${isDark ? 'text-ink3' : 'text-slate-500'}`}>
                  🗓 {new Date(order.scheduled_for).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <span className="text-xs font-black text-accent flex-shrink-0">
              ${Number(order.price_ars || 0).toLocaleString('es-AR')}
            </span>
          </div>

          {quotingId === order.id ? (
            <div className="mt-2 space-y-1.5">
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Monto de tu oferta en ARS"
                className={`w-full min-h-touch rounded-xl px-3 text-sm ${
                  isDark ? 'bg-[#070C1E] border border-[#1F2D48] text-white' : 'bg-white border border-slate-300 text-slate-900'
                } focus:outline-none focus:border-accent`}
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota opcional (ej. llego en 15 min)"
                aria-label="Nota para el cliente"
                className={`w-full min-h-touch rounded-xl px-3 text-xs ${
                  isDark ? 'bg-[#070C1E] border border-[#1F2D48] text-white' : 'bg-white border border-slate-300 text-slate-900'
                } focus:outline-none focus:border-accent`}
              />
              <div className="flex gap-1.5">
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => setQuotingId(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 text-xs"
                  disabled={busy || !hasFianza}
                  onClick={() => submitQuote(order)}
                >
                  Enviar oferta
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-full text-xs mt-2"
              disabled={!hasFianza}
              onClick={() => openQuote(order)}
            >
              Cotizar / Postularse
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
