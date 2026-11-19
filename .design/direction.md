# Direction — "Cuaderno de barrio, infraestructura fintech"

## PRODUCT
GREMAMI P2P: PWA de logística y mandados entre vecinos de Alta Gracia, Córdoba.
Usuario: vecino con datos limitados, prisa real, desconfianza razonable de las apps.
Acción primaria: **pedir un envío en menos de 30 segundos**.
Qué debe entenderse en 5 segundos: *podés mandar algo ahora, con alguien del barrio, y sabés cuánto sale*.

## VISUAL DIRECTION
Logística de barrio con la precisión de una herramienta financiera:
cálido donde hay personas, exacto donde hay dinero.

## HIERARCHY
1. CTA (Pedir Ahora / Programar)
2. Estado operativo (en línea, fianza)
3. Pedidos activos y ofertas
4. Catálogo de categorías

## LAYOUT
Contenedor móvil de una columna, máx 448px, con respiración editorial:
bloques separados por ritmo de 24px, sin tarjetas anidadas.

## TYPOGRAPHY
Display: Inter Tight, títulos 700 con -0.02em.
Body: Inter 400/500.
Datos: Inter con `font-variant-numeric: tabular-nums` (nunca `font-mono` salvo direcciones/hashes).

## COLOR
Base neutra cálida (no navy frío) + UN acento configurable.
- Noche: `--bg-app:#0B0F14` · `--bg-card:#12171F` · `--border:#232C38`
- Día:   `--bg-app:#F7F6F3` · `--bg-card:#FFFFFF` · `--border:#E6E2DA`
Acento: `--accent` (4 temas: ambar, sierras, oceano, grafito).
Prohibido: glows, orbes `blur-3xl`, gradientes decorativos, rojo de relleno.

## DENSITY / INTERACTION / RESPONSIVE
Densidad media. Controles ≥ 44px. Foco visible siempre.
Una sola columna en móvil; en desktop se mantiene el lienzo de 448px centrado.

## MOTION
120 ms micro · 180 ms sheet · `cubic-bezier(.2,.8,.2,1)`.
Solo transform/opacity. `prefers-reduced-motion` desactiva movimiento.

## IMAGERY
none — producto de datos; sin fotografía ni ilustración decorativa.

## SIGNATURE
El precio en pesos como ancla tipográfica tabular, y el acento que colorea
solo lo accionable (nada más).
