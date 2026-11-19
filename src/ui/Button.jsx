import React from 'react';

/**
 * (S09.1) Botón unificado de Gremami.
 * Garantiza un área táctil mínima de 44x44px (accesibilidad móvil) y
 * centraliza los colores de acción para que toda la app sea consistente.
 *
 * Variantes:
 *  - primary   : acción principal (naranja)
 *  - secondary : acción secundaria sobre superficie oscura
 *  - ghost     : acción terciaria sin fondo
 *  - icon      : botón cuadrado solo-icono (44x44)
 */

const BASE =
  'inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7931A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1128]';

const VARIANTS = {
  primary: 'min-h-touch min-w-touch px-4 rounded-xl bg-[#F7931A] text-slate-950 hover:bg-[#E07D09] shadow-md',
  secondary: 'min-h-touch min-w-touch px-4 rounded-xl bg-[#1A253D] text-white border border-[#2D3E61] hover:border-[#F7931A] hover:bg-[#22304E]',
  ghost: 'min-h-touch min-w-touch px-3 rounded-xl text-slate-200 hover:bg-[#1A253D]',
  icon: 'min-h-touch min-w-touch p-0 rounded-xl border'
};

export function Button({
  as: Tag = 'button',
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  const variantClasses = VARIANTS[variant] || VARIANTS.primary;
  return (
    <Tag className={`${BASE} ${variantClasses} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** Botón cuadrado de 44x44 para iconos del header y controles del mapa. */
export function IconButton({ className = '', children, ...props }) {
  return (
    <Button variant="icon" className={className} {...props}>
      {children}
    </Button>
  );
}

export default Button;
