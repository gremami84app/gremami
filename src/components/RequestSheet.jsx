import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import Sheet from '../ui/Sheet';
import { Button } from '../ui/Button';
import { ArrowLeft, ArrowRight, Check, MapPin, Sparkles } from 'lucide-react';

/**
 * (S09.4) Flujo guiado "Pedir un envío" en 3 pasos.
 * No emite toast propio: createServiceRequest ya notifica el resultado real.
 */

const VEHICLES = [
  { id: 'caminando', label: 'A pie', emoji: '🚶' },
  { id: 'bicicleta', label: 'Bicicleta', emoji: '🚲' },
  { id: 'motocicleta', label: 'Moto', emoji: '🏍️' },
  { id: 'automovil', label: 'Auto', emoji: '🚗' },
  { id: 'fletes', label: 'Flete', emoji: '🚚' },
  { id: 'comercio', label: 'Comercio', emoji: '🏪' }
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

export default function RequestSheet({ open, onClose }) {
  const { createServiceRequest } = useApp();

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('bicicleta');
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [priceArs, setPriceArs] = useState(2000);

  const reset = () => {
    setStep(1);
    setCategory('bicicleta');
    setDescription('');
    setOrigin('');
    setDestination('');
    setPriceArs(2000);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const canContinue =
    (step === 1 && description.trim().length >= 3) ||
    (step === 2 && origin.trim().length >= 2 && destination.trim().length >= 2) ||
    (step === 3 && Number(priceArs) > 0);

  const confirm = () => {
    createServiceRequest({
      category,
      description: description.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      priceArs: Number(priceArs) || 2500
    });
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
          Confirmar pedido
        </Button>
      )}
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Pedir un envío"
      subtitle={`Paso ${step} de 3 · ${STEPS[step - 1]}`}
      footer={footer}
    >
      {/* Progreso */}
      <div className="flex items-center gap-1.5 mb-3" aria-hidden="true">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? 'bg-[#F7931A]' : 'bg-[#1F2D48]'
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
                  className={`min-h-touch rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                    category === v.id
                      ? 'bg-[#F7931A] text-slate-950 border-amber-400 font-bold'
                      : 'bg-[#121B2D] border-[#1F2D48] text-slate-300 hover:border-[#F7931A]/60'
                  }`}
                >
                  <span aria-hidden="true">{v.emoji}</span> {v.label}
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
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F7931A]"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label htmlFor="req-origin" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
              Retiro en
            </label>
            <input
              id="req-origin"
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Plaza Solares, Alta Gracia"
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F7931A]"
            />
          </div>
          <div>
            <label htmlFor="req-dest" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
              Entrega en
            </label>
            <input
              id="req-dest"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="B° Cámara, Alta Gracia"
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#F7931A]"
            />
          </div>

          <div>
            <p className="text-xs font-bold text-[#8C9BB4] mb-1.5">Atajos de Alta Gracia</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PLACES.map((place) => (
                <button
                  key={place}
                  type="button"
                  onClick={() => (origin.trim() ? setDestination(place) : setOrigin(place))}
                  className="min-h-touch px-3 rounded-xl text-xs font-semibold bg-[#121B2D] border border-[#1F2D48] text-slate-300 hover:border-[#F7931A]/60 active:scale-95 transition-all flex items-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#F7931A]" />
                  {place}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label htmlFor="req-price" className="block text-xs font-bold text-[#8C9BB4] mb-1.5">
              Precio sugerido en ARS
            </label>
            <input
              id="req-price"
              type="number"
              inputMode="numeric"
              min={500}
              step={100}
              value={priceArs}
              onChange={(e) => setPriceArs(e.target.value)}
              className="w-full min-h-touch rounded-xl px-3 bg-[#070C1E] border border-[#1F2D48] text-lg font-black text-white focus:outline-none focus:border-[#F7931A]"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_PRICES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPriceArs(preset)}
                  className={`min-h-touch px-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    Number(priceArs) === preset
                      ? 'bg-[#F7931A] text-slate-950 border-amber-400'
                      : 'bg-[#121B2D] border-[#1F2D48] text-slate-300 hover:border-[#F7931A]/60'
                  }`}
                >
                  ${preset.toLocaleString('es-AR')}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#121B2D] border border-[#1F2D48] p-3 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#8C9BB4]">Resumen</p>
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
              <span className="text-[#8C9BB4]">Precio:</span> ${Number(priceArs || 0).toLocaleString('es-AR')} ARS
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-[#0A2218] border border-emerald-500/30 p-3">
            <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-emerald-300">
              Se suma <strong>1 VAL de agradecimiento</strong> al cadete cuando confirmes la entrega con el PIN.
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
