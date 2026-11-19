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
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-[120ms] active:scale-[0.98] ' +
  'disabled:opacity-45 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-app';

const VARIANTS = {
  primary: 'min-h-touch min-w-touch px-4 rounded-control bg-accent text-slate-950 hover:brightness-105 shadow-elev1',
  secondary: 'min-h-touch min-w-touch px-4 rounded-control bg-card text-ink1 border border-line hover:border-accent/60',
  ghost: 'min-h-touch min-w-touch px-3 rounded-control text-ink2 hover:text-ink1 hover:bg-elev',
  icon: 'min-h-touch min-w-touch p-0 rounded-control border border-line bg-card text-ink2 hover:text-ink1'
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
