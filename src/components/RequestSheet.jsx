import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Sheet from '../ui/Sheet';
import { Button } from '../ui/Button';
import { ArrowLeft, ArrowRight, Bike, Car, Check, Clock, Footprints, MapPin, Sparkles, Store, Truck, Zap } from 'lucide-react';

/**
 * (S09.4) Flujo guiado "Pedir un envío" en 3 pasos.
 * (S09.6b) Dos modalidades: ⚡ Pedir Ahora (urgente) y 🗓 Programar (subasta abierta).
 * No emite toast propio: el contexto ya notifica el resultado real.
 */

const VEHICLES = [
  { id: 'caminando', label: 'A pie', Icon: Footprints },
  { id: 'bicicleta', label: 'Bicicleta', Icon: Bike },
  { id: 'motocicleta', label: 'Moto', Icon: Bike },
  { id: 'automovil', label: 'Auto', Icon: Car },
  { id: 'fletes', label: 'Flete', Icon: Truck },
  { id: 'comercio', label: 'Comercio', Icon: Store }
];

const QUICK_PLACES = [
  'Plaza Solares',
  'El Tajamar',
  'B° Cámara',
  'B° Belgrano',
  'Terminal de Ómnibus',
  'Hospital Illia'
];

const PRESET_PRICES = [1500, 2000, 2500, 3000];

const STEPS = ['Qué enviás', 'Origen y destino', 'Precio'];

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildScheduledISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const iso = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function formatScheduled(dateStr, timeStr) {
  if (!dateStr || !timeStr) return '';
  try {
    return new Date(`${dateStr}T${timeStr}:00`).toLocaleString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return `${dateStr} ${timeStr}`;
  }
}

// (S12c) Autocompletado local: Photon sin API key, sesgado a Alta Gracia.
const PHOTON_BIAS = 'lat=-31.658&lon=-64.428';
const PHOTON_BBOX = '-64.50,-31.72,-64.36,-31.58';

function formatPlace(p) {
  return [p.name, p.street, p.housenumber, p.district, p.city]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
}

function AddressField({ id, label, value, onChange, onPick, placeholder }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) { setItems([]); setOpen(false); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // (S12d) Photon devuelve 400 (verificado 2026-11): migrado a Nominatim,
        // que responde 200 con resultados reales de Alta Gracia y no pide API key.
        const url =
          'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1' +
          '&limit=6&countrycodes=ar&viewbox=-64.50,-31.58,-64.36,-31.72&bounded=1' +
          `&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const list = (Array.isArray(data) ? data : [])
          .map((x) => ({
            label: String(x.display_name || '').split(',').slice(0, 3).join(',').trim(),
            lat: Number(x.lat),
            lng: Number(x.lon)
          }))
          .filter(
            (r) =>
              r.label &&
              Number.isFinite(r.lat) &&
              Number.isFinite(r.lng) &&
              r.lat >= -31.72 && r.lat <= -31.58 &&
              r.lng >= -64.50 && r.lng <= -64.36
          )
          .slice(0, 5);
        setItems(list);
        setOpen(list.length > 0);
        setActive(-1);
      } catch (err) {
        // Fallback silencioso: el usuario sigue escribiendo texto libre.
        if (err.name !== 'AbortError') { setItems([]); setOpen(false); }
      }
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [value]);

  const pick = (r) => {
    onChange(r.label);
    onPick({ lat: r.lat, lng: r.lng });
    setOpen(false);
  };

  const handleKeys = (e) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-bold text-ink3 mb-1.5">{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={handleKeys}
        placeholder={placeholder}
        className="w-full min-h-touch rounded-control px-3 bg-app border border-line text-sm text-ink1 placeholder:text-ink3 focus:outline-none focus:border-accent"
      />
      {open && items.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-control border border-line bg-card shadow-elev2 max-h-56 overflow-y-auto"
        >
          {items.map((r, i) => (
            <li key={`${r.label}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                className={`w-full text-left px-3 py-2.5 min-h-touch text-xs ${i === active ? 'bg-elev text-ink1' : 'text-ink2'}`}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RequestSheet({ open, onClose, initialMode = 'urgent' }) {
  const { createServiceRequest, createAuctionRequest } = useApp();

  const [mode, setMode] = useState(initialMode); // 'urgent' | 'scheduled'
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('bicicleta');
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [priceArs, setPriceArs] = useState(2000);
  // (S12c) Coordenadas elegidas en el autocompletado (listas para el pedido)
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [scheduledDate, setScheduledDate] = useState(todayISO());
  const [scheduledTime, setScheduledTime] = useState('18:00');

  const isScheduled = mode === 'scheduled';

  // (S09.6b) Si el sheet se abre desde "Programar" o "Pedir Ahora", respeta la modalidad elegida.
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const reset = () => {
    setStep(1);
    setMode(initialMode);
    setCategory('bicicleta');
    setDescription('');
    setOrigin('');
    setDestination('');
    setPriceArs(2000);
    setScheduledDate(todayISO());
    setScheduledTime('18:00');
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const scheduledISO = isScheduled ? buildScheduledISO(scheduledDate, scheduledTime) : null;
  const scheduleValid = !isScheduled || Boolean(scheduledISO);

  const canContinue =
    (step === 1 && description.trim().length >= 3) ||
    (step === 2 && origin.trim().length >= 2 && destination.trim().length >= 2) ||
    (step === 3 && Number(priceArs) > 0 && scheduleValid);

  const confirm = () => {
    const payload = {
      category,
      description: description.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      priceArs: Number(priceArs) || 2500
    };

    if (isScheduled) {
      createAuctionRequest({
        ...payload,
        scheduledTime: formatScheduled(scheduledDate, scheduledTime),
        scheduledFor: scheduledISO,
        estimatedFeeArs: Number(priceArs) || 2500
      });
    } else {
      createServiceRequest({ ...payload, isUrgent: true, scheduledFor: null });
    }

    close();
  };

  const footer = (
    <div className="flex gap-2">
      {step > 1 ? (
        <Button variant="secondary" className="flex-1" onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
      ) : (
        <Button variant="secondary" className="flex-1" onClick={close}>
          Cancelar
        </Button>
      )}

      {step < 3 ? (
        <Button variant="primary" className="flex-1" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
          Continuar
          <ArrowRight className="w-4 h-4" />
        </Button>
      ) : (
        <Button variant="primary" className="flex-1" disabled={!canContinue} onClick={confirm}>
          <Check className="w-4 h-4" />
          {isScheduled ? 'Publicar subasta' : 'Confirmar pedido'}
        </Button>
      )}
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      title={isScheduled ? 'Programar un envío' : 'Pedir un envío'}
      subtitle={`Paso ${step} de 3 · ${STEPS[step - 1]}`}
      footer={footer}
    >
      {/* (S09.6b) Modalidad: urgente vs programado */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-1.5 mb-3" role="tablist" aria-label="Modalidad del envío">
          <button
            type="button"
            role="tab"
            aria-selected={!isScheduled}
            onClick={() => setMode('urgent')}
            className={`min-h-touch rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              !isScheduled
                ? 'bg-accent text-slate-950 border-transparent'
                : 'bg-[#121B2D] border-[#1F2D48] text-slate-300 hover:border-accent/60'
            }`}
          >
            <Zap className="w-4 h-4" aria-hidden="true" />
            Pedir Ahora
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isScheduled}
            onClick={() => setMode('scheduled')}
            className={`min-h-touch rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              isScheduled
                ? 'bg-accent text-slate-950 border-transparent'
                : 'bg-[#121B2D] border-[#1F2D48] text-slate-300 hover:border-accent/60'
            }`}
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            Programar
          </button>
        </div>
      )}

      {/* Progreso */}
      <div className="flex items-center gap-1.5 mb-3" aria-hidden="true">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? 'bg-accent' : 'bg-[#1F2D48]'
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#8C9BB4] mb-1.5">¿Qué vehículo necesitás?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {VEHICLES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setCategory(v.id)}
                  aria-pressed={category === v.id}
                  className={`min-h-touch rounded-control text-xs font-semibold border transition-all duration-[120ms] active:scale-[0.98] flex flex-col items-center justify-center gap-0.5 ${
                    category === v.id
                      ? 'bg-accent text-slate-950 border-transparent font-bold'
                      : 'bg-card border-line text-ink2 hover:border-accent/60'
                  }`}
                >
                  <v.Icon className="w-4 h-4" aria-hidden="true" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="req-desc" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
              ¿Qué necesitás enviar o retirar?
            </label>
            <input
              id="req-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Retirar recetas en la farmacia de Av. Belgrano"
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <AddressField
            id="req-origin"
            label="Retiro en"
            value={origin}
            onChange={setOrigin}
            onPick={setOriginCoords}
            placeholder="Calle y altura, Alta Gracia"
          />
          <AddressField
            id="req-dest"
            label="Entrega en"
            value={destination}
            onChange={setDestination}
            onPick={setDestCoords}
            placeholder="Calle y altura, Alta Gracia"
          />

          <div>
            <p className="text-xs font-bold text-ink3 mb-1.5">Atajos de Alta Gracia</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PLACES.map((place) => (
                <button
                  key={place}
                  type="button"
                  onClick={() => (origin.trim() ? setDestination(place) : setOrigin(place))}
                  className="min-h-touch px-3 rounded-control text-xs font-semibold bg-card border border-line text-ink2 hover:border-accent/60 active:scale-95 transition-all flex items-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-accent" />
                  {place}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {isScheduled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="req-date" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
                  Fecha
                </label>
                <input
                  id="req-date"
                  type="date"
                  min={todayISO()}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="req-time" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
                  Hora
                </label>
                <input
                  id="req-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="req-price" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
              {isScheduled ? 'Precio base sugerido para subasta (ARS)' : 'Precio sugerido en ARS'}
            </label>
            <input
              id="req-price"
              type="number"
              inputMode="numeric"
              min={500}
              step={100}
              value={priceArs}
              onChange={(e) => setPriceArs(e.target.value.replace(/^0+(?=\d)/, ''))}
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-lg font-black text-white focus:outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_PRICES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPriceArs(preset)}
                  className={`min-h-touch px-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    Number(priceArs) === preset
                      ? 'bg-accent text-slate-950 border-transparent'
                      : 'bg-[#121B2D] border-[#1F2D48] text-slate-300 hover:border-accent/60'
                  }`}
                >
                  ${preset.toLocaleString('es-AR')}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#121B2D] border border-[#1F2D48] p-3 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C9BB4]">Resumen</p>
            <p className="text-xs text-white">
              <span className="text-[#8C9BB4]">Modalidad:</span>{' '}
              {isScheduled ? '🗓 Programado (subasta abierta)' : '⚡ Ahora (urgente)'}
            </p>
            {isScheduled && (
              <p className="text-xs text-white">
                <span className="text-[#8C9BB4]">Cuándo:</span> {formatScheduled(scheduledDate, scheduledTime) || '—'}
              </p>
            )}
            <p className="text-xs text-white">
              <span className="text-[#8C9BB4]">Vehículo:</span>{' '}
              {VEHICLES.find((v) => v.id === category)?.label || category}
            </p>
            <p className="text-xs text-white">
              <span className="text-[#8C9BB4]">Qué:</span> {description || '—'}
            </p>
            <p className="text-xs text-white">
              <span className="text-[#8C9BB4]">Ruta:</span> {origin || '—'} → {destination || '—'}
            </p>
            <p className="text-xs text-white">
              <span className="text-[#8C9BB4]">{isScheduled ? 'Base:' : 'Precio:'}</span> $
              {Number(priceArs || 0).toLocaleString('es-AR')} ARS
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-[#0A2218] border border-emerald-500/30 p-3">
            <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-emerald-300">
              {isScheduled
                ? 'Los cadetes de Alta Gracia verán tu subasta y te enviarán ofertas. Elegís la que más te convenga.'
                : 'Se suma 1 VAL de agradecimiento al cadete cuando confirmes la entrega con el PIN.'}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
