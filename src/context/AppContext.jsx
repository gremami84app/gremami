import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  INITIAL_PEERS,
  INITIAL_MESSAGES,
  INITIAL_TRANSACTIONS,
  BIP39_SEED_WORDS,
  PEER_CATEGORIES,
  INITIAL_ORDERS_HISTORY,
  INITIAL_LIVE_REQUESTS,
  INITIAL_DEX_ORDERS,
  formatDistanceKm,
  getPeerSocials,
  ARGENTINE_FIAT_PROVIDERS,
  MOCK_COMMUNITY_USERS
} from '../data/mockData';
import { playP2PAlertChime, playCelebrationSound } from '../utils/audioAlert';
import {
  saveBidToSupabase,
  recordDeliveryTransactionInSupabase,
  saveFiatPaymentConfigToSupabase,
  saveOrderToSupabase,
  persistDeliveryWithOrder,
  newUuid,
  isUuid,
  valensService
} from '../lib/supabase';
import { authService, profileService, isSupabaseConfigured, supabase, pinService, orderService, offerService } from '../lib/supabaseClient';
import { derivePublicAddress, generateSeedPhrase, generateValensQrUri, localTransferTokens, localClaimFaucet } from '../services/cryptoWalletService';


const AppContext = createContext();

export const CURRENT_CADET_ID = 'current-cadet-satoshidev';

export const EXCHANGE_RATES = {
  ARS_PER_USD: 1250,
  ARS_PER_VALENS: 2500,
  USD_PER_VALENS: 2.0
};

// (S07.5) Traduce el resultado de persistencia a un aviso para el usuario.
// Devuelve null cuando la operación SÍ se sincronizó (o cuando el fallo es benigno).
const isRemoteOk = (res) =>
  Boolean(res && (res.remote === true || res.delivery?.remote === true || res.reason === 'already-exists'));

const persistenceWarning = (res) => {
  if (isRemoteOk(res)) return null;
  if (res?.step === 'order') {
    return '⚠️ No se pudo registrar la orden en el servidor: quedó solo en este dispositivo.';
  }
  const reason = res?.reason || res?.delivery?.reason;
  switch (reason) {
    case 'no-session':
      return '⚠️ Sin sesión iniciada: se guardó solo en este dispositivo.';
    case 'offline':
      return '⚠️ Supabase no está configurado: se guardó solo en este dispositivo.';
    case 'invalid-uuid':
    case 'invalid-client-id':
    case 'invalid-cadet-id':
      return '⚠️ Faltan datos válidos: se guardó solo en este dispositivo.';
    default:
      return '⚠️ Guardado localmente, pero falló la sincronización con el servidor.';
  }
};

// Fórmula de Haversine — distancia entre dos puntos GPS en kilómetros
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Decodificador seguro de JWT para lectura inmediata de tokens de usuario sin latencia
const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    try {
      const parts = token.split('.');
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch (err) {
      return null;
    }
  }
};

// Extractor directo de tokens desde la URL (hash #access_token o query ?access_token)
const extractTokensFromUrl = () => {
  if (typeof window === 'undefined') return null;
  try {
    if (window.location.hash) {
      let rawHash = window.location.hash;
      if (rawHash.startsWith('#/')) rawHash = rawHash.substring(2);
      else if (rawHash.startsWith('#')) rawHash = rawHash.substring(1);

      if (rawHash.includes('access_token')) {
        const params = new URLSearchParams(rawHash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken) {
          return { accessToken, refreshToken: refreshToken || '' };
        }
      }
    }

    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const code = params.get('code');
      if (accessToken) {
        return { accessToken, refreshToken: refreshToken || '' };
      }
      if (code) {
        return { code };
      }
    }
  } catch (e) {
    console.warn('[Auth] Error analizando tokens de la URL:', e);
  }
  return null;
};

export function AppProvider({ children }) {
  // Theme: 'dark' (Cripto Dark) or 'light' (High Contrast Urbano)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('gremami_theme') || 'dark';
  });

  // Role: 'cliente' or 'cadete'
  const [role, setRole] = useState('cliente');

  // Navigation tab & history: 'home', 'map', 'chat', 'wallet', 'dex', 'profile'
  const [activeTab, setActiveTabState] = useState('home');
  const [navigationHistory, setNavigationHistory] = useState(['home']);

  const setActiveTab = (tabOrUpdater) => {
    setActiveTabState((prevTab) => {
      const nextTab = typeof tabOrUpdater === 'function' ? tabOrUpdater(prevTab) : tabOrUpdater;
      if (nextTab && nextTab !== prevTab) {
        setNavigationHistory((prevHist) => [...prevHist, nextTab]);
      }
      return nextTab;
    });
  };

  const goBack = () => {
    setNavigationHistory((prevHist) => {
      if (prevHist.length > 1) {
        const nextHist = prevHist.slice(0, -1);
        const targetTab = nextHist[nextHist.length - 1];
        setActiveTabState(targetTab);
        return nextHist;
      } else {
        setActiveTabState('home');
        return ['home'];
      }
    });
  };

  const canGoBack = activeTab !== 'home' || navigationHistory.length > 1;

  // Category filter for the map: 'all', 'caminando', 'bicicleta', 'automovil', 'comercio'
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // ValensCoin balance (requirement: initial balance 10 VAL, 0 decimals - integers only)
  // (S14a) Invitado arranca en 0 VAL. El bono de 10 VAL lo otorga Supabase
  // (trigger handle_new_user) únicamente a usuarios registrados.
  const [balance, setBalance] = useState(0);

  // Dirección y semilla criptográfica BIP-39 (solo en memoria; nunca en localStorage)
  const [userSeedWords] = useState(() => generateSeedPhrase());
  const [userPublicKey] = useState(() => derivePublicAddress(userSeedWords));

  // (S11) Dirección Valens REAL del usuario autenticado, persistida en
  // public.profiles.wallet_address vía ensure_wallet_address(). Para invitados
  // (sin sesión Supabase) se usa la dirección local efímera userPublicKey.
  const [walletAddress, setWalletAddress] = useState('');

  // (S11) La recompensa de 5 VAL de la Escuela Cripto se otorga una sola vez.
  const [schoolRewardClaimed, setSchoolRewardClaimed] = useState(() => {
    try {
      return localStorage.getItem('gremami_crypto_school_reward') === '1';
    } catch (e) {
      return false;
    }
  });
  const [userName, setUserName] = useState(() => {
    const urlTokens = extractTokensFromUrl();
    if (urlTokens?.accessToken) {
      const payload = decodeJwtPayload(urlTokens.accessToken);
      const name = payload?.user_metadata?.full_name || payload?.user_metadata?.name || payload?.email?.split('@')[0];
      if (name) return name;
    }
    try {
      const saved = localStorage.getItem('gremami_auth_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        const u = parsed?.user || parsed;
        const name = u?.user_metadata?.full_name || u?.user_metadata?.name || u?.profile?.full_name;
        if (name) return name;
      }
    } catch (e) {}
    return 'Invitado';
  });
  const [currentUser, setCurrentUser] = useState(() => {
    const urlTokens = extractTokensFromUrl();
    if (urlTokens?.accessToken) {
      const payload = decodeJwtPayload(urlTokens.accessToken);
      if (payload?.sub) {
        const immediateUser = {
          id: payload.sub,
          email: payload.email,
          user_metadata: payload.user_metadata || {},
          app_metadata: payload.app_metadata || {}
        };
        try {
          localStorage.setItem('gremami_auth_user', JSON.stringify(immediateUser));
        } catch (e) {}
        return immediateUser;
      }
    }
    try {
      const saved = localStorage.getItem('gremami_auth_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.user || parsed;
      }
    } catch (e) {}
    return null;
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedPublicProfile, setSelectedPublicProfile] = useState(null);

  // 4. Interruptor de Estado en Tiempo Real (Online / Offline - Disponible para Trabajar)
  const [isOnline, setIsOnline] = useState(() => {
    return localStorage.getItem('gremami_is_online') !== 'false';
  });

  // Perfil Ampliado del Usuario / Prestador
  const [userProfile, setUserProfile] = useState(() => {
    const urlTokens = extractTokensFromUrl();
    const tokenPayload = urlTokens?.accessToken ? decodeJwtPayload(urlTokens.accessToken) : null;
    const tokenName = tokenPayload?.user_metadata?.full_name || tokenPayload?.user_metadata?.name;
    const tokenAvatar = tokenPayload?.user_metadata?.avatar_url || tokenPayload?.user_metadata?.picture;

    try {
      const saved = localStorage.getItem('gremami_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (tokenName) parsed.name = tokenName;
        if (tokenAvatar) parsed.avatar = tokenAvatar;
        if (!parsed.aliasCbu) parsed.aliasCbu = 'cadete.gremami.mp';
        if (!parsed.fiatProvider) parsed.fiatProvider = 'Mercado Pago';
        if (!parsed.fiatAlias) parsed.fiatAlias = parsed.aliasCbu || 'cadete.gremami.mp';
        if (!parsed.fiatCbuCvu) parsed.fiatCbuCvu = '0000003100049281729384';
        if (!parsed.fiatHolderName) parsed.fiatHolderName = 'Satoshi Dev Nakamoto';
        if (!parsed.fiatCuit) parsed.fiatCuit = '20-38492019-4';
        if (!parsed.coverageRadius) parsed.coverageRadius = 5;
        if (!parsed.mobilityMode) parsed.mobilityMode = 'moto';
        return parsed;
      }
    } catch (e) {}
    return {
      name: tokenName || 'Invitado',
      role: 'cadete',
      aliasCbu: 'cadete.gremami.mp',
      fiatProvider: 'Mercado Pago',
      fiatAlias: 'cadete.gremami.mp',
      fiatCbuCvu: '0000003100049281729384',
      fiatHolderName: 'Satoshi Dev Nakamoto',
      fiatCuit: '20-38492019-4',
      avatar: tokenAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      idDocumentUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80',
      isIdVerified: true,
      bio: 'Servicio de logística y fletes soberano en Alta Gracia. Mudanzas, trámites rápidos y cargas pesadas sin comisiones abusivas.',
      workZone: 'Alta Gracia, Córdoba capital y Valle de Paravachasca',
      vehicleType: 'Camioneta Pick-up',
      serviceModality: 'mixto', // 'pasajeros' | 'envios' | 'mixto'
      loadCapacity: '1.500 kg / 8 m³',
      includesHelpers: true,
      socials: {
        instagram: '@gremami.p2p',
        twitter: '@gremamip2p',
        whatsapp: '+5493547123456',
        facebook: 'Gremami P2P Alta Gracia'
      },
      referralCode: 'satoshidev',
      referralsCount: 4,
      referralRewardsValens: 8.0,
      milestones: {
        weeklyDeliveries: 12,
        positiveRatingPercent: 100,
        commissionsSavedArs: 48500,
        totalTripsAllTime: 42
      },
      coverageRadius: 5,
      mobilityMode: 'moto'
    };
  });

  // GPS visibility
  const [isGpsActive, setIsGpsActive] = useState(true);

  // Coordenadas GPS en Tiempo Real del Usuario (Alta Gracia / Gran Córdoba)
  const [userGpsCoords, setUserGpsCoords] = useState([-31.6529, -64.4283]);
  const [userGpsAccuracy, setUserGpsAccuracy] = useState(null);
  const [hasLiveGps, setHasLiveGps] = useState(false);

  // Selected peer for map bottom-sheet
  const [selectedPeer, setSelectedPeer] = useState(null);

  // Active chat peer ID
  // (S14a-6) Sin peer precargado: el invitado no hereda una conversación ficticia
  // (antes 'cadete-moto-1' hacía que ChatScreen mostrara a "Ana P." y un PIN de ejemplo).
  const [activeChatPeerId, setActiveChatPeerId] = useState(null);

  // Peers data (50 nodos en Alta Gracia, Córdoba)
  const [peers, setPeers] = useState(INITIAL_PEERS);

  // Orders History for Multicurrency Dashboard (Cliente & Cadete)
  const [ordersHistory, setOrdersHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('gremami_orders_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_ORDERS_HISTORY;
  });

  // Solicitudes de servicio en vivo (Live Broadcast P2P)
  const [liveRequests, setLiveRequests] = useState(INITIAL_LIVE_REQUESTS);

  // Alerta en vivo activa para el modo Cadete/Prestador
  const [activeAlert, setActiveAlert] = useState({
    id: 'req-live-101',
    title: '🔔 ¡Alarma P2P: Nuevo cliente a 0.5 km buscando entrega!',
    subtitle: 'Lucía M. solicita: Retirar medicamento en Farmacia Belgrano y entregar en B° Pellegrini',
    request: INITIAL_LIVE_REQUESTS[0]
  });

  // Flujo de Conexión Condicional del Chat P2P (Aceptación Mutua previa)
  const [acceptedConnections, setAcceptedConnections] = useState(['cadete-moto-1', 'cadete-auto-1']);

  // Módulo de Seguridad: Lista de usuarios bloqueados
  const [blockedUserIds, setBlockedUserIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gremami_blocked_users')) || [];
    } catch (e) {
      return [];
    }
  });

  // Solicitudes P2P de Imagen de DNI (Intercambio Voluntario): { [peerId]: 'none' | 'pending' | 'accepted' | 'rejected' }
  const [dniRequests, setDniRequests] = useState({});

  // Privacidad de Contacto: Consentimiento Explícito para Compartir WhatsApp por Chat P2P: { [peerId]: boolean }
  const [sharedWhatsappChats, setSharedWhatsappChats] = useState({});

  // Sistema Antifraude: PIN dinámico de 4 dígitos
  const [orderPin, setOrderPin] = useState('4821');
  // (S09.6c) PIN individual por pedido: { [orderId]: '1234' }
  const [pinsByOrder, setPinsByOrder] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('gremami_pins') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  });
  const [pinStatus, setPinStatus] = useState('pending'); // 'pending' | 'verified'
  const [pinFailedAttempts, setPinFailedAttempts] = useState(0);
  const [isPinLocked, setIsPinLocked] = useState(false);

  // Modal de celebración e impacto visual (Dopamina P2P)
  const [celebrationData, setCelebrationData] = useState(null); // { open, rewardAmount, peerName, isCadete, txHash }

  // Messages dictionary: { [peerId]: Message[] }
  // (S14a) Sin sesión no hay historial ni chats ficticios precargados.
  const [messages, setMessages] = useState([]);

  // Transactions list
  const [transactions, setTransactions] = useState([]);

  // Mercado P2P DEX: Libro de órdenes abierto descentralizado
  const [dexOrders, setDexOrders] = useState(INITIAL_DEX_ORDERS);

  // Toast notifications
  const [toast, setToast] = useState(null);

  // Auto-clear toast after 3.5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  };

  // ------------------------------------------------------------------
  // (S11) Identidad Valens real: dirección persistente, saldo e historial.
  // ------------------------------------------------------------------
  const persistSchoolRewardClaimed = (claimed) => {
    setSchoolRewardClaimed(Boolean(claimed));
    try {
      localStorage.setItem('gremami_crypto_school_reward', claimed ? '1' : '0');
    } catch (e) {}
  };

  const applyWalletSnapshot = async (userId) => {
    if (!userId) return null;
    const snapshot = await valensService.getWalletSnapshot(userId);
    if (snapshot) {
      if (typeof snapshot.balance === 'number') {
        setBalance(snapshot.balance);
      }
      if (Array.isArray(snapshot.transactions)) {
        setTransactions(snapshot.transactions);
      }
    }
    return snapshot;
  };

  const loadWalletIdentity = async (userId) => {
    if (!userId || !isUuid(userId)) return null;

    try {
      const [addressResult, snapshot, progress] = await Promise.all([
        valensService.ensureWalletAddress(),
        valensService.getWalletSnapshot(userId),
        valensService.getSchoolProgress(userId)
      ]);

      if (addressResult?.address) {
        setWalletAddress(addressResult.address);
      }
      if (snapshot) {
        if (typeof snapshot.balance === 'number') {
          setBalance(snapshot.balance);
        }
        if (Array.isArray(snapshot.transactions)) {
          setTransactions(snapshot.transactions);
        }
      }
      if (progress) {
        persistSchoolRewardClaimed(Boolean(progress.reward_claimed));
      } else {
        // Sin fila de progreso (o tabla aún no disponible): este usuario todavía
        // no reclamó. Evita heredar el estado de otra cuenta en el mismo equipo.
        persistSchoolRewardClaimed(false);
      }

      return { address: addressResult?.address || null, snapshot, progress };
    } catch (e) {
      console.warn('Aviso al cargar la identidad Valens:', e);
      return null;
    }
  };

  // Sincronización automática de Sesión de Supabase y Google OAuth
  useEffect(() => {
    // Helper centralizado para sincronizar inmediatamente la sesión de usuario
    const handleUserSession = async (user) => {
      if (!user) return;
      setCurrentUser(user);
      setIsAuthModalOpen(false);

      const metaName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0];
      const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;

      if (metaName) setUserName(metaName);
      if (metaAvatar) {
        setUserProfile((prev) => ({
          ...prev,
          name: metaName || prev.name,
          avatar: metaAvatar
        }));
      }

      try {
        // (S07-Fix) Solo se sincroniza contra Supabase si el id es un UUID real
        // (sesión de Supabase Auth). Los usuarios locales/mock se omiten para no
        // disparar 403 por auth.uid() nulo.
        const { profile, wallet } = isUuid(user.id)
          ? await authService.syncUserSession(user)
          : { profile: null, wallet: null };
        const finalName = profile?.full_name || metaName;
        const finalAvatar = profile?.avatar_url || metaAvatar;
        if (finalName) setUserName(finalName);
        if (finalAvatar) {
          setUserProfile((prev) => ({
            ...prev,
            name: finalName || prev.name,
            avatar: finalAvatar
          }));
        }
        // (S27) Fuente de verdad del saldo: balance_valens (lo mueve la RPC).
        // valens_balance es una columna legada que quedó desfasada tras cada
        // transferencia P2P; se usa solo como respaldo si la canónica falta.
        const canonicalBalance = wallet
          ? Number(wallet.balance_valens ?? wallet.balance_val ?? wallet.valens_balance)
          : NaN;
        if (Number.isFinite(canonicalBalance)) {
          setBalance(canonicalBalance);
        }

        // (S11) Dirección Valens persistente + saldo e historial reales.
        await loadWalletIdentity(user.id);
      } catch (err) {
        console.warn('Advertencia al sincronizar perfil en segundo plano:', err);
      }
    };

    const processAuth = async () => {
      // 1. Extraer tokens explícitos desde la URL si venimos del redirect de Google
      const urlTokens = extractTokensFromUrl();
      if (urlTokens?.accessToken) {
        console.info('[Auth] Token detectado en URL, estableciendo sesión...');

        try {
          // Establecer la sesión ANTES de sincronizar perfil/billetera,
          // para que las escrituras pasen las políticas RLS (auth.uid()).
          const { data: setSessionData, error: setSessionErr } = await supabase.auth.setSession({
            access_token: urlTokens.accessToken,
            refresh_token: urlTokens.refreshToken || ''
          });
          if (setSessionData?.session?.user) {
            await handleUserSession(setSessionData.session.user);
          }
        } catch (err) {
          console.warn('[Auth] Error en supabase.auth.setSession:', err);
        }

        // Limpiar URL de forma segura sin recargar
        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }

      if (urlTokens?.code) {
        try {
          const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(urlTokens.code);
          if (exchangeData?.session?.user) {
            await handleUserSession(exchangeData.session.user);
          }
          if (typeof window !== 'undefined' && window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
          }
          return;
        } catch (e) {
          console.warn('[Auth] Error intercambiando código OAuth:', e);
        }
      }

      // 2. Si no hay tokens en la URL, verificar sesión existente en Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await handleUserSession(session.user);
          return;
        }
      } catch (e) {}

      // 3. Fallback a almacenamiento local si no hay sesión activa en Supabase
      try {
        const localUser = await authService.getUser();
        if (localUser) {
          await handleUserSession(localUser);
        }
      } catch (e) {}
    };

    processAuth();

    // 4. Escuchar eventos de cambio de autenticación en tiempo real (OAuth Redirects, Login, Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[Auth Event]', event);
      if (session?.user) {
        await handleUserSession(session.user);
        if (event === 'SIGNED_IN') {
          const userNameLabel = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Google';
          showToast(`¡Bienvenido, ${userNameLabel}! Sesión conectada.`, 'success');
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setWalletAddress('');
        setSchoolRewardClaimed(false);
        localStorage.removeItem('gremami_auth_user');
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // 3. Seguimiento GPS Continuo en Tiempo Real (watchPosition) con sincronización en Supabase
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('geolocation' in navigator) || !navigator.geolocation) return;

    let lastSentTimestamp = 0;
    let watchId = null;

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!pos || !pos.coords) return;
          const { latitude, longitude, accuracy } = pos.coords;
          const coords = [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))];
          setUserGpsCoords(coords);
          setUserGpsAccuracy(accuracy);
          setHasLiveGps(true);

          // Si el usuario está autenticado, actualizar posición en Supabase con throttle de 15 segundos
          const now = Date.now();
          if (currentUser?.id && isSupabaseConfigured && (now - lastSentTimestamp > 15000)) {
            lastSentTimestamp = now;
            profileService.updateLocation(currentUser.id, {
              lat: coords[0],
              lng: coords[1]
            }).catch(() => {});
          }
        },
        (err) => {
          console.warn('AppContext GPS aviso:', err?.message);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 4000 }
      );
    } catch (e) {
      console.warn('AppContext error al iniciar watchPosition:', e);
    }

    return () => {
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (e) {}
      }
    };
  }, [currentUser?.id]);

  // 4. Suscripción Realtime a Supabase: Perfiles y Ubicaciones de Cadetes en Alta Gracia
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Cargar cadetes remotos activos en primera instancia
    profileService.getOnlineCadetes().then((onlineProfiles) => {
      if (onlineProfiles && onlineProfiles.length > 0) {
        setPeers((prevPeers) => {
          const merged = [...prevPeers];
          onlineProfiles.forEach((remote) => {
            const idx = merged.findIndex((p) => p.id === remote.id);
            const peerData = {
              id: remote.id,
              name: remote.full_name || 'Cadete Gremami',
              category: remote.vehicle_type === 'bicicleta' ? 'bicicleta' :
                remote.vehicle_type === 'caminando' ? 'caminando' :
                remote.vehicle_type === 'auto' ? 'automovil' :
                remote.vehicle_type === 'flete' ? 'fletes' : 'motocicleta',
              serviceModality: remote.service_modality || 'mixto',
              lat: remote.lat,
              lng: remote.lng,
              is_online: remote.is_online,
              avatar: remote.avatar_url,
              phone: remote.whatsapp,
              rating: 5.0
            };
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...peerData };
            } else {
              merged.push(peerData);
            }
          });
          return merged;
        });
      }
    }).catch(() => {});

    // Suscripción a cambios en vivo en la tabla profiles (movimiento GPS en tiempo real).
    // NOTA: el canal se construye inline (no vía profileService.subscribeToProfiles) porque
    // ese helper no retorna el canal y su cleanup es un no-op: el canal queda huérfano en
    // supabase.channels y, al re-montar (React StrictMode), supabase.channel() devuelve la
    // instancia YA suscrita y .on() lanza:
    // "cannot add postgres_changes callbacks ... after subscribe()".
    const REALTIME_TOPIC = 'realtime:public:profiles';

    // Purga defensiva de canales huérfanos del mismo topic (HMR / montajes previos).
    try {
      supabase
        .getChannels()
        .filter((c) => c.topic === REALTIME_TOPIC)
        .forEach((c) => supabase.removeChannel(c));
    } catch (e) {
      console.warn('Aviso al purgar canales Realtime huérfanos:', e?.message);
    }

    let disposed = false;

    // Orden obligatorio: channel() -> on('postgres_changes') -> subscribe()
    const channel = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          if (disposed || !payload?.new) return;
          const u = payload.new;
          setPeers((prevPeers) => {
            const idx = prevPeers.findIndex((p) => p.id === u.id);
            const peerData = {
              id: u.id,
              name: u.full_name || 'Cadete Gremami',
              category: u.vehicle_type === 'bicicleta' ? 'bicicleta' :
                u.vehicle_type === 'caminando' ? 'caminando' :
                u.vehicle_type === 'auto' ? 'automovil' :
                u.vehicle_type === 'flete' ? 'fletes' : 'motocicleta',
              serviceModality: u.service_modality || 'mixto',
              lat: u.lat,
              lng: u.lng,
              is_online: u.is_online,
              avatar: u.avatar_url,
              phone: u.whatsapp,
              rating: 5.0
            };
            if (idx >= 0) {
              const next = [...prevPeers];
              next[idx] = { ...next[idx], ...peerData };
              return next;
            }
            return [...prevPeers, peerData];
          });
        }
      )
      .subscribe();

    return () => {
      disposed = true;
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('Aviso al cerrar canal Realtime:', e?.message);
      }
    };
  }, []);



  // Helper to switch role with feedback
  const handleSetRole = (newRole) => {
    setRole(newRole);
    if (newRole === 'cadete') {
      setIsGpsActive(true);
      if (balance < 1.0) {
        showToast('⚠️ Saldo insuficiente (< 1 VALENS) para operar como Cadete', 'warning');
      } else {
        showToast('🟢 Modo Cadete: Visibilidad GPS y radar activa', 'success');
      }
    } else {
      showToast('👤 Modo Cliente: Selecciona una categoría de servicio', 'info');
    }
  };

  // Select category from Home screen and navigate directly to the filtered Map
  const selectCategoryAndGoToMap = (categoryId) => {
    setSelectedCategoryFilter(categoryId);
    setActiveTab('map');
    const categoryObj = PEER_CATEGORIES.find((c) => c.id === categoryId);
    if (categoryObj) {
      showToast(`📍 Mostrando: ${categoryObj.title}`, 'info');
    }
  };

  // Start chat with a specific peer and open chat tab
  const startChatWithPeer = (peer) => {
    setSelectedPeer(null); // close bottom drawer
    if (peer) {
      setPeers((prev) => {
        if (!prev.find((p) => p.id === peer.id)) {
          return [peer, ...prev];
        }
        return prev;
      });
      setActiveChatPeerId(peer.id);
    }
    setActiveTab('chat');
  };

  // Send a regular text message in active chat
  const sendTextMessage = (peerId, text) => {
    if (!text.trim()) return;

    const newMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), newMessage]
    }));

    // Auto simulated response from peer
    setTimeout(() => {
      const currentPeer = peers.find((p) => p.id === peerId);
      const peerName = currentPeer ? currentPeer.name : 'Contacto';
      
      let replyText = '¡Entendido! Recibí tu mensaje. Estoy disponible para coordinar la entrega.';
      if (text.toLowerCase().includes('hola') || text.toLowerCase().includes('buenas')) {
        replyText = `¡Hola! ¿Cómo estás? ¿Qué paquete o pedido necesitas retirar?`;
      } else if (text.toLowerCase().includes('precio') || text.toLowerCase().includes('cuanto') || text.toLowerCase().includes('tarifa')) {
        replyText = `La tarifa sugerida es $1 USD / $1,250 ARS en efectivo o equivalente en ValensCoin.`;
      } else if (text.toLowerCase().includes('paquete') || text.toLowerCase().includes('sobre') || text.toLowerCase().includes('pedido')) {
        replyText = `Perfecto. Pasame los datos de retiro y entrega para calcular la ruta exacta.`;
      }

      const replyMsg = {
        id: `msg-reply-${Date.now()}`,
        sender: 'peer',
        senderName: peerName,
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
      };

      setMessages((prev) => ({
        ...prev,
        [peerId]: [...(prev[peerId] || []), replyMsg]
      }));
    }, 1200);
  };

  // Quick Action: Acordar Pago Local ($1 USD)
  const agreeCashPayment = (peerId, details = {}) => {
    const agreementMsg = {
      id: `cash-${Date.now()}`,
      sender: 'user',
      type: 'cash_agreement',
      amount: '$1.00 USD / $1,250 ARS',
      currency: 'Efectivo Local',
      status: 'Acordado en Mano',
      note: details.note || 'Entrega estándar acordada de forma soberana sin intermediarios',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), agreementMsg]
    }));

    showToast('🤝 Acuerdo de $1 USD en efectivo registrado en el chat', 'success');

    // Peer acceptance response
    setTimeout(() => {
      const peerConfirmMsg = {
        id: `peer-ack-${Date.now()}`,
        sender: 'peer',
        senderName: peers.find(p => p.id === peerId)?.name || 'Cadete',
        text: '✅ Acuerdo de pago local aceptado. Iniciando ruta hacia el punto de retiro.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
      };

      setMessages((prev) => ({
        ...prev,
        [peerId]: [...(prev[peerId] || []), peerConfirmMsg]
      }));
    }, 1000);
  };

  // Quick Action: Enviar 1 ValensCoin de Agradecimiento vía QR / directo (enteros)
  const sendValensTip = (peerId, tipAmount = 1) => {
    const intTip = Math.max(1, Math.floor(tipAmount));
    if (Math.floor(balance) < intTip) {
      showToast('❌ Saldo insuficiente en Valens Testnet. Usa el Grifo Faucet para recargar.', 'error');
      return { success: false, error: 'insufficient_funds' };
    }

    const peer = peers.find((p) => p.id === peerId) || { name: 'Compañero P2P', address: 'valens1q...' };
    const txHash = '0x' + Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('') + '...' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    // Deduct balance (entero)
    setBalance((prev) => Math.max(0, Math.floor(prev) - intTip));

    // Register transaction
    const newTx = {
      id: `tx-${Date.now()}`,
      type: 'tip_sent',
      amount: -intTip,
      title: `Propina a ${peer.name}`,
      date: 'Recién',
      hash: txHash,
      status: 'Confirmado',
      note: 'Agradecimiento P2P instantáneo vía Valens Testnet'
    };

    setTransactions((prev) => [newTx, ...prev]);

    // Send tip bubble in chat
    const tipMsg = {
      id: `tip-${Date.now()}`,
      sender: 'user',
      type: 'valens_tip',
      amount: `${intTip} VAL`,
      txHash: txHash,
      recipient: peer.name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), tipMsg]
    }));

    showToast(`⚡ ¡Enviado ${intTip} VAL de agradecimiento a ${peer.name}!`, 'success');

    // Peer gratitude reply
    setTimeout(() => {
      const thankMsg = {
        id: `peer-thanks-${Date.now()}`,
        sender: 'peer',
        senderName: peer.name,
        text: `🦅 ¡Muchísimas gracias por el ${intTip} VAL de propina! Calificación de 5 estrellas agregada a tu perfil. ⭐⭐⭐⭐⭐`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
      };

      setMessages((prev) => ({
        ...prev,
        [peerId]: [...(prev[peerId] || []), thankMsg]
      }));
    }, 1500);

    return { success: true, txHash };
  };

  // Testnet Faucet (+5 VAL enteros) — RPC atómica con fallback local
  const requestFaucet = async () => {
    const { txHash: faucetTxHash } = localClaimFaucet(balance);
    const intFaucetAmount = 5;

    // Actualizar saldo localmente de inmediato (entero estricto)
    setBalance((prev) => Math.floor(prev) + intFaucetAmount);

    const newTx = {
      id: `tx-faucet-${Date.now()}`,
      type: 'faucet',
      amount: intFaucetAmount,
      title: 'Recarga Testnet Faucet',
      date: 'Recién',
      hash: faucetTxHash,
      status: 'Confirmado',
      note: 'Grifo de prueba ValensCoin (+5 VAL)'
    };

    setTransactions((prev) => [newTx, ...prev]);
    showToast('🚰 +5 VAL recibidos exitosamente desde el Grifo Testnet', 'success');

    // Intentar RPC remota en segundo plano
    if (currentUser?.id) {
      valensService.claimFaucet(currentUser.id).catch(() => {});
    }
  };

  // Transferir VAL a otra dirección (enteros estrictos, 0 decimales).
  // (S11) Con sesión Supabase la RPC es la fuente de verdad: primero se confirma
  // en el servidor (débito atómico anti-doble-gasto) y recién después se
  // refrescan saldo e historial. El fallback local queda solo para invitados.
  const transferTokens = async (receiverAddress, amount) => {
    const intAmount = Math.floor(Number(amount));
    const address = String(receiverAddress || '').trim();

    if (!Number.isFinite(intAmount) || intAmount <= 0) {
      showToast('❌ El monto debe ser un número entero mayor a 0 VAL.', 'error');
      return { success: false, error: 'invalid_amount' };
    }
    // (S25) Aceptar el formato real de la base (`vlx1...`) y el legado (`valens1q...`).
    if (!/^(?:vlx1|valens1q)/i.test(address)) {
      showToast('❌ Dirección inválida. Debe ser una dirección vlx1...', 'error');
      return { success: false, error: 'invalid_address' };
    }

    const senderId = currentUser?.id;
    const canUseRemote = Boolean(isSupabaseConfigured && senderId && isUuid(senderId));

    if (canUseRemote) {
      const result = await valensService.transferTokens({
        senderId,
        receiverAddress: address,
        amount: intAmount
      });

      if (!result?.success) {
        showToast(`❌ ${result?.error || 'La transferencia no pudo completarse.'}`, 'error');
        return { success: false, error: result?.error || 'transfer_failed' };
      }

      // Refrescar saldo e historial reales desde Supabase.
      await applyWalletSnapshot(senderId);

      showToast(`⚡ ${intAmount} VAL enviados a ${address.slice(0, 14)}...`, 'success');
      return { success: true, remote: true, txHash: result.tx_hash || null, amount: intAmount };
    }

    // Fallback local: solo sin sesión Supabase (modo demo/offline).
    if (Math.floor(balance) < intAmount) {
      showToast(`❌ Saldo insuficiente. Tienes ${Math.floor(balance)} VAL disponibles.`, 'error');
      return { success: false, error: 'insufficient_funds' };
    }

    const { success, txHash, error: localErr } = localTransferTokens({
      fromAddress: walletAddress || userPublicKey,
      toAddress: address,
      amount: intAmount,
      senderWallet: { balance_valens: Math.floor(balance) }
    });

    if (!success) {
      showToast(`❌ ${localErr}`, 'error');
      return { success: false, error: localErr };
    }

    // Deducir del saldo local (entero)
    setBalance((prev) => Math.floor(prev) - intAmount);

    const newTx = {
      id: `tx-transfer-${Date.now()}`,
      type: 'transfer',
      amount: -intAmount,
      title: `Envío a ${address.slice(0, 14)}...`,
      date: 'Recién',
      hash: txHash,
      status: 'Confirmado (local)',
      note: `Transferencia P2P de ${intAmount} VAL`
    };
    setTransactions((prev) => [newTx, ...prev]);
    showToast(`⚡ ${intAmount} VAL enviados a ${address.slice(0, 14)}...`, 'success');

    return { success: true, local: true, txHash, amount: intAmount };
  };

  // (S11) Escuela Cripto: reclama la recompensa real de +5 VAL (una sola vez).
  const claimSchoolReward = async (quizScore) => {
    const intScore = Math.floor(Number(quizScore));

    if (!Number.isFinite(intScore) || intScore < 4 || intScore > 5) {
      showToast('❌ Necesitás al menos 4/5 respuestas correctas para reclamar la recompensa.', 'error');
      return { success: false, error: 'quiz_not_passed' };
    }
    if (schoolRewardClaimed) {
      showToast('🎓 La recompensa de 5 VAL ya fue reclamada.', 'info');
      return { success: false, already_claimed: true };
    }

    const senderId = currentUser?.id;
    const canUseRemote = Boolean(isSupabaseConfigured && senderId && isUuid(senderId));

    if (!canUseRemote) {
      // Invitado sin sesión Supabase: recompensa una única vez por dispositivo.
      persistSchoolRewardClaimed(true);
      setBalance((prev) => Math.floor(prev) + 5);
      setTransactions((prev) => [
        {
          id: `tx-school-${Date.now()}`,
          type: 'school_reward',
          amount: 5,
          title: 'Escuela Cripto P2P',
          date: 'Recién',
          hash: '0xschoolrewa',
          status: 'Confirmado (local)',
          note: 'Recompensa educativa +5 VAL (modo local sin sesión)'
        },
        ...prev
      ]);
      showToast('🎓 ¡Aprobaste la Escuela Cripto! +5 VAL acreditados (modo local).', 'success');
      return { success: true, local: true, amount: 5 };
    }

    const result = await valensService.claimSchoolReward(intScore);

    if (result?.success) {
      persistSchoolRewardClaimed(true);
      await applyWalletSnapshot(senderId);
      showToast(`🎓 ¡Aprobaste con ${intScore}/5! +5 VAL acreditados en tu billetera Valens.`, 'success');
      return { ...result, success: true };
    }

    if (result?.already_claimed) {
      persistSchoolRewardClaimed(true);
      showToast('🎓 La recompensa de 5 VAL ya fue reclamada.', 'info');
      return { ...result, already_claimed: true };
    }

    showToast(`❌ ${result?.error || 'No se pudo reclamar la recompensa.'}`, 'error');
    return { success: false, error: result?.error || 'school_reward_failed' };
  };

  // Función de Búsqueda de Usuarios Públicos (por correo, nick o nombre en tiempo real)
  const searchUsers = async (query) => {
    if (!query || !query.trim()) return MOCK_COMMUNITY_USERS;
    const cleanQuery = query.trim().toLowerCase();

    // 1. Búsqueda remota en Supabase
    let remoteUsers = [];
    try {
      remoteUsers = await profileService.searchUsers(cleanQuery);
    } catch (err) {
      console.warn('Fallo búsqueda remota:', err);
    }

    // 2. Búsqueda local en MOCK_COMMUNITY_USERS
    const mockMatches = (MOCK_COMMUNITY_USERS || []).filter((u) => {
      const matchName = u.name?.toLowerCase().includes(cleanQuery);
      const matchUser = u.username?.toLowerCase().includes(cleanQuery);
      const matchEmail = u.email?.toLowerCase().includes(cleanQuery);
      const matchAddr = u.address?.toLowerCase().includes(cleanQuery);
      return matchName || matchUser || matchEmail || matchAddr;
    });

    // 3. Búsqueda en peers del mapa (60 nodos de Alta Gracia)
    const peerMatches = (peers || []).filter((p) => {
      const matchName = p.name?.toLowerCase().includes(cleanQuery);
      const matchRole = p.role?.toLowerCase().includes(cleanQuery);
      const matchZone = p.locality?.toLowerCase().includes(cleanQuery) || p.zone?.toLowerCase().includes(cleanQuery);
      const matchAddr = p.address?.toLowerCase().includes(cleanQuery);
      return matchName || matchRole || matchZone || matchAddr;
    }).map((p) => ({
      id: p.id,
      name: p.name,
      username: p.name?.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      email: `${p.name?.toLowerCase().replace(/[^a-z0-9]/g, '')}@gremami.test`,
      role: p.type || 'cadete',
      roleLabel: p.role || 'Cadete P2P',
      avatar: p.avatar,
      rating: p.rating || 4.9,
      reviewsCount: p.reviewsCount || 25,
      completedAgreements: p.completedDeliveries || 40,
      address: p.address || `valens1q${p.id}p2p`,
      isOnline: Boolean(p.isOnline),
      coverageZone: p.locationLabel || p.locality || 'Alta Gracia',
      vehicle: p.vehicle || 'Vehículo P2P',
      badges: ['Prestador Activo', p.locality || 'Alta Gracia'],
      bio: p.description || 'Miembro de la red P2P de Alta Gracia.',
      reviews: [
        {
          id: `rev-${p.id}`,
          author: 'Cliente de la Comunidad',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          stars: 5,
          date: 'Esta semana',
          comment: 'Servicio verificado en el mapa radar de Alta Gracia.'
        }
      ]
    }));

    // Consolidar resultados sin duplicados
    const combined = [...remoteUsers, ...mockMatches, ...peerMatches];
    const seen = new Set();
    const unique = [];
    for (const u of combined) {
      const key = u.id || u.username || u.name;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(u);
      }
    }
    return unique;
  };

  // Toggle Theme: Modo Noche (Cripto Dark) vs Modo Día (High Contrast)
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gremami_theme', next);
      showToast(
        next === 'dark'
          ? '🌙 Modo Noche (Cripto Dark) activado'
          : '☀️ Modo Día (High Contrast Urbano) activado',
        'info'
      );
      return next;
    });
  };

  // Sistema Antifraude: Generar nuevo PIN dinámico
  // (S09.6c) Generador CSPRNG reutilizable por pedido
  const generateSecurePin = () => {
    const buf = new Uint32Array(1);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(buf);
    } else {
      buf[0] = Math.floor(Math.random() * 0xffffffff);
    }
    return String(1000 + (buf[0] % 9000));
  };

  // (S09.6c) Mapa de PINs por orden, persistido en localStorage
  const registerOrderPin = (orderId, pin) => {
    if (!orderId || !pin) return;
    setPinsByOrder((prev) => {
      const next = { ...prev, [orderId]: String(pin) };
      try { localStorage.setItem('gremami_pins', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const getOrderPin = (orderId) => {
    if (orderId && pinsByOrder[orderId]) return pinsByOrder[orderId];
    return orderPin;
  };

  const generateNewPin = () => {
    const newCode = generateSecurePin();
    setOrderPin(newCode);
    setPinStatus('pending');
    setPinFailedAttempts(0);
    setIsPinLocked(false);
    showToast(`🔐 Nuevo PIN Antifraude generado: ${newCode}`, 'info');
    return newCode;
  };

  // Reenviar PIN por Chat P2P
  const resendPinViaChat = (peerId = null) => {
    const targetChatId = peerId || activeChatPeerId;
    const notice = {
      id: `resend-pin-${Date.now()}`,
      sender: 'user',
      type: 'pin_reminder',
      text: `🔐 [PIN Antifraude]: Mi código de 4 dígitos para entrega en mano es "${orderPin}". Recuerda validar contra el pago en dinero local (ARS).`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (targetChatId) {
      setMessages((prev) => ({
        ...prev,
        [targetChatId]: [...(prev[targetChatId] || []), notice]
      }));
    }

    setPinFailedAttempts(0);
    setIsPinLocked(false);
    playP2PAlertChime();
    showToast(`📨 PIN reenviado al chat P2P y campo desbloqueado.`, 'success');
  };

  // Contactar Soporte Comunitario Descentralizado
  const contactCommunitySupport = () => {
    playP2PAlertChime();
    showToast(`🤝 Contactando soporte comunitario descentralizado de Alta Gracia. Un árbitro voluntario asistirá en la validación.`, 'info');
  };

  const resetPinAttempts = () => {
    setPinFailedAttempts(0);
    setIsPinLocked(false);
    showToast('🔓 Intentos de PIN reiniciados.', 'info');
  };

  const closeCelebrationModal = () => {
    setCelebrationData(null);
  };

  // 2. Flujo de Pago Físico, Recaudación Fiduciaria y Liberación de ValensCoin mediante PIN
  const completeDeliveryWithPin = async (inputPin, peerId = null, rewardAmount = 1.0, agreedFeeArs = 2000) => {
    if (isPinLocked) {
      showToast('⚠️ Campo bloqueado temporalmente tras 3 intentos. Reenvía el PIN por chat o contacta soporte.', 'warning');
      return { success: false, locked: true };
    }

    const currentPeerObj = peers.find((p) => p.id === (peerId || activeChatPeerId)) || peers[0];
    const peerName = currentPeerObj?.name || 'Cadete / Comercio';

    // Manejo de PIN Incorrecto (Seguridad P2P)
    if (!inputPin || inputPin.trim() !== orderPin) {
      const nextFailed = pinFailedAttempts + 1;
      setPinFailedAttempts(nextFailed);
      playP2PAlertChime();

      if (nextFailed >= 3) {
        setIsPinLocked(true);
        showToast('⚠️ 3 intentos fallidos consecutivos. Campo bloqueado por seguridad P2P.', 'error');
        return { success: false, locked: true, attempts: nextFailed };
      } else {
        showToast(`❌ PIN incorrecto (Intento ${nextFailed}/3). Solicita al cliente su código de 4 dígitos.`, 'error');
        return { success: false, locked: false, attempts: nextFailed };
      }
    }

    // (S08) Verificación AUTORITATIVA en el servidor.
    // El cliente fija el hash del PIN en la orden y la liberación se resuelve
    // comparando hashes dentro de release_reward_by_pin (nunca texto plano).
    const authUid = isUuid(currentUser?.id) ? currentUser.id : null;
    let orderIdForPin = null;

    if (authUid) {
      try {
        orderIdForPin = newUuid();

        const orderRes = await saveOrderToSupabase({
          id: orderIdForPin,
          client_id: authUid,
          cadete_id: authUid,
          title: `Entrega verificada con PIN — ${peerName}`,
          description: `Entrega P2P validada con PIN para ${peerName}`,
          category: 'moto',
          status: 'pendiente',
          origin_address: 'Centro Alta Gracia',
          destination_address: 'Destino Verificado',
          price_ars: Number(agreedFeeArs || 2000),
          reward_val: Number(rewardAmount || 1.0),
          delivery_pin: null
        });

        if (!orderRes.remote && orderRes.reason !== 'already-exists') {
          showToast('⚠️ No se pudo registrar la orden en el servidor. La entrega no se liberó.', 'warning');
          return { success: false, locked: false, error: 'order-not-persisted' };
        }

        const pinSet = await pinService.setOrderPin(orderIdForPin, orderPin);
        if (!pinSet.success) {
          showToast(`⚠️ No se pudo registrar el PIN: ${pinSet.error?.message || 'error'}`, 'warning');
          return { success: false, locked: false, error: 'pin-not-set' };
        }

        const release = await pinService.releaseReward(orderIdForPin, inputPin, authUid);
        if (!release.success) {
          const nextFailed = pinFailedAttempts + 1;
          setPinFailedAttempts(nextFailed);
          playP2PAlertChime();
          if (nextFailed >= 3) {
            setIsPinLocked(true);
            showToast('⚠️ 3 intentos fallidos consecutivos. Campo bloqueado por seguridad P2P.', 'error');
            return { success: false, locked: true, attempts: nextFailed };
          }
          showToast(`❌ ${release.error?.message || 'PIN incorrecto'} (Intento ${nextFailed}/3).`, 'error');
          return { success: false, locked: false, attempts: nextFailed };
        }
      } catch (err) {
        console.error('[S08] Error verificando PIN en el servidor:', err);
        showToast('⚠️ No se pudo verificar el PIN con el servidor.', 'warning');
        return { success: false, locked: false, error: 'network' };
      }
    } else {
      showToast('⚠️ PIN validado localmente (sin sesión: no se verificó en el servidor).', 'warning');
    }

    // PIN Correcto!
    setPinFailedAttempts(0);
    setIsPinLocked(false);
    setPinStatus('verified');

    const isCadeteUser = role === 'cadete';
    const finalFeeArs = Number(agreedFeeArs || 2000);
    const finalRewardVal = Number(rewardAmount || 1.0);

    // Acreditar simultáneamente el token en el balance (+1.0 VAL)
    setBalance((prev) => +(prev + finalRewardVal).toFixed(2));

    // (S07/S08) authUid y orderIdForPin ya se resolvieron en la verificación del PIN.
    const deliveryId = authUid ? newUuid() : `del-${Date.now()}`;
    const orderId = orderIdForPin || `ord-${Date.now()}`;

    // 1. Persistencia en Supabase: primero la orden y después la entrega
    //    (deliveries.order_id tiene FK a orders.id, así que el orden importa).
    //    (S08) El PIN ya se verificó arriba contra el servidor; aquí solo se
    //    registran los efectos secundarios sin bloquear la UI.
    const deliveryPayload = {
      delivery_id: deliveryId,
      order_id: orderId,
      cadet_id: authUid || CURRENT_CADET_ID,
      client_name: peerName,
      amount_ars: finalFeeArs,
      amount_val: finalRewardVal,
      pin: inputPin,
      created_at: new Date().toISOString()
    };

    if (authUid) {
      persistDeliveryWithOrder({
        order: {
          id: orderId,
          client_id: authUid,
          cadete_id: authUid,
          title: `Entrega verificada con PIN — ${peerName}`,
          description: `Entrega P2P validada con PIN para ${peerName}`,
          category: 'moto',
          status: 'completado',
          origin_address: 'Centro Alta Gracia',
          destination_address: 'Destino Verificado',
          price_ars: finalFeeArs,
          reward_val: finalRewardVal,
          delivery_pin: inputPin
        },
        delivery: deliveryPayload
      })
        .then((res) => {
          const warning = persistenceWarning(res);
          if (warning) {
            console.warn('[S07.5] Entrega no sincronizada:', res);
            showToast(warning, 'warning');
          }
        })
        .catch((err) => {
          console.error('[S07.5] Error inesperado al guardar entrega:', err);
          showToast('⚠️ La entrega quedó solo en este dispositivo.', 'warning');
        });
    } else {
      recordDeliveryTransactionInSupabase(deliveryPayload)
        .then(() => {
          showToast('⚠️ Entrega verificada localmente (sin sesión: no se sincronizó).', 'warning');
        })
        .catch((err) => {
          console.warn('Aviso de respaldo local de entrega (sin sesión):', err?.message || err);
        });
    }

    // 2. Registrar en historial de órdenes y entregas (ordersHistory)
    const newCadetRecord = {
      id: deliveryId,
      date: 'Recién',
      counterpart: `${peerName} (Cliente)`,
      route: 'Centro Alta Gracia ➔ Destino Verificado',
      amountArs: finalFeeArs,
      amount_ars: finalFeeArs,
      amountUsd: +(finalFeeArs / EXCHANGE_RATES.ARS_PER_USD).toFixed(2),
      valensEarned: finalRewardVal,
      amount_val: finalRewardVal,
      status: 'Completado',
      commissionSavedArs: Math.round(finalFeeArs * 0.30),
      pin: inputPin,
      pinVerified: true,
      timestamp: new Date().toISOString()
    };

    const newClientRecord = {
      id: orderId,
      date: 'Recién',
      counterpart: `${peerName} (Prestador)`,
      route: 'Centro Alta Gracia ➔ Destino Verificado',
      amountArs: finalFeeArs,
      amount_ars: finalFeeArs,
      amountUsd: +(finalFeeArs / EXCHANGE_RATES.ARS_PER_USD).toFixed(2),
      valensReward: finalRewardVal,
      amount_val: finalRewardVal,
      status: 'Completado',
      savingsArs: Math.round(finalFeeArs * 0.30),
      pin: inputPin,
      pinVerified: true,
      timestamp: new Date().toISOString()
    };

    setOrdersHistory((prev) => {
      const updated = {
        cliente: [newClientRecord, ...(prev?.cliente || [])],
        cadete: [newCadetRecord, ...(prev?.cadete || [])]
      };
      try {
        localStorage.setItem('gremami_orders_history', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // 3. Actualizar hitos de perfil del prestador
    setUserProfile((prev) => {
      const next = {
        ...prev,
        milestones: {
          ...prev?.milestones,
          weeklyDeliveries: (prev?.milestones?.weeklyDeliveries || 12) + 1,
          totalTripsAllTime: (prev?.milestones?.totalTripsAllTime || 42) + 1,
          commissionsSavedArs: (prev?.milestones?.commissionsSavedArs || 48500) + Math.round(finalFeeArs * 0.30)
        }
      };
      try {
        localStorage.setItem('gremami_user_profile', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // 4. Registrar transacción en la red con desglose dual (amount_ars y amount_val)
    const txHash = '0xcb' + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('') + '...' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const rewardTx = {
      id: `tx-reward-${Date.now()}`,
      type: isCadeteUser ? 'delivery_earnings' : 'cashback_received',
      amount: +finalRewardVal,
      amount_val: +finalRewardVal,
      amountArs: finalFeeArs,
      amount_ars: finalFeeArs,
      title: isCadeteUser ? `Cobro de entrega completada (${peerName})` : `Cashback ValensCoin de ${peerName}`,
      date: 'Recién',
      hash: txHash,
      status: 'Confirmado (Bloque #840,135)',
      note: `Pago de $${finalFeeArs.toLocaleString('es-AR')} ARS recibido sin comisiones + ${finalRewardVal} VAL acreditado (PIN Verificado)`
    };
    setTransactions((prev) => [rewardTx, ...prev]);

    // 5. Mensaje automático en el chat P2P
    const systemNoticeMsg = {
      id: `pin-success-${Date.now()}`,
      sender: 'system',
      type: 'delivery_completed',
      text: `🎉 ¡Entrega verificada exitosamente! Pago fiduciario de $${finalFeeArs.toLocaleString('es-AR')} ARS acreditado al prestador (0% comisión corporativa) y +${finalRewardVal} VAL en ValensCoin.`,
      rewardAmount: finalRewardVal,
      amountArs: finalFeeArs,
      txHash,
      peerName,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const targetChatId = peerId || activeChatPeerId;
    if (targetChatId) {
      setMessages((prev) => ({
        ...prev,
        [targetChatId]: [...(prev[targetChatId] || []), systemNoticeMsg]
      }));
    }

    // 6. Sonido festivo y Modal de Dopamina P2P
    playCelebrationSound();
    setCelebrationData({
      open: true,
      rewardAmount: finalRewardVal,
      amountArs: finalFeeArs,
      peerName,
      isCadete: isCadeteUser,
      txHash
    });

    showToast(`🎉 ¡Entrega verificada! +$${finalFeeArs.toLocaleString('es-AR')} ARS recaudados y +${finalRewardVal} VAL acreditados`, 'success');

    return { success: true, locked: false, rewardAmount: finalRewardVal, amountArs: finalFeeArs, peerName };
  };

  // Sistema Antifraude: Verificar PIN ingresado por el cadete
  const verifyPin = async (inputPin) => {
    const res = await completeDeliveryWithPin(inputPin);
    return Boolean(res?.success);
  };

  // 2. Sistema de Alertas y Notificaciones de Solicitudes en Vivo
  // ==================================================================
  // (S09.6a) Datos reales: pedidos del usuario y ofertas
  // ==================================================================
  const [myOrders, setMyOrders] = useState([]);

  const refreshMyOrders = async () => {
    const uid = isUuid(currentUser?.id) ? currentUser.id : null;
    if (!uid || !isSupabaseConfigured) {
      // (S14e) Sin sesión: devolver la MISMA referencia si ya estaba vacío.
      // Con un array nuevo en cada llamada, el efecto de ClientOrdersPanel
      // re-disparaba setState y producía "Maximum update depth exceeded".
      setMyOrders((prev) => (prev.length === 0 ? prev : []));
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(`client_id.eq.${uid},cadete_id.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('[S09.6a] No se pudieron leer mis pedidos:', error.message);
        return [];
      }
      // (S10c) Estabilidad referencial: si los datos son iguales, devolvemos el MISMO
      // array. React hace bail-out y se corta el bucle de renders que disparaba
      // ClientOrdersPanel al re-ejecutar su efecto en cada render del provider.
      setMyOrders((prev) => {
        const next = data || [];
        try {
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        } catch (e) {
          return next;
        }
      });
      return data || [];
    } catch (e) {
      console.warn('[S09.6a] Error inesperado leyendo mis pedidos:', e?.message || e);
      return [];
    }
  };

  const submitOfferReal = async ({ orderId, amountArs, note }) => {
    const uid = isUuid(currentUser?.id) ? currentUser.id : null;
    if (!uid) return { success: false, reason: 'no-session' };
    if (!orderId) return { success: false, reason: 'invalid-order' };
    try {
      return await offerService.submitOffer({
        order_id: orderId,
        cadete_id: uid,
        proposed_price_ars: Number(amountArs) || 2500,
        note
      });
    } catch (e) {
      return { success: false, error: e };
    }
  };

  const acceptOfferReal = async (offerId, orderId, cadeteId, priceArs) => {
    if (!offerId || !orderId) return { success: false, reason: 'invalid-params' };
    try {
      const res = await offerService.acceptOffer(offerId, orderId, cadeteId, Number(priceArs) || 2500);
      await refreshMyOrders();
      return res;
    } catch (e) {
      return { success: false, error: e };
    }
  };

  const getOrderOffersReal = async (orderId) => {
    if (!orderId) return [];
    try {
      return await offerService.getOffers(orderId);
    } catch (e) {
      return [];
    }
  };

  const createServiceRequest = ({ category, description, origin, destination, priceArs, scheduledFor = null, isUrgent = true }) => {
    const categoryInfo = PEER_CATEGORIES.find((c) => c.id === category);
    // (S07) Con sesión se usa un UUID real: el pedido persiste y las ofertas pueden
    // referenciarlo por FK (bids.order_id -> orders.id). Sin sesión, id local de siempre.
    const authUid = isUuid(currentUser?.id) ? currentUser.id : null;
    const requestId = authUid ? newUuid() : `req-live-${Date.now()}`;
    // (S09.4) El monto elegido en el bottom sheet se persiste en orders.price_ars.
    const finalPriceArs = Number(priceArs) > 0 ? Number(priceArs) : 2500;
    const newReq = {
      id: requestId,
      clientName: userName || 'Cliente Alta Gracia',
      category: category || 'bicicleta',
      categoryLabel: categoryInfo?.title || 'Servicio P2P',
      description: description?.trim() || 'Mandado / entrega rápida en Alta Gracia',
      origin: origin?.trim() || 'Centro de Alta Gracia (Tajamar / Belgrano)',
      destination: destination?.trim() || 'Bv. Pellegrini / Plaza Solares',
      distanceKm: '0.4 km',
      distanceMeters: 400,
      status: 'pending',
      timestamp: 'Recién',
      urgent: true,
      proposedFeeArs: finalPriceArs,
      proposedFeeValens: +(finalPriceArs / EXCHANGE_RATES.ARS_PER_VALENS).toFixed(2)
    };

    setLiveRequests((prev) => [newReq, ...prev]);
    playP2PAlertChime();

    // (S07.5) El toast refleja el resultado REAL de la persistencia, no un optimismo.
    if (authUid) {
      // (S09.6c) PIN único para este pedido (sin colisiones entre pedidos)
      const pinForOrder = generateSecurePin();
      registerOrderPin(requestId, pinForOrder);
      saveOrderToSupabase({
        id: requestId,
        client_id: authUid,
        title: `Pedido P2P — ${newReq.categoryLabel}`,
        description: newReq.description,
        category: newReq.category,
        status: 'pendiente',
        origin_address: newReq.origin,
        destination_address: newReq.destination,
        price_ars: finalPriceArs,
        reward_val: 1.0,
        // (S09.6a) Pedido urgente (scheduled_for = null)
        scheduled_for: scheduledFor || null,
        is_urgent: Boolean(isUrgent)
      })
        .then(async (res) => {
          // (S09.6c) Registrar el PIN del pedido en el backend (hash bcrypt)
          try {
            const pinRes = await pinService.setOrderPin(requestId, pinForOrder);
            if (!pinRes?.success) console.warn('[S09.6c] set_order_pin:', pinRes?.error);
          } catch (pinErr) {
            console.warn('[S09.6c] set_order_pin falló:', pinErr?.message || pinErr);
          }
          const warning = persistenceWarning(res);
          if (warning) {
            console.warn('[S07.5] Pedido no sincronizado:', res);
            showToast(warning, 'warning');
          } else {
            showToast('🚀 ¡Solicitud publicada y sincronizada!', 'success');
          }
        })
        .catch((err) => {
          console.error('[S07.5] Error inesperado al guardar pedido:', err);
          showToast('⚠️ Guardado localmente, pero falló la sincronización.', 'warning');
        });
    } else {
      showToast('🚀 ¡Solicitud publicada! (sin sesión: queda solo en este dispositivo)', 'warning');
    }

    return newReq;
  };

  // Enviar propuesta de tarifa directa (Modo Cadete)
  const sendFeeProposal = (requestId, proposedFeeArs = 2800, proposedFeeValens = 1.1) => {
    setLiveRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'proposal_sent',
              proposedFeeArs,
              proposedFeeValens
            }
          : r
      )
    );
    playP2PAlertChime();
    showToast(`📨 Propuesta de $${proposedFeeArs.toLocaleString('es-AR')} ARS enviada. Esperando aceptación mutua.`, 'success');
  };

  // Aceptar propuesta y conectar
  const acceptServiceRequest = (requestId, peerId = null) => {
    setLiveRequests((prev) =>
      prev.map((r) =>
        r.id === requestId ? { ...r, status: 'accepted' } : r
      )
    );
    if (peerId) {
      setAcceptedConnections((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
      setActiveChatPeerId(peerId);
      setActiveTab('chat');
    }
    setActiveAlert(null);
    playP2PAlertChime();
    showToast('🤝 ¡Propuesta aceptada! Chat P2P directo habilitado con éxito.', 'success');
  };

  const dismissAlert = () => {
    setActiveAlert(null);
  };

  // Disparar alarma sonora de prueba (sin pop-up flotante)
  const triggerAlertTest = () => {
    playP2PAlertChime();
  };

  // 3. Flujo de Habilitación Condicional del Chat P2P
  const unlockChatConnection = (peerId) => {
    setAcceptedConnections((prev) => {
      if (prev.includes(peerId)) return prev;
      return [...prev, peerId];
    });
    const targetPeer = peers.find((p) => p.id === peerId);
    playP2PAlertChime();
    showToast(`✅ Conexión aceptada con ${targetPeer ? targetPeer.name : 'el prestador'}. Chat directo P2P habilitado.`, 'success');
  };

  const isChatUnlocked = (peerId) => {
    return acceptedConnections.includes(peerId);
  };

  // 4. Solicitud P2P de Imagen de DNI (Intercambio Voluntario entre Cliente y Prestador)
  const requestDniVerification = (peerId) => {
    setDniRequests((prev) => ({ ...prev, [peerId]: 'pending' }));

    // Asegurar que el chat esté habilitado con este prestador
    if (!acceptedConnections.includes(peerId)) {
      setAcceptedConnections((prev) => [...prev, peerId]);
    }
    setActiveChatPeerId(peerId);

    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'el prestador';

    const reqMsg = {
      id: `dni-req-${Date.now()}`,
      sender: 'user',
      senderName: userName || 'Cliente',
      type: 'dni_request',
      status: 'pending',
      peerId,
      text: '🪪 Solicitud P2P de Imagen de DNI: El cliente ha solicitado voluntariamente la confirmación de identidad para mayor transparencia en la entrega activa.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), reqMsg]
    }));

    playP2PAlertChime();
    showToast(`🪪 Solicitud de verificación de DNI enviada a ${peerName} por el Chat P2P.`, 'info');

    // Simulación reactiva: si el rol es cliente, el prestador responde aceptando para permitir la verificación
    if (role !== 'cadete') {
      setTimeout(() => {
        acceptDniVerification(peerId);
      }, 2000);
    }
  };

  const acceptDniVerification = (peerId) => {
    setDniRequests((prev) => ({ ...prev, [peerId]: 'accepted' }));

    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'Prestador';
    const dniImage = targetPeer?.idDocumentUrl || "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop&q=80";

    const acceptMsg = {
      id: `dni-accepted-${Date.now()}`,
      sender: 'peer',
      senderName: peerName,
      type: 'dni_verified',
      status: 'accepted',
      peerId,
      idDocumentUrl: dniImage,
      text: '🛡️ Identidad Confirmada: El prestador ha aceptado compartir la imagen protegida de su DNI. Visualización habilitada temporalmente para esta entrega activa.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), acceptMsg]
    }));

    playP2PAlertChime();
    showToast(`🛡️ ${peerName} aceptó compartir su DNI protegido en la sala de chat.`, 'success');
  };

  const rejectDniVerification = (peerId) => {
    setDniRequests((prev) => ({ ...prev, [peerId]: 'rejected' }));

    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'Prestador';

    const rejectMsg = {
      id: `dni-reject-${Date.now()}`,
      sender: 'peer',
      senderName: peerName,
      type: 'text',
      text: 'ℹ️ Solicitud de DNI: El prestador prefirió no compartir su documento en este momento.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), rejectMsg]
    }));

    showToast(`ℹ️ La solicitud de DNI no fue aceptada por ${peerName}.`, 'info');
  };

  const getDniVerificationStatus = (peerId) => {
    return dniRequests[peerId] || 'none';
  };

  // 4.5. Sistema de Subasta P2P y Envíos Programados
  const createAuctionRequest = ({ origin, destination, description, scheduledTime, estimatedFeeArs, category = 'bicicleta', scheduledFor = null }) => {
    const categoryInfo = PEER_CATEGORIES.find((c) => c.id === category);
    // (S07) UUID real con sesión para que la subasta persista y las ofertas la referencien.
    const authUid = isUuid(currentUser?.id) ? currentUser.id : null;
    const requestId = authUid ? newUuid() : `req-live-${Date.now()}`;
    const lat = Number((-31.6529 + (Math.random() - 0.5) * 0.009).toFixed(6));
    const lng = Number((-64.4283 + (Math.random() - 0.5) * 0.009).toFixed(6));
    const feeArs = Number(estimatedFeeArs) || 2500;
    const feeValens = +(feeArs / 2400).toFixed(1);

    const newReq = {
      id: requestId,
      clientName: userName || 'Cliente Alta Gracia',
      clientAvatar: userProfile?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      clientRating: 5.0,
      category: category,
      categoryLabel: categoryInfo?.title || 'Servicio de Transporte',
      description: description?.trim() || 'Envío programado en Alta Gracia',
      origin: origin?.trim() || 'Av. Belgrano Centro, Alta Gracia',
      destination: destination?.trim() || 'Bv. Pellegrini, Alta Gracia',
      scheduledTime: scheduledTime || 'Hoy 18:00 hs',
      estimatedFeeArs: feeArs,
      estimatedFeeValens: feeValens,
      lat,
      lng,
      distanceKm: '0.6 km',
      distanceMeters: 600,
      status: 'open',
      timestamp: 'Recién',
      urgent: false,
      offers: []
    };

    setLiveRequests((prev) => [newReq, ...prev]);
    playP2PAlertChime();
    showToast('📢 ¡Envío programado publicado en la Subasta P2P de Alta Gracia!', 'success');

    // Simular que un cadete de Alta Gracia envía una oferta competitiva en 4 segundos para demostración interactiva
    setTimeout(() => {
      const matchingCadete = peers.find((p) => p.category === category) || peers[0];
      const autoOffer = {
        id: `offer-${Date.now()}`,
        cadeteId: matchingCadete.id,
        cadeteName: matchingCadete.name,
        cadeteAvatar: matchingCadete.avatar,
        cadeteRating: matchingCadete.rating,
        vehicle: `${matchingCadete.vehicle} ${matchingCadete.vehicleIcon || '🚲'}`,
        feeArs: Math.max(1200, Math.round((feeArs * (0.88 + Math.random() * 0.2)) / 100) * 100),
        feeValens: matchingCadete.cryptoFee ? parseFloat(matchingCadete.cryptoFee) : feeValens,
        note: `¡Hola! Disponible para ${scheduledTime || 'ese horario'}. Cumplo puntual y con cuidado.`,
        timestamp: 'Recién'
      };
      setLiveRequests((prev) =>
        prev.map((r) =>
          r.id === newReq.id
            ? { ...r, offers: [autoOffer, ...(r.offers || [])] }
            : r
        )
      );
      playP2PAlertChime();
      showToast(`🔔 ¡Nueva oferta recibida de ${matchingCadete.name} para tu subasta!`, 'info');
    }, 4000);

    if (authUid) {
      // (S09.6c) PIN único para esta subasta programada
      const pinForOrder = generateSecurePin();
      registerOrderPin(requestId, pinForOrder);
      saveOrderToSupabase({
        id: requestId,
        client_id: authUid,
        title: `Subasta P2P — ${newReq.categoryLabel}`,
        description: newReq.description,
        category: newReq.category,
        status: 'open',
        origin_address: newReq.origin,
        destination_address: newReq.destination,
        origin_lat: lat,
        origin_lng: lng,
        price_ars: feeArs,
        reward_val: feeValens,
        // (S09.6a) Subasta programada: fecha objetivo + no urgente
        scheduled_for: scheduledFor || null,
        is_urgent: false
      })
        .then(async (res) => {
          // (S09.6c) Registrar el PIN en el backend al crear la subasta
          try {
            const pinRes = await pinService.setOrderPin(requestId, pinForOrder);
            if (!pinRes?.success) console.warn('[S09.6c] set_order_pin (subasta):', pinRes?.error);
          } catch (pinErr) {
            console.warn('[S09.6c] set_order_pin (subasta) falló:', pinErr?.message || pinErr);
          }
          const warning = persistenceWarning(res);
          if (warning) {
            console.warn('[S07.5] Subasta no sincronizada:', res);
            showToast(warning, 'warning');
          } else {
            showToast('📢 ¡Subasta publicada y sincronizada!', 'success');
          }
        })
        .catch((err) => {
          console.error('[S07.5] Error inesperado al guardar subasta:', err);
          showToast('⚠️ Guardado localmente, pero falló la sincronización.', 'warning');
        });
    } else {
      showToast('📢 ¡Subasta publicada! (sin sesión: queda solo en este dispositivo)', 'warning');
    }

    return newReq;
  };

  const submitCadeteQuote = async (requestId, { feeArs, note }) => {
    const fee = Number(feeArs) || 2500;
    const cadeteReference = peers.find((p) => p.id === 'cadete-moto-1') || peers[0];
    // (S07) bids.cadet_id es FK a profiles.id: con sesión se usa el UUID real;
    // sin sesión se conserva el id local (la cotización queda solo en memoria/localStorage).
    const cadetId = isUuid(currentUser?.id) ? currentUser.id : CURRENT_CADET_ID;
    
    // 1. Guardar la cotización en la tabla 'bids' de Supabase
    // Campos: order_id, cadet_id, amount_ars, note, created_at
    try {
      await saveBidToSupabase({
        order_id: requestId,
        cadet_id: cadetId,
        amount_ars: fee,
        note: note?.trim() || `Propuesta económica: $${fee.toLocaleString('es-AR')} ARS.`
      });
    } catch (err) {
      console.warn('Aviso de persistencia en bids de Supabase:', err);
    }

    const newOffer = {
      id: `offer-${Date.now()}`,
      cadeteId: cadetId,
      cadeteName: userName || 'Tú (Cadete Alta Gracia)',
      cadeteAvatar: userProfile?.avatar || cadeteReference.avatar,
      cadeteRating: 5.0,
      vehicle: userProfile?.vehicleType || 'Vehículo Activo 🚀',
      feeArs: fee,
      feeValens: +(fee / 2400).toFixed(1),
      note: note?.trim() || `Propuesta económica: $${fee.toLocaleString('es-AR')} ARS. Entrega puntual.`,
      timestamp: 'Recién',
      isOwnOffer: true
    };

    let isEdit = false;
    setLiveRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          const currentOffers = r.offers || [];
          // Si el cadete ya había cotizado para este pedido, actualiza la oferta (Editar / Re-cotizar)
          const existingIdx = currentOffers.findIndex(
            (o) => o.cadeteId === cadetId || o.cadeteId === 'current-user-cadete'
          );
          let updatedOffers;
          if (existingIdx >= 0) {
            isEdit = true;
            updatedOffers = [...currentOffers];
            updatedOffers[existingIdx] = { ...updatedOffers[existingIdx], ...newOffer };
          } else {
            updatedOffers = [newOffer, ...currentOffers];
          }
          return {
            ...r,
            offers: updatedOffers
          };
        }
        return r;
      })
    );
    playP2PAlertChime();
    showToast(
      isEdit
        ? `📝 ¡Cotización actualizada a $${fee.toLocaleString('es-AR')} ARS en Supabase!`
        : `📨 ¡Oferta de $${fee.toLocaleString('es-AR')} ARS registrada en Supabase (tabla bids)!`,
      'success'
    );
    return newOffer;
  };

  const awardAuctionOffer = (requestId, offerId) => {
    let chosenOffer = null;
    let chosenRequest = null;

    setLiveRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          chosenRequest = r;
          const found = r.offers?.find((o) => o.id === offerId);
          if (found) chosenOffer = found;
          return {
            ...r,
            status: 'awarded',
            awardedOfferId: offerId,
            awardedCadete: found
          };
        }
        return r;
      })
    );

    if (chosenOffer) {
      const cadeteChatId = chosenOffer.cadeteId === 'current-user-cadete' ? 'cadete-moto-1' : chosenOffer.cadeteId;
      unlockChatConnection(cadeteChatId);
      setActiveChatPeerId(cadeteChatId);

      const dealMsg = {
        id: `deal-${Date.now()}`,
        sender: 'system',
        type: 'auction_awarded',
        text: `🤝 ¡Subasta Adjudicada con Éxito! Se ha aceptado la oferta de ${chosenOffer.cadeteName} por $${Number(chosenOffer.feeArs).toLocaleString('es-AR')} ARS (${chosenOffer.feeValens || 1.0} VALENS).\n⏰ Horario programado: ${chosenRequest?.scheduledTime || 'A coordinar'}\n📍 Ruta: ${chosenRequest?.origin || 'Origen'} ➔ ${chosenRequest?.destination || 'Destino'}.\nChat P2P activo para coordinar la entrega.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => ({
        ...prev,
        [cadeteChatId]: [...(prev[cadeteChatId] || []), dealMsg]
      }));

      playCelebrationSound();
      showToast(`🤝 ¡Subasta adjudicada a ${chosenOffer.cadeteName}! Chat P2P habilitado.`, 'success');
    }
  };

  // 4.6. Privacidad y Compartición Consentida de WhatsApp dentro del Chat P2P
  const shareWhatsappWithPeer = (peerId) => {
    setSharedWhatsappChats((prev) => ({ ...prev, [peerId]: true }));
    const userPhone = userProfile?.socials?.whatsapp || '+5493547123456';
    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'la contraparte';

    const shareMsg = {
      id: `wa-share-${Date.now()}`,
      sender: 'user',
      senderName: userName || 'Tú',
      type: 'whatsapp_shared',
      phone: userPhone,
      text: `📱 He compartido voluntariamente mi contacto directo de WhatsApp para coordinar esta entrega en Alta Gracia.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => ({
      ...prev,
      [peerId]: [...(prev[peerId] || []), shareMsg]
    }));

    playP2PAlertChime();
    showToast(`📱 Has compartido tu WhatsApp con ${peerName} con consentimiento explícito.`, 'success');

    // Respuesta recíproca simulada de la contraparte tras 1.5 segundos
    setTimeout(() => {
      const peerSocials = getPeerSocials(targetPeer);
      const peerPhone = peerSocials.whatsapp || '+5493547420101';
      const replyMsg = {
        id: `wa-recip-${Date.now()}`,
        sender: 'peer',
        senderName: peerName,
        type: 'whatsapp_shared',
        phone: peerPhone,
        text: `🤝 ¡Excelente! Te comparto también mi contacto directo de WhatsApp para coordinar la ubicación y cualquier detalle de la entrega.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => ({
        ...prev,
        [peerId]: [...(prev[peerId] || []), replyMsg]
      }));

      playP2PAlertChime();
      showToast(`📱 ${peerName} te ha compartido su contacto de WhatsApp.`, 'info');
    }, 1500);
  };

  const isWhatsappSharedWithPeer = (peerId) => {
    return !!sharedWhatsappChats[peerId];
  };

  // 5. Módulo de Seguridad: Bloqueo y Restricción de Usuarios
  const blockUser = (peerId) => {
    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'Usuario';

    setBlockedUserIds((prev) => {
      const next = prev.includes(peerId) ? prev : [...prev, peerId];
      localStorage.setItem('gremami_blocked_users', JSON.stringify(next));
      return next;
    });

    setSelectedPeer(null);

    // Si el chat activo es con el usuario bloqueado, cambiar al primer usuario no bloqueado
    if (activeChatPeerId === peerId) {
      const remaining = peers.filter((p) => p.id !== peerId && !blockedUserIds.includes(p.id));
      if (remaining.length > 0) {
        setActiveChatPeerId(remaining[0].id);
      }
    }

    showToast(`🛡️ Has bloqueado a ${peerName}. Su posición fue ocultada en el mapa y no podrá contactarte.`, 'warning');
  };

  const unblockUser = (peerId) => {
    const targetPeer = peers.find((p) => p.id === peerId);
    const peerName = targetPeer ? targetPeer.name : 'Usuario';

    setBlockedUserIds((prev) => {
      const next = prev.filter((id) => id !== peerId);
      localStorage.setItem('gremami_blocked_users', JSON.stringify(next));
      return next;
    });

    showToast(`✅ Has desbloqueado a ${peerName}. Visible nuevamente en la red P2P.`, 'success');
  };

  const isUserBlocked = (peerId) => {
    return blockedUserIds.includes(peerId);
  };

  // 3. Sistema de Reputación Visual Comunitaria (🟢 Recomendado | 🟡 Denunciado | 🔴 Bloqueado)
  const recommendPeer = (peerId) => {
    setPeers((prev) =>
      prev.map((p) =>
        p.id === peerId
          ? { ...p, recommendations: (p.recommendations || 0) + 1 }
          : p
      )
    );
    const target = peers.find((p) => p.id === peerId);
    playP2PAlertChime();
    showToast(`👍 ¡Has recomendado a ${target?.name || 'este usuario'}! Sumó +1 a su reputación comunitaria en Alta Gracia.`, 'success');
  };

  const reportPeer = (peerId, { reason, details }) => {
    const newReport = {
      id: `rep-${Date.now()}`,
      reason: reason || 'Cobro indebido o incumplimiento',
      details: details?.trim() || 'Reporte de irregularidad registrado por usuario',
      timestamp: 'Recién',
      status: 'active'
    };

    setPeers((prev) =>
      prev.map((p) =>
        p.id === peerId
          ? {
              ...p,
              reportsCount: (p.reportsCount || 0) + 1,
              reputationReports: [newReport, ...(p.reputationReports || [])]
            }
          : p
      )
    );
    const target = peers.find((p) => p.id === peerId);
    playP2PAlertChime();
    showToast(`⚠️ Denuncia registrada contra ${target?.name || 'el usuario'} por "${reason}". Nivel de confianza actualizado a Advertencia (🟡).`, 'warning');
  };

  const getPeerReputation = (peerId) => {
    if (blockedUserIds.includes(peerId)) return 'blocked'; // 🔴 Rojo
    const peer = peers.find((p) => p.id === peerId);
    if (peer && peer.reportsCount > 0) return 'reported'; // 🟡 Amarillo
    return 'recommended'; // 🟢 Verde
  };

  // 4. Mercado P2P DEX (Donaciones y Compra/Venta de ValensCoin)
  const createDexOrder = ({ type, amountValens, unitPriceArs, description, paymentMethod }) => {
    const valensNum = Number(amountValens) || 1.0;
    const priceNum = Number(unitPriceArs) || 0;
    const newOrd = {
      id: `dex-ord-${Date.now()}`,
      type: type || 'donation_request',
      title:
        type === 'donation_request'
          ? '🎁 Pedido de Donación / Solidaridad (1 VALENS)'
          : type === 'sell'
          ? `🛒 Oferta de Venta: ${valensNum} VALENS`
          : `💰 Oferta de Compra: ${valensNum} VALENS`,
      userName: userName || 'Usuario P2P',
      userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      userRole: role === 'cadete' ? 'Cadete Alta Gracia' : 'Cliente Soberano',
      amountValens: valensNum,
      unitPriceArs: priceNum,
      priceArs: valensNum * priceNum,
      paymentMethod: paymentMethod || (type === 'donation_request' ? 'Solidaridad Comunitaria' : 'Mercado Pago / Efectivo'),
      description: description?.trim() || 'Intercambio soberano P2P de tokens ValensCoin',
      status: 'open',
      timestamp: 'Recién'
    };

    setDexOrders((prev) => [newOrd, ...prev]);
    playP2PAlertChime();
    showToast('📈 ¡Orden publicada exitosamente en el Mercado P2P DEX!', 'success');
    return newOrd;
  };

  const donateValens = (orderId, amount = 1.0) => {
    if (balance < amount) {
      showToast('❌ Saldo insuficiente en tu billetera. Recarga con el Grifo Faucet.', 'error');
      return false;
    }

    const targetOrder = dexOrders.find((o) => o.id === orderId);
    const recipientName = targetOrder ? targetOrder.userName : 'Compañero Cadete';

    setBalance((prev) => +(prev - amount).toFixed(2));

    const donationTx = {
      id: `tx-don-${Date.now()}`,
      type: 'donation_sent',
      amount: -amount,
      title: `Donación solidaria a ${recipientName}`,
      date: 'Recién',
      hash: '0xdn' + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('') + '...' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      status: 'Confirmado (Bloque #840,132)',
      note: 'Donación comunitaria de reactivación de nodo para cadete en Alta Gracia'
    };

    setTransactions((prev) => [donationTx, ...prev]);

    setDexOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: 'completed', completedBy: userName }
          : o
      )
    );

    playP2PAlertChime();
    showToast(`🎁 ¡Has donado ${amount} VALENS a ${recipientName}! Su nodo ha sido reactivado en el mapa.`, 'success');
    return true;
  };

  const fulfillDexTrade = (orderId) => {
    const targetOrder = dexOrders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    if (targetOrder.type === 'buy') {
      // El usuario actual le vende VALENS al comprador
      if (balance < targetOrder.amountValens) {
        showToast(`❌ Necesitas al menos ${targetOrder.amountValens} VALENS para vender.`, 'error');
        return;
      }
      setBalance((prev) => +(prev - targetOrder.amountValens).toFixed(2));
      showToast(`🤝 ¡Venta coordinada! Recibirás $${targetOrder.priceArs.toLocaleString('es-AR')} ARS por ${targetOrder.amountValens} VALENS.`, 'success');
    } else if (targetOrder.type === 'sell') {
      // El usuario actual le compra VALENS al vendedor
      setBalance((prev) => +(prev + targetOrder.amountValens).toFixed(2));
      showToast(`🤝 ¡Compra concretada! Se han sumado ${targetOrder.amountValens} VALENS a tu billetera.`, 'success');
    }

    setDexOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'completed' } : o))
    );
    playP2PAlertChime();
  };

  // 4. Conmutador de Estado en Tiempo Real (Online / Offline)
  const toggleOnlineStatus = () => {
    setIsOnline((prev) => {
      const next = !prev;
      localStorage.setItem('gremami_is_online', String(next));
      playP2PAlertChime();
      showToast(
        next
          ? '🟢 ONLINE: Tu nodo está visible en el Mapa P2P y listo para recibir pedidos o fletes.'
          : '⚪ OFFLINE: Desconectado. Ubicación oculta y alertas pausadas.',
        next ? 'success' : 'info'
      );
      return next;
    });
  };

  // Gestión de Perfil Ampliado, Imágenes y Documento de Identidad
  const updateUserProfile = (updates) => {
    setUserProfile((prev) => {
      const next = { ...prev, ...updates };
      if (updates.name) setUserName(updates.name);
      localStorage.setItem('gremami_user_profile', JSON.stringify(next));
      showToast('💾 Perfil y datos de cobertura guardados exitosamente', 'success');
      return next;
    });
  };

  // Configuración de Billeteras Virtuales Argentinas para Cobros FIAT ($ ARS)
  const updateFiatPaymentConfig = ({ fiatProvider, fiatAlias, fiatCbuCvu, fiatHolderName, fiatCuit }) => {
    const nextConfig = {
      fiatProvider: fiatProvider || userProfile.fiatProvider || 'Mercado Pago',
      fiatAlias: (fiatAlias || userProfile.fiatAlias || userProfile.aliasCbu || 'cadete.gremami.mp').trim(),
      aliasCbu: (fiatAlias || userProfile.fiatAlias || userProfile.aliasCbu || 'cadete.gremami.mp').trim(),
      fiatCbuCvu: (fiatCbuCvu ?? userProfile.fiatCbuCvu ?? '').trim(),
      fiatHolderName: (fiatHolderName ?? userProfile.fiatHolderName ?? '').trim(),
      fiatCuit: (fiatCuit ?? userProfile.fiatCuit ?? '').trim()
    };

    setUserProfile((prev) => {
      const updated = { ...prev, ...nextConfig };
      localStorage.setItem('gremami_user_profile', JSON.stringify(updated));
      return updated;
    });

    // Persistencia en Supabase de la config FIAT (no bloqueante: la UI ya se actualizó
    // en localStorage arriba). Se captura el rechazo para evitar unhandled rejections.
    saveFiatPaymentConfigToSupabase({
      // (S07) profiles.id es UUID: con sesión se persiste la config FIAT real.
      cadet_id: isUuid(currentUser?.id) ? currentUser.id : CURRENT_CADET_ID,
      fiat_provider: nextConfig.fiatProvider,
      fiat_alias: nextConfig.fiatAlias,
      fiat_cbu_cvu: nextConfig.fiatCbuCvu,
      fiat_holder_name: nextConfig.fiatHolderName,
      fiat_cuit: nextConfig.fiatCuit
    }).catch((err) => {
      console.warn('Aviso de persistencia de configuración FIAT (no bloqueante):', err?.message || err);
    });

    playP2PAlertChime();
    showToast(`💳 Métodos de cobro FIAT guardados (${nextConfig.fiatProvider})`, 'success');
    return nextConfig;
  };

  const uploadAvatar = (dataUrl) => {
    setUserProfile((prev) => {
      const next = { ...prev, avatar: dataUrl };
      localStorage.setItem('gremami_user_profile', JSON.stringify(next));
      showToast('📸 Foto de perfil/logo actualizada', 'success');
      return next;
    });
  };

  const uploadIdDocument = (dataUrl) => {
    setUserProfile((prev) => {
      const next = { ...prev, idDocumentUrl: dataUrl, isIdVerified: true };
      localStorage.setItem('gremami_user_profile', JSON.stringify(next));
      playP2PAlertChime();
      showToast('🛡️ Documento de Identidad cargado. Identidad Validada P2P activada.', 'success');
      return next;
    });
  };

  const toggleIdVerification = () => {
    setUserProfile((prev) => {
      const next = { ...prev, isIdVerified: !prev.isIdVerified };
      localStorage.setItem('gremami_user_profile', JSON.stringify(next));
      showToast(
        next.isIdVerified
          ? '🛡️ Identidad Validada P2P activada'
          : '⚪ Verificación de identidad comunitaria pausada',
        'info'
      );
      return next;
    });
  };

  const copyReferralLink = () => {
    const link = `https://gremami.app/ref/${userProfile.referralCode || 'satoshidev'}`;
    navigator.clipboard.writeText(link);
    playP2PAlertChime();
    showToast('🔗 ¡Enlace de referido copiado! Comparte con colegas cadetes y fletes.', 'success');
    return link;
  };

  const shareMilestones = () => {
    const text = `🚀 ¡Mis Hitos en Gremami P2P Alta Gracia!\n📦 ${userProfile.milestones.weeklyDeliveries} Entregas/Fletes esta semana\n⭐ ${userProfile.milestones.positiveRatingPercent}% Calificación Positiva\n💰 $${userProfile.milestones.commissionsSavedArs.toLocaleString('es-AR')} ARS ahorrados en comisiones intermediarias corporativas.\n\nSúmate a la logística descentralizada: https://gremami.app/ref/${userProfile.referralCode || 'satoshidev'}`;
    navigator.clipboard.writeText(text);
    playP2PAlertChime();
    showToast('🚀 ¡Hitos copiados al portapapeles listos para compartir en WhatsApp o redes!', 'success');
    return text;
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        role,
        setRole: handleSetRole,
        activeTab,
        setActiveTab,
        goBack,
        canGoBack,
        navigationHistory,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        selectCategoryAndGoToMap,
        balance,
        setBalance,
        userPublicKey,
        // (S11) Dirección real persistida en Supabase; fallback local para invitados.
        walletAddress: walletAddress || userPublicKey,
        schoolRewardClaimed,
        userName,
        setUserName,
        currentUser,
        user: currentUser,
        setCurrentUser,
        isAuthModalOpen,
        setIsAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        isSearchModalOpen,
        setIsSearchModalOpen,
        openSearchModal: () => setIsSearchModalOpen(true),
        closeSearchModal: () => setIsSearchModalOpen(false),
        selectedPublicProfile,
        setSelectedPublicProfile,
        openPublicProfile: (profile) => setSelectedPublicProfile(profile),
        closePublicProfile: () => setSelectedPublicProfile(null),
        searchUsers,
        logout: async () => {
          await authService.signOut();
          setCurrentUser(null);
          setWalletAddress('');
          setSchoolRewardClaimed(false);
          showToast('Sesión cerrada correctamente', 'info');
        },
        isGpsActive,
        setIsGpsActive,
        selectedPeer,
        setSelectedPeer,
        activeChatPeerId,
        setActiveChatPeerId,
        peers,
        setPeers,
        categories: PEER_CATEGORIES,
        messages,
        transactions,
        seedWords: userSeedWords,
        transferTokens,
        // (S11) Recompensa única de la Escuela Cripto (5 VAL reales).
        claimSchoolReward,
        valensQrUri: generateValensQrUri(walletAddress || userPublicKey),
        tokenGenesis: {
          symbol: 'VAL',
          name: 'ValensCoin',
          totalSupply: 1000000000000,
          decimals: 0,
          faucetDrip: 5,
          initialAirdrop: 10
        },
        startChatWithPeer,
        sendTextMessage,
        agreeCashPayment,
        sendValensTip,
        requestFaucet,
        toast,
        showToast,
        orderPin,
        // (S09.6c) PIN por pedido
        pinsByOrder,
        getOrderPin,
        registerOrderPin,
        pinStatus,
        setPinStatus,
        generateNewPin,
        verifyPin,
        pinFailedAttempts,
        isPinLocked,
        celebrationData,
        completeDeliveryWithPin,
        resendPinViaChat,
        contactCommunitySupport,
        resetPinAttempts,
        closeCelebrationModal,
        ordersHistory,
        setOrdersHistory,
        exchangeRates: EXCHANGE_RATES,
        // Live service requests, auctions and alerts
        liveRequests,
        setLiveRequests,
        createServiceRequest,
        createAuctionRequest,
        // (S09.6a) Datos reales
        myOrders,
        refreshMyOrders,
        submitOfferReal,
        acceptOfferReal,
        getOrderOffersReal,
        submitCadeteQuote,
        awardAuctionOffer,
        sendFeeProposal,
        acceptServiceRequest,
        activeAlert,
        setActiveAlert,
        dismissAlert,
        triggerAlertTest,
        playAlertSound: playP2PAlertChime,
        // Conditional chat connection unlocking
        acceptedConnections,
        unlockChatConnection,
        isChatUnlocked,
        // DNI verification P2P exchange
        dniRequests,
        requestDniVerification,
        acceptDniVerification,
        rejectDniVerification,
        getDniVerificationStatus,
        // Privacidad de WhatsApp y Consentimiento Explícito
        sharedWhatsappChats,
        shareWhatsappWithPeer,
        isWhatsappSharedWithPeer,
        // User blocking and security
        blockedUserIds,
        blockUser,
        unblockUser,
        isUserBlocked,
        formatDistanceKm,
        // Visual reputation system
        recommendPeer,
        reportPeer,
        getPeerReputation,
        // Mercado P2P DEX
        dexOrders,
        setDexOrders,
        createDexOrder,
        donateValens,
        fulfillDexTrade,
        // Real-time Online/Offline status
        isOnline,
        toggleOnlineStatus,
        // Real-time GPS location
        userGpsCoords,
        setUserGpsCoords,
        userGpsAccuracy,
        hasLiveGps,
        // Expanded user profile, images, verification, milestones & referrals
        userProfile,
        updateUserProfile,
        updateFiatPaymentConfig,
        fiatProviders: ARGENTINE_FIAT_PROVIDERS,
        uploadAvatar,
        uploadIdDocument,
        toggleIdVerification,
        copyReferralLink,
        shareMilestones
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
