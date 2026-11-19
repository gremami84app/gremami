import React, { useState } from 'react';
import { Copy, Heart, ShieldCheck, X } from 'lucide-react';

/**
 * (S13b) Aviso legal lúdico-educativo + donaciones voluntarias (Fiat / Cripto).
 * 100% tokens. Sin jerga, sin promesas de rendimiento.
 */

// ⚠️ Reemplazar por los datos oficiales del proyecto antes de publicar.
const FIAT_ALIAS = 'gremami.comunidad.mp';
const CRYPTO_ADDRESS = 'gremami.valens.altaGracia';
const CRYPTO_NETWORK = 'Red Valens L1';

export default function LegalDonationModal({ open, onClose }) {
  const [tab, setTab] = useState('fiat');
  const [copied, setCopied] = useState(null);

  if (!open) return null;

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      setCopied(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md bg-card border border-line rounded-t-3xl sm:rounded-2xl max-h-[92dvh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 id="legal-title" className="text-base font-semibold tracking-tight text-ink1">
              Aviso legal y donaciones
            </h2>
            <p className="text-xs text-ink3 mt-0.5">Proyecto comunitario y educativo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-touch min-w-touch -mr-2 flex items-center justify-center rounded-control text-ink3 hover:text-ink1"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink3">Qué es GREMAMI</h3>
            <p className="text-[13px] leading-relaxed text-ink2">
              Es un <strong className="text-ink1">proyecto comunitario y educativo sin fines de lucro</strong>: un
              “videojuego en la vida real” pensado como <strong className="text-ink1">escuela práctica de usuarios
              de criptomonedas</strong>, para aprender wallets, claves públicas y privadas, códigos QR y dinámicas
              P2P sin riesgo financiero.
            </p>
            <p className="text-[13px] leading-relaxed text-ink2">
              <strong className="text-ink1">No es un banco, ni un exchange, ni una entidad financiera.</strong> No
              custodia dinero de terceros ni ofrece rendimientos.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-elev p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink3">Apoyar el proyecto</h3>
            </div>
            <p className="text-[13px] leading-relaxed text-ink2">
              Las donaciones son <strong className="text-ink1">voluntarias</strong> y no otorgan derechos
              societarios, participación ni rendimientos de ningún tipo.
            </p>

            <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="Medio de donación">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'fiat'}
                onClick={() => setTab('fiat')}
                className={`min-h-touch rounded-control text-xs font-semibold border transition-colors ${
                  tab === 'fiat' ? 'bg-accent text-slate-950 border-transparent' : 'bg-card border-line text-ink2'
                }`}
              >
                Pesos (ARS)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'crypto'}
                onClick={() => setTab('crypto')}
                className={`min-h-touch rounded-control text-xs font-semibold border transition-colors ${
                  tab === 'crypto' ? 'bg-accent text-slate-950 border-transparent' : 'bg-card border-line text-ink2'
                }`}
              >
                Cripto (VAL)
              </button>
            </div>

            {tab === 'fiat' ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Alias / CVU comunitario</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-control bg-card border border-line px-3 py-2 text-xs text-ink1">
                    {FIAT_ALIAS}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(FIAT_ALIAS, 'fiat')}
                    className="min-h-touch min-w-touch flex items-center justify-center rounded-control border border-line bg-card text-ink2"
                    aria-label="Copiar alias"
                  >
                    <Copy className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">
                  Dirección de aporte · {CRYPTO_NETWORK}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-control bg-card border border-line px-3 py-2 text-xs text-ink1">
                    {CRYPTO_ADDRESS}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(CRYPTO_ADDRESS, 'crypto')}
                    className="min-h-touch min-w-touch flex items-center justify-center rounded-control border border-line bg-card text-ink2"
                    aria-label="Copiar dirección"
                  >
                    <Copy className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )}

            {copied && (
              <p className="text-[11px] font-semibold text-accent" role="status">
                Copiado al portapapeles
              </p>
            )}
          </section>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink3">
            <ShieldCheck className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
            Proyecto educativo y comunitario sin fines de lucro · Escuela práctica de usuarios cripto.
          </p>
        </div>

        <div className="px-5 pb-5 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-touch rounded-2xl bg-accent text-slate-950 font-semibold text-[15px]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
