import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import MotorcycleIcon from './MotorcycleIcon';
import RequestSheet from './RequestSheet';
import ClientOrdersPanel from './ClientOrdersPanel';
import CadetePanel from './CadetePanel';
import {
  Footprints,
  Bike,
  Car,
  Store,
  ArrowRight,
  ShieldCheck,
  Zap,
  Navigation,
  Sparkles,
  MapPin,
  Clock,
  Coins,
  Flame,
  Award,
  TrendingUp,
  Gift,
  Truck
} from 'lucide-react';

// (S07d) Set de glifos propio: grid 24×24, trazo 1.5, sin relleno, currentColor.
// Sistema cohesivo de 6 iconos (nada de librería genérica).
const CATEGORY_GLYPHS = {
  caminando: (
    <>
      <circle cx="12" cy="4.6" r="2" />
      <path d="M12 6.8v3.6" />
      <path d="M12 8.4l-2.6 2" />
      <path d="M12 8.4l2.6 1.6" />
      <path d="M12 10.4l-2.2 4.4" />
      <path d="M12 10.4l2 4.4" />
    </>
  ),
  bicicleta: (
    <>
      <circle cx="6.5" cy="16.5" r="3.5" />
      <circle cx="17.5" cy="16.5" r="3.5" />
      <path d="M6.5 16.5L10.5 10.5h3.5l3.5 6" />
      <path d="M10.5 10.5h2.6" />
      <path d="M13.6 10.5l1.4 2.6" />
    </>
  ),
  motocicleta: (
    <>
      <circle cx="6" cy="16.5" r="3.2" />
      <circle cx="18" cy="16.5" r="3.2" />
      <path d="M6 16.5l3-4h4.6l1.6 4" />
      <path d="M13.6 12.5l1.2-3h2.2" />
    </>
  ),
  automovil: (
    <>
      <path d="M4.5 15.5h15" />
      <path d="M6 15.5c0-2.5 1.2-4 2.9-4.6l1.5-1.7h4.6l1.6 1.9c1.7.5 2.8 2 2.9 4.4" />
      <circle cx="8" cy="16.6" r="1.7" />
      <circle cx="16" cy="16.6" r="1.7" />
    </>
  ),
  fletes: (
    <>
      <path d="M3.5 16.5V8.5h8.5v8" />
      <path d="M12 11h3.4l3.1 3v2.5" />
      <circle cx="7" cy="17.3" r="1.7" />
      <circle cx="16.4" cy="17.3" r="1.7" />
    </>
  ),
  comercio: (
    <>
      <path d="M4 9.5h16" />
      <path d="M5 9.5l.6 2.6a2.4 2.4 0 004.6 0 2.4 2.4 0 004.6 0 2.4 2.4 0 004.6 0L19 9.5" />
      <path d="M6 14.6V19.5h12v-4.9" />
      <path d="M10.2 19.5v-3.2h3.6v3.2" />
    </>
  )
};

function CategoryGlyph({ id }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* (S08) Duotone: disco translúcido detrás + trazo nítido encima */}
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.12" stroke="none" />
      {CATEGORY_GLYPHS[id] || CATEGORY_GLYPHS.bicicleta}
    </svg>
  );
}

export default function HomeScreen() {
  // (S09.4) Estado del flujo "Pedir un envío"
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  // (S09.6b) Modalidad con la que se abre el sheet
  const [requestMode, setRequestMode] = useState('urgent');
  const {
    role,
    categories,
    selectCategoryAndGoToMap,
    setActiveTab,
    balance,
    peers,
    theme,
    isUserBlocked
  } = useApp();

  const isDark = theme === 'dark';
  const isCadete = role === 'cadete';

  const visiblePeers = peers.filter((p) => !isUserBlocked(p.id));

  // Helper to get category icon
  const getCategoryIcon = (iconName) => {
    switch (iconName) {
      case 'Footprints':
        return <Footprints className="w-7 h-7 text-emerald-400" />;
      case 'Bike':
        return <Bike className="w-7 h-7 text-accent" />;
      case 'Motorcycle':
        return <MotorcycleIcon size={28} className="w-7 h-7 text-accent" />;
      case 'Car':
        return <Car className="w-7 h-7 text-[#E02424]" />;
      case 'Truck':
        return <Truck className="w-7 h-7 text-blue-400" />;
      case 'Store':
        return <Store className="w-7 h-7 text-[#F0B90B]" />;
      default:
        return <Navigation className="w-7 h-7 text-accent" />;
    }
  };

  return (
    <div className={`w-full min-h-[calc(100vh-140px)] p-4 pb-6 space-y-4 max-w-lg mx-auto animate-fadeIn transition-colors duration-200 ${
      isDark ? 'bg-[#0A1128] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
    }`}>
      {/* Hero Banner: Identidad Gremami P2P - Alta Gracia, Córdoba */}
      <div className={`relative rounded-2xl border p-4 shadow-xl overflow-hidden transition-colors ${
        isDark
          ? 'bg-gradient-to-br from-[#121B2D] via-[#101726] to-[#0A1128] border-[#1F2D48]'
          : 'bg-gradient-to-br from-white via-slate-50 to-amber-50/40 border-slate-200'
      }`}>
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#E02424]/12 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                isDark
                  ? 'bg-gradient-to-r from-[#F7931A]/20 to-[#E02424]/20 text-[#F0B90B] border-accent/30'
                  : 'bg-accent/15 text-amber-800 border-accent/40'
              }`}>
                <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              Alta Gracia, Córdoba
              </span>
            </div>
            <span className={`text-xs font-mono flex items-center ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
              {visiblePeers.length} Nodos Activos
            </span>
          </div>

          <h2 className={`text-xl font-black mt-2 tracking-tight leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Logística P2P y Mandados sin Intermediarios
          </h2>

          <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
            Conectá directamente en Alta Gracia (Tajamar, Belgrano, Sarmiento, B° Cámara) con cadetes a pie, en bicicleta, vehículos o comercios de barrio. Cero comisiones de apps centralizadas.
          </p>

          {/* Quick Stats Bar */}
          <div className={`mt-3.5 pt-3 border-t grid grid-cols-3 gap-2 text-center ${
            isDark ? 'border-[#1F2D48]' : 'border-slate-200'
          }`}>
            <div className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#070C1E]/70 border-[#1F2D48]/80' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <span className={`text-xs font-black font-mono block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {visiblePeers.length} Nodos
              </span>
              <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Alta Gracia</span>
            </div>
            <div className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#070C1E]/70 border-[#1F2D48]/80' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <span className="text-xs font-black text-accent font-mono block">
                $1.500 ARS
              </span>
              <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Tarifa base sugerida</span>
            </div>
            <div className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#070C1E]/70 border-[#1F2D48]/80' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <span className="text-xs font-black text-emerald-500 font-mono block">
                0% Comisión
              </span>
              <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Ahorro del 30%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cadete Mode Quick Notice if active */}
      {isCadete && (
        <div className={`p-3.5 rounded-2xl border shadow-md ${
          isDark
            ? 'bg-gradient-to-r from-[#18243C] to-[#121B2D] border-emerald-500/40 shadow-glow-green'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-radar absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div>
                <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-emerald-950'}`}>Panel de Cadete Activo en Alta Gracia</p>
                <p className={`text-xs ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Estás emitiendo señal en el mapa para las 6 categorías
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('map')}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                isDark
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
              }`}
            >
              Ver Radar
            </button>
          </div>
        </div>
      )}

      {/* (S09.6b) Experiencia diferenciada por rol */}
      {isCadete ? (
        <CadetePanel />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setRequestMode('urgent'); setIsRequestOpen(true); }}
              aria-label="Pedir un envío ahora"
              className="min-h-touch rounded-2xl bg-accent hover:bg-accent-strong text-slate-950 font-black text-xs shadow-elev1 flex flex-col items-center justify-center gap-1 py-2.5 active:scale-[0.99] transition-all"
            >
              <Zap className="w-5 h-5" aria-hidden="true" />
              Pedir Ahora
            </button>
            <button
              type="button"
              onClick={() => { setRequestMode('scheduled'); setIsRequestOpen(true); }}
              aria-label="Programar un envío para más tarde"
              className={`min-h-touch rounded-2xl border font-black text-xs flex flex-col items-center justify-center gap-1 py-2.5 active:scale-[0.99] transition-all ${
                isDark
                  ? 'bg-[#121B2D] border-accent/60 text-accent hover:bg-[#1A253D]'
                  : 'bg-white border-accent/60 text-accent hover:bg-amber-50 shadow-sm'
              }`}
            >
              <Clock className="w-5 h-5" aria-hidden="true" />
              Programar
            </button>
          </div>

          <ClientOrdersPanel />
        </>
      )}

      <RequestSheet
        open={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        initialMode={requestMode}
      />

      {/* Acceso Global Destacado: 🌟 TODAS las Categorías y Comercios de Alta Gracia */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xl transition-all ${
        isDark
          ? 'bg-gradient-to-r from-[#121B2D] via-[#1A253D] to-[#121B2D] border-accent/40'
          : 'bg-white border-accent/40 shadow-sm'
      }`}>
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className={`text-xs font-black tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
              TODAS las Categorías y Locales
              </h4>
              <span className="text-xs font-mono font-bold bg-accent/20 text-accent px-1.5 py-0.2 rounded border border-accent/40 flex-shrink-0">
                {visiblePeers.length} Nodos
              </span>
            </div>
            <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
              Ver simultáneamente transportes, fletes y comercios de Alta Gracia
            </p>
          </div>
        </div>
        <button
          onClick={() => selectCategoryAndGoToMap('all')}
          className="ml-2 px-3 py-2 rounded-control bg-accent hover:brightness-105 text-slate-950 font-bold text-xs shadow-elev1 flex items-center space-x-1 flex-shrink-0 active:scale-[0.98] transition-all duration-[120ms]"
        >
          <span>Ver Mapa</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* SECCIÓN A: Servicios de Transporte y Envíos */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-accent" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>
              Servicios de Transporte y Envíos
            </h3>
          </div>
          <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>50 Nodos Activos</span>
        </div>

        {/* 5 Tarjetas de Transporte: Caminando, Bici, Moto, Auto, Fletes */}
        <div className="grid grid-cols-1 gap-2.5">
          {categories
            .filter((c) => c.id !== 'comercio')
            .map((cat) => {
              const count = visiblePeers.filter((p) => p.category === cat.id).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => selectCategoryAndGoToMap(cat.id)}
                  className="w-full text-left rounded-card border border-line bg-card p-3.5 shadow-elev1 transition-all duration-200 group active:scale-[0.98] hover:border-accent/40"
                >
                  <div className="flex items-start space-x-3.5">
                    <div className="w-12 h-12 rounded-card flex items-center justify-center flex-shrink-0 bg-accent/12 border border-accent/25 text-accent transition-transform duration-200 group-hover:scale-105">
                      <CategoryGlyph id={cat.id} />
                    </div>

                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-semibold tracking-tight text-ink1 group-hover:text-accent transition-colors truncate">
                          {cat.title}
                        </h4>
                        <span className="text-2xs font-medium px-2 py-0.5 rounded-full border border-line bg-elev text-ink3">
                          {count} activos
                        </span>
                      </div>

                      <p className={`text-xs mt-0.5 leading-snug ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
                        {cat.subtitle}
                      </p>

                      <div className={`mt-2 flex items-center justify-between text-sm leading-5 font-sans antialiased no-underline ${
                        isDark ? 'text-[#8C9BB4]' : 'text-slate-500'
                      }`}>
                        <span className={`flex items-center ${isDark ? 'text-white' : 'text-slate-700'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                          <strong>{count}</strong> en Alta Gracia
                        </span>
                        <span className="text-accent font-bold flex items-center group-hover:translate-x-0.5 transition-transform">
                          <span>Ver en mapa</span>
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* SECCIÓN B: Comercios y Negocios de Barrio */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <Store className="w-4 h-4 text-[#F0B90B]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>
              Comercios y Negocios de Barrio
            </h3>
          </div>
          <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>10 Nodos Activos</span>
        </div>

        {/* Tarjeta de Negocios Locales */}
        {categories
          .filter((c) => c.id === 'comercio')
          .map((cat) => {
            const count = visiblePeers.filter((p) => p.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategoryAndGoToMap(cat.id)}
                className={`w-full text-left rounded-2xl border p-3.5 shadow-md transition-all duration-200 group active:scale-[0.98] relative overflow-hidden ${
                  isDark
                    ? 'bg-[#121B2D] hover:bg-[#18243C] border-[#1F2D48] hover:border-accent/60/40'
                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-accent/40 shadow-sm'
                }`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400 group-hover:w-1.5 shadow-glow-gold transition-all" />

                <div className="flex items-start space-x-3.5 pl-1.5">
                  <div className={`w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                    isDark ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-accent/15 border border-accent/40'
                  }`}>
                    <CategoryGlyph id={cat.id} />
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center justify-between">
                      <h4 className={`text-sm font-bold group-hover:text-accent transition-colors truncate ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}>
                        {cat.title}
                      </h4>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        isDark ? 'bg-amber-950/60 text-amber-300 border-amber-700/50' : 'bg-accent/15 text-amber-800 border-accent/40'
                      }`}>
                        {count} locales activos
                      </span>
                    </div>

                    <p className={`text-xs mt-0.5 leading-snug ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
                      {cat.subtitle}
                    </p>

                    <div className={`mt-2 flex items-center justify-between text-sm leading-5 font-sans antialiased no-underline ${
                      isDark ? 'text-[#8C9BB4]' : 'text-slate-500'
                    }`}>
                      <span className={`flex items-center ${isDark ? 'text-white' : 'text-slate-700'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                        <strong>{count}</strong> comercios en Alta Gracia
                      </span>
                      <span className="text-accent font-bold flex items-center group-hover:translate-x-0.5 transition-transform">
                        <span>Ver en mapa</span>
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      {/* Quick Access Card: Mercado P2P DEX */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xl ${
        isDark
          ? 'bg-gradient-to-r from-[#121B2D] via-[#10232E] to-[#121B2D] border-emerald-500/30'
          : 'bg-white border-emerald-200'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Mercado P2P DEX</h4>
            <p className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Donaciones y canje de ValensCoin entre vecinos</p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('dex')}
          className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs shadow-md flex items-center space-x-1"
        >
          <span>Ver DEX</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Escudo de Seguridad & Filosofía Cripto */}
      <div className={`p-3.5 rounded-2xl border flex items-start space-x-3 text-xs ${
        isDark ? 'bg-[#070C1E] border-[#1F2D48] text-[#8C9BB4]' : 'bg-slate-100 border-slate-200 text-slate-600'
      }`}>
        <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Acuerdos P2P Directos y Seguros</p>
          <p className="text-xs">
            La relación es entre tú y el cadete o comercio de Alta Gracia. Sin comisiones abusivas ni intermediarios financieros.
          </p>
        </div>
      </div>
    </div>
  );
}
