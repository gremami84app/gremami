import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../ui/Button';
import { ChevronDown, ChevronUp, Clock, KeyRound, Package, RefreshCw, Zap } from 'lucide-react';

/**
 * (S09.6b) Panel del cliente: pedidos urgentes y subastas programadas,
 * con las ofertas recibidas, aceptación en un toque y PIN de entrega.
 */
export default function ClientOrdersPanel() {
  const { isDark, currentUser, myOrders, refreshMyOrders, getOrderOffersReal, acceptOfferReal, getOrderPin, showToast } = useApp();

  const [expandedId, setExpandedId] = useState(null);
  const [offersByOrder, setOffersByOrder] = useState({});
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState(null);

  // (S09.6c) Copiar el PIN del pedido para compartirlo con el cadete
  const copyPin = async (orderId) => {
    const pin = getOrderPin(orderId);
    try {
      await navigator.clipboard.writeText(pin);
      showToast('📋 PIN copiado. Compartilo con tu cadete.', 'success');
    } catch (e) {
      showToast(`Tu PIN es ${pin}`, 'info');
    }
  };

  const uid = currentUser?.id;
  const clientOrders = (myOrders || []).filter((o) => o && o.client_id === uid);
  const activeOrders = clientOrders.filter((o) => !['completado', 'cancelled', 'cancelado'].includes(o.status));

  useEffect(() => {
    refreshMyOrders?.();
  }, [refreshMyOrders]);

  const loadOffers = useCallback(
    async (orderId) => {
      setLoadingOffers(true);
      try {
        const list = await getOrderOffersReal(orderId);
        setOffersByOrder((prev) => ({ ...prev, [orderId]: Array.isArray(list) ? list : [] }));
      } finally {
        setLoadingOffers(false);
      }
    },
    [getOrderOffersReal]
  );

  const toggle = async (order) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (!offersByOrder[order.id]) await loadOffers(order.id);
  };

  const accept = async (order, offer) => {
    setBusyOfferId(offer.id);
    try {
      const res = await acceptOfferReal(offer.id, order.id, offer.cadete_id, offer.proposed_price_ars);
      if (res?.success) {
        showToast('✅ Cadete asignado. Coordiná la entrega.', 'success');
        await loadOffers(order.id);
      } else {
        showToast('⚠️ No se pudo aceptar la oferta.', 'warning');
      }
    } finally {
      setBusyOfferId(null);
    }
  };

  const card = `rounded-2xl border p-3 transition-colors ${
    isDark ? 'bg-[#121B2D] border-[#1F2D48]' : 'bg-white border-slate-200 shadow-sm'
  }`;

  if (!uid) {
    return (
      <div className={`${card} text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
        Iniciá sesión para ver tus pedidos y las ofertas que recibís.
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          📦 Mis pedidos y subastas
        </h3>
        <button
          type="button"
          onClick={() => refreshMyOrders?.()}
          className={`min-h-touch min-w-touch flex items-center justify-center rounded-xl ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
          aria-label="Actualizar mis pedidos"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {activeOrders.length === 0 && (
        <div className={`${card} text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
          Todavía no tenés pedidos activos. Usá <strong>Pedir Ahora</strong> o <strong>Programar</strong>.
        </div>
      )}

      {activeOrders.map((order) => {
        const isScheduled = Boolean(order.scheduled_for);
        const isOpen = expandedId === order.id;
        const offers = offersByOrder[order.id] || [];
        const hasCadete = Boolean(order.cadete_id);

        return (
          <div key={order.id} className={card}>
            <button
              type="button"
              onClick={() => toggle(order)}
              className="w-full text-left"
              aria-expanded={isOpen}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {isScheduled ? <Clock className="inline w-3.5 h-3.5 text-accent" /> : <Zap className="inline w-3.5 h-3.5 text-accent" />}{' '}
                    {order.title || 'Pedido P2P'}
                  </p>
                  <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                    {order.origin_address} → {order.destination_address}
                  </p>
                  {isScheduled && (
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                      🗓 {new Date(order.scheduled_for).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className={`text-xs font-black text-accent`}>${Number(order.price_ars || 0).toLocaleString('es-AR')}</span>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {order.status === 'en_curso' ? 'En curso' : hasCadete ? 'Asignado' : 'Abierto'}
                  </span>
                  {isOpen ? <ChevronUp className="w-4 h-4 mt-1 text-slate-400" /> : <ChevronDown className="w-4 h-4 mt-1 text-slate-400" />}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className={`mt-2 pt-2 border-t space-y-2 ${isDark ? 'border-[#1F2D48]' : 'border-slate-200'}`}>
                {loadingOffers && !offersByOrder[order.id] && (
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cargando ofertas…</p>
                )}

                {offersByOrder[order.id] && offers.length === 0 && (
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Sin ofertas todavía. Los cadetes de Alta Gracia la están viendo.
                  </p>
                )}

                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 ${
                      isDark ? 'bg-[#0B132B]' : 'bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {offer.cadete?.full_name || 'Cadete'}
                        {offer.cadete?.vehicle_type ? ` · ${offer.cadete.vehicle_type}` : ''}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                        ${Number(offer.proposed_price_ars || 0).toLocaleString('es-AR')}
                        {offer.note ? ` · ${offer.note}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      className="text-xs px-3 flex-shrink-0"
                      disabled={busyOfferId === offer.id || offer.status === 'aceptada'}
                      onClick={() => accept(order, offer)}
                    >
                      {offer.status === 'aceptada' ? 'Aceptada' : 'Aceptar'}
                    </Button>
                  </div>
                ))}

                {(order.status === 'en_curso' || hasCadete) && (
                  <div className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 ${
                    isDark ? 'bg-[#0A2218] border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <p className={`text-xs ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                        PIN de entrega:{' '}
                        <strong className="font-mono tracking-widest text-sm">{getOrderPin(order.id)}</strong>
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="text-xs px-2.5 flex-shrink-0"
                      onClick={() => copyPin(order.id)}
                    >
                      Copiar
                    </Button>
                  </div>
                )}

                <p className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Package className="w-3.5 h-3.5" /> Categoría: {order.category}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
