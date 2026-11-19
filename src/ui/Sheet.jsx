import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * (S09.4) Bottom sheet reutilizable.
 * - role="dialog" + aria-modal
 * - cierre por backdrop, botón ✕ y tecla Escape
 * - bloquea el scroll del documento mientras está abierto
 * - todos los controles cumplen el área táctil mínima de 44px (min-h-touch)
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;

    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[#0B132B] border-t border-x border-[#1F2D48] rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col">
        <div className="pt-2 pb-1 flex justify-center">
          <span className="h-1.5 w-10 rounded-full bg-[#2D3E61]" />
        </div>

        <div className="px-4 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="sheet-title" className="text-sm font-black text-white truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#8C9BB4] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-touch min-w-touch -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white active:scale-95 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-4 pb-5 pt-3 border-t border-[#1F2D48] bg-[#0B132B]">{footer}</div>
        )}
      </div>
    </div>
  );
}
