import React, { useState } from 'react';
import { ArrowRight, Check, Compass, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * (S13) Onboarding editorial de 3 pasos.
 * 100% tokens (bg-app / bg-card / border-line / text-ink*) → respeta Día, Noche y los 4 acentos.
 * Sin jerga: la propuesta se explica en 15 segundos.
 */

const STEPS = [
  {
    id: 'economy',
    title: 'Tus envíos y mandados, directo entre vecinos.',
    subtitle:
      'Acordá el precio en pesos sin comisiones de plataforma. El valor que se genera en tu ciudad se queda en tu ciudad.',
    art: 'network'
  },
  {
    id: 'learn',
    title: 'Aprendé cripto haciendo, con cero riesgo.',
    subtitle:
      'Cada servicio completado libera 1 VAL de agradecimiento. Practicás el uso real de una wallet, códigos QR y custodia propia como un juego en la vida real.',
    art: 'ticket'
  },
  {
    id: 'wallet',
    title: 'Tu billetera lista para rodar en Alta Gracia.',
    subtitle:
      'Completá tu perfil con foto (y tu vehículo si querés repartir) para recibir tus primeros 10 VAL y empezar a pedir o trabajar hoy.',
    art: 'credential'
  }
];

function NetworkArt() {
  return (
    <svg viewBox="0 0 240 160" className="w-full h-40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="120" cy="42" r="16" />
      <circle cx="52" cy="118" r="16" />
      <circle cx="188" cy="118" r="16" />
      <path d="M108 55 64 105" strokeDasharray="4 5" />
      <path d="M132 55 176 105" strokeDasharray="4 5" />
      <path d="M68 118h104" strokeDasharray="4 5" />
      <path d="M114 38h12M120 32v12" />
      <path d="M46 114h12M52 108v12" />
      <path d="M182 114h12M188 108v12" />
    </svg>
  );
}

function TicketArt() {
  return (
    <div className="w-full rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Servicio acordado</span>
        <Check className="w-4 h-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink1 tabular-nums">$2.500</p>
      <p className="text-xs text-ink3">ARS · pago directo al cadete</p>
      <div className="mt-4 h-px w-full border-t border-dashed border-line" />
      <div className="mt-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
          +1 VAL · Gesto de agradecimiento
        </span>
      </div>
    </div>
  );
}

function CredentialArt() {
  return (
    <div className="w-full rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink1">Alta Gracia</p>
            <p className="text-[11px] text-ink3">Perfil comunitario</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-elev px-2.5 py-1 text-[11px] font-semibold text-ink2">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
          Verificado
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-elev px-4 py-3 flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink2">Bono de bienvenida</span>
        <span className="text-2xl font-semibold tracking-tight text-accent tabular-nums">10 VAL</span>
      </div>
    </div>
  );
}

export default function OnboardingScreen({ onComplete, onExplore, onSkip }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <div className="min-h-[100dvh] w-full bg-app text-ink1 flex flex-col max-w-md mx-auto relative">
      {/* Saltar */}
      <div className="flex justify-between items-center px-5 pt-5">
        <div className="flex items-center gap-1.5" aria-label={`Paso ${index + 1} de 3`}>
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-touch px-2 text-xs font-medium text-ink3 hover:text-ink1 transition-colors"
        >
          Saltar
        </button>
      </div>

      {/* Contenido */}
      <main className="flex-1 flex flex-col justify-center px-5 pb-4">
        <div className="text-accent mb-6">
          {step.art === 'network' && <NetworkArt />}
          {step.art === 'ticket' && <TicketArt />}
          {step.art === 'credential' && <CredentialArt />}
        </div>

        <h1 className="text-[26px] leading-[1.15] font-semibold tracking-tight text-ink1">
          {step.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink2">
          {step.subtitle}
        </p>

        {isLast && (
          <p className="mt-5 text-[11px] leading-relaxed text-ink3">
            Proyecto educativo y comunitario sin fines de lucro • Escuela práctica de usuarios cripto
          </p>
        )}
      </main>

      {/* Acciones */}
      <footer className="px-5 pb-6 pt-2 space-y-2">
        {isLast ? (
          <>
            <button
              type="button"
              onClick={onComplete}
              className="w-full min-h-touch rounded-2xl bg-accent text-slate-950 font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            >
              Comenzar ahora
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onExplore}
              className="w-full min-h-touch rounded-2xl bg-card border border-line text-ink1 font-semibold text-[15px] active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
            >
              <Compass className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Explorar el mapa primero
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="w-full min-h-touch rounded-2xl bg-accent text-slate-950 font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
          >
            Siguiente
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </footer>
    </div>
  );
}
