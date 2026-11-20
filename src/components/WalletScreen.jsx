import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsQR from 'jsqr';
import { useApp } from '../context/AppContext';
import { CRYPTO_SCHOOL_MODULES, ARGENTINE_FIAT_PROVIDERS } from '../data/mockData';
import {
  Wallet,
  Copy,
  Check,
  QrCode,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Key,
  Shield,
  FileText,
  Coins,
  ExternalLink,
  BookOpen,
  HelpCircle,
  Award,
  RefreshCw,
  X,
  DollarSign,
  PiggyBank,
  TrendingUp,
  CreditCard,
  Building2,
  AlertTriangle,
  GraduationCap,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';

// Preguntas interactivas de la Mini-Trivia de Seguridad Cripto P2P
const SECURITY_TRIVIA_QUESTIONS = [
  {
    id: 1,
    title: 'Pregunta 1: Custodia y Frase Semilla',
    question: 'Si un cadete, cliente o alguien que dice ser de "Soporte de Gremami" te pide tus 12 palabras de la frase semilla para "verificar tu cuenta", ¿qué debes hacer?',
    options: [
      'Dárselas rápido para no trabar el servicio ni perder mi cuenta',
      'Jamás dárselas: es un intento de estafa y perdería el control total de mis fondos',
      'Pasarle solo 6 de las 12 palabras para mayor seguridad'
    ],
    correctIndex: 1,
    explanation: '¡Exacto! Tu frase semilla es tu clave maestra privada. Nadie del equipo de soporte ni usuarios te la pedirá jamás bajo ninguna circunstancia.'
  },
  {
    id: 2,
    title: 'Pregunta 2: Clave Pública vs Privada',
    question: '¿Cuál de los siguientes datos es 100% seguro compartir públicamente con cualquier persona para recibir pagos o propinas?',
    options: [
      'Tu Clave Pública (Dirección de Billetera ValensCoin)',
      'Tu Frase Semilla de 12 palabras de respaldo',
      'La clave privada de tu firma digital'
    ],
    correctIndex: 0,
    explanation: '¡Correcto! Tu clave pública funciona como un buzón postal o un CBU: cualquiera puede depositar en ella pero nadie puede retirar sin tu llave privada.'
  },
  {
    id: 3,
    title: 'Pregunta 3: Modelo Híbrido P2P',
    question: '¿Por qué el modelo descentralizado P2P de Gremami beneficia a cadetes y comercios de Alta Gracia?',
    options: [
      'Porque aplica un algoritmo centralizado que retiene el 35% de cada pedido',
      'Porque permite acuerdos directos entre partes con 0% de comisiones corporativas abusivas',
      'Porque exige pagar suscripciones mensuales obligatorias para operar'
    ],
    correctIndex: 1,
    explanation: '¡Excelente! En Gremami P2P el 100% del valor pactado queda para el prestador, combinando efectivo en mano con propinas soberanas en ValensCoin.'
  },
  {
    id: 4,
    title: 'Pregunta 4: Verificar la Dirección Destino',
    question: 'Antes de confirmar un envío de VAL a la dirección valens1q... de otra persona, ¿qué control es imprescindible?',
    options: [
      'Comparar la dirección completa o escanear el QR del destinatario y confirmar que coincide',
      'Enviar primero y preguntar después si llegó',
      'Confiar en cualquier enlace de pago que llegue por mensaje privado sin revisar la dirección'
    ],
    correctIndex: 0,
    explanation: '¡Correcto! Las transferencias son irreversibles: verificá la dirección completa o el QR antes de firmar. Un enlace de pago alterado puede desviar tus VAL a otra billetera.'
  },
  {
    id: 5,
    title: 'Pregunta 5: Doble Gasto y Saldo Atómico',
    question: '¿Qué garantiza que nadie pueda gastar dos veces los mismos VAL aunque envíe dos transferencias al mismo tiempo?',
    options: [
      'El saldo se descuenta en una sola operación atómica en el servidor, que rechaza el débito si no alcanza',
      'La aplicación del celular guarda el saldo en la memoria y nunca se equivoca',
      'Cada usuario puede editar su saldo desde la pantalla de billetera'
    ],
    correctIndex: 0,
    explanation: '¡Exacto! El débito atómico condicionado al saldo disponible (WHERE balance_valens >= monto) hace imposible el doble gasto. El cliente nunca modifica saldos por su cuenta.'
  }
];

export default function WalletScreen() {
  const {
    balance,
    userPublicKey,
    walletAddress,
    userName,
    schoolRewardClaimed,
    claimSchoolReward,
    transactions,
    requestFaucet,
    transferTokens,
    valensQrUri,
    tokenGenesis,
    showToast,
    // (S14a-3) gate de auth para acciones de escritura
    openAuthModal,
    currentUser,
    theme,
    ordersHistory,
    userProfile,
    setActiveTab,
    role,
    updateFiatPaymentConfig
  } = useApp();

  const isDark = theme === 'dark';

  // Control de Secciones / Pestañas de la Vista: 'wallet' | 'school'
  const [walletSectionTab, setWalletSectionTab] = useState('wallet');

  // Estados de Copiado y Modales
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAlias, setCopiedAlias] = useState(false);
  const [copiedQrUri, setCopiedQrUri] = useState(false);
  const [receiveTab, setReceiveTab] = useState('crypto'); // 'crypto' | 'fiat'
  const [showQrReceiveModal, setShowQrReceiveModal] = useState(false);
  const [receiveCustomAmount, setReceiveCustomAmount] = useState('');

  // Estados del Modal "Enviar VAL"
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendAddress, setSendAddress] = useState('');
  // (S14e) Lector de QR compatible con el formato propio: valens:DIRECCION?amount=N
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrManual, setQrManual] = useState('');
  const [qrStatus, setQrStatus] = useState('');
  const [qrScanning, setQrScanning] = useState(false);

  // (S20) Devuelve true SOLO si el QR era de GREMAMI y se aplicó.
  // Un frame ilegible o ajeno NO apaga la cámara: se sigue escaneando.
  const applyQrPayload = (raw) => {
    const val = String(raw || '').trim();
    if (val.length < 8) return false; // lectura parcial: ignorar en silencio
    const normalized = val
      .replace(/\s+/g, '')
      .replace(/^valens:\/\//i, 'valens:')
      .replace(/^VALENS:/, 'valens:');
    const addr = normalized.match(/valens:([^?&#]+)/i);
    if (addr && (!addr[1] || addr[1].length < 6)) {
      setQrStatus('Ese código de GREMAMI está incompleto. Probá de nuevo.');
      return false;
    }
    const amt = normalized.match(/(?:amount|amt|monto|valor)=(\d+)/i);
    // (S21) Aceptar también la dirección suelta (el QR de Recibir codifica la
    // dirección sin prefijo): vlx1... / valens1... o cualquier alfanumérica larga.
    const bare = !addr && /^[a-z0-9]{10,}$/i.test(normalized) ? normalized : null;
    const rawAddr = addr ? addr[1] : bare;
    if (!rawAddr || rawAddr.length < 6) {
      setQrStatus('Leímos un QR que no es de GREMAMI. Apuntá al QR de la billetera.');
      return false;
    }
    setSendAddress(rawAddr);
    if (amt) setSendAmount(amt[1]);
    setQrStatus('QR leído: destinatario cargado');
    // Auto-cerrar el lector para que se vean monto y botón de envío.
    stopQrCamera();
    setShowQrScanner(false);
    return true;
  };

  const stopQrCamera = () => {
    const video = document.getElementById('gremami-qr-video');
    const stream = video && video.srcObject;
    // (S16) Detener SIEMPRE todos los tracks, incluso si el video ya no existe.
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) { /* noop */ }
      });
    }
    if (video) {
      try { video.pause(); } catch (e) { /* noop */ }
      video.srcObject = null;
    }
    setQrScanning(false);
  };

  // (S16) Al desmontar o cerrar el modal, liberar la cámara sin excepciones.
  useEffect(() => () => stopQrCamera(), []);
  useEffect(() => {
    if (!showSendModal && !showQrScanner) stopQrCamera();
  }, [showSendModal, showQrScanner]);

  const startQrCamera = async () => {
    setQrStatus('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setQrStatus('Este dispositivo no permite cámara. Pegá el código abajo.');
      return;
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setQrStatus(
        denied
          ? 'Permiso de cámara denegado. Pegá el código abajo.'
          : 'No pudimos abrir la cámara. Pegá el código abajo.'
      );
      return;
    }

    const video = document.getElementById('gremami-qr-video');
    if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }

    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.srcObject = stream;

    try {
      await video.play();
      setQrScanning(true);
    } catch (e) {
      // Algunos móviles tardan en emitir el primer frame: no abortamos.
      setQrScanning(true);
    }

    // (S16) Si el sistema corta la cámara (llamada, app en segundo plano), avisamos.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        stopQrCamera();
        setQrStatus('La cámara se detuvo. Podés reactivarla o pegar el código.');
      });
    });

    // Camino 1: BarcodeDetector nativo (Chrome/Android).
    if ('BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        let lastRejected = '';
        const tick = async () => {
          if (!document.getElementById('gremami-qr-video')) { stopQrCamera(); return; }
          try {
            const codes = await detector.detect(video);
            const value = codes && codes.length ? codes[0].rawValue : null;
            if (value && value !== lastRejected) {
              if (applyQrPayload(value)) return; // válido: aplica y cierra
              lastRejected = value;              // ajeno: avisa y sigue escaneando
            }
          } catch (e) { /* seguir intentando */ }
          requestAnimationFrame(tick);
        };
        tick();
        return;
      } catch (e) { /* cae al respaldo jsQR */ }
    }

    // Camino 2 (S16): respaldo jsQR sobre canvas — iOS/Safari y Firefox.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let lastScan = 0;
    let lastRejected = '';
    const scanFallback = (now) => {
      if (!document.getElementById('gremami-qr-video')) { stopQrCamera(); return; }
      if (now - lastScan > 220 && video.videoWidth > 0) {
        lastScan = now;
        try {
          const w = Math.min(video.videoWidth, 640);
          const h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const found = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
          const value = found && found.data ? found.data : null;
          if (value && value !== lastRejected) {
            if (applyQrPayload(value)) return; // válido: aplica y cierra
            lastRejected = value;              // ajeno: avisa y sigue escaneando
          }
        } catch (e) { /* frame no legible: seguir */ }
      }
      requestAnimationFrame(scanFallback);
    };
    requestAnimationFrame(scanFallback);
  };
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Estados de Educación Cripto
  const [openModuleId, setOpenModuleId] = useState('keys');
  const [currentTriviaIndex, setCurrentTriviaIndex] = useState(0);
  const [triviaAnswers, setTriviaAnswers] = useState({});
  const [triviaClaimed, setTriviaClaimed] = useState({});
  const [isClaimingReward, setIsClaimingReward] = useState(false);

  // (S11) Dirección real de la billetera Valens del usuario autenticado.
  // El contexto ya resuelve el fallback local (userPublicKey) para invitados.
  const activeWalletAddress = walletAddress || userPublicKey;

  // URI de cobro opcional (dirección + monto entero solicitado).
  const receiveUri =
    receiveCustomAmount && parseInt(receiveCustomAmount) > 0
      ? `valens:${activeWalletAddress}?amount=${parseInt(receiveCustomAmount)}`
      : `valens:${activeWalletAddress}`;

  // (S11) Puntaje del cuestionario: 5 preguntas, umbral de aprobación 4/5.
  const triviaAnsweredCount = SECURITY_TRIVIA_QUESTIONS.filter(
    (q) => triviaAnswers[q.id] !== undefined
  ).length;
  const triviaScore = SECURITY_TRIVIA_QUESTIONS.reduce(
    (acc, q) => acc + (triviaAnswers[q.id] === q.correctIndex ? 1 : 0),
    0
  );
  const isQuizCompleted = triviaAnsweredCount === SECURITY_TRIVIA_QUESTIONS.length;
  const canClaimSchoolReward = isQuizCompleted && triviaScore >= 4 && !schoolRewardClaimed;

  const handleClaimSchoolReward = async () => {
    // (S14a-3) Sin sesión no se acredita nada: abre login.
    if (!currentUser?.id) {
      showToast('Iniciá sesión para acreditar tus VAL', 'warning');
      openAuthModal?.();
      return;
    }
    if (isClaimingReward || !canClaimSchoolReward) return;
    setIsClaimingReward(true);
    try {
      await claimSchoolReward(triviaScore);
    } finally {
      setIsClaimingReward(false);
    }
  };

  const handleRetryQuiz = () => {
    setTriviaAnswers({});
    setTriviaClaimed({});
    setCurrentTriviaIndex(0);
  };

  // Estados dinámicos para Billeteras Virtuales Argentinas (Fiat)
  const activeFiatProvider = userProfile?.fiatProvider || 'Mercado Pago';
  const activeFiatAlias = userProfile?.fiatAlias || userProfile?.aliasCbu || 'cadete.gremami.mp';
  const activeProviderInfo = ARGENTINE_FIAT_PROVIDERS.find((p) => p.name === activeFiatProvider) || ARGENTINE_FIAT_PROVIDERS[0];
  
  const [showFiatConfigPanel, setShowFiatConfigPanel] = useState(false);
  const [walletFormFiatProvider, setWalletFormFiatProvider] = useState(activeFiatProvider);
  const [walletFormFiatAlias, setWalletFormFiatAlias] = useState(activeFiatAlias);
  const [walletFormFiatCbuCvu, setWalletFormFiatCbuCvu] = useState(userProfile?.fiatCbuCvu || '0000003100049281729384');
  const [walletFormFiatHolder, setWalletFormFiatHolder] = useState(userProfile?.fiatHolderName || 'Satoshi Dev Nakamoto');
  const [walletFormFiatCuit, setWalletFormFiatCuit] = useState(userProfile?.fiatCuit || '20-38492019-4');
  const [isSavingWalletFiat, setIsSavingWalletFiat] = useState(false);

  // Órdenes y Entregas del cadete / prestador
  const cadetOrders = ordersHistory?.cadete || [];
  // (S14b-2) Métricas de actividad en VAL (sin conversiones a pesos)
  const totalValRecibidos = cadetOrders.reduce((acc, curr) => acc + Number(curr.amount_val || curr.valensReward || 0), 0);

  const isRecentOrThisWeek = (dateStr) => {
    if (!dateStr) return true;
    const lower = String(dateStr).toLowerCase();
    if (lower.includes('hoy') || lower.includes('ayer') || lower.includes('recién') || lower.includes('hace')) return true;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const now = new Date();
      const diffDays = (now - date) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    }
    return true;
  };

  const semanaOrders = cadetOrders.filter((o) => isRecentOrThisWeek(o.date || o.created_at || o.timestamp));
  const valSemana = semanaOrders.reduce((acc, curr) => acc + Number(curr.amount_val || curr.valensReward || 0), 0);
  const serviciosSemana = semanaOrders.length;

  const handleCopyAlias = () => {
    const alias = userProfile?.fiatAlias || userProfile?.aliasCbu || 'cadete.gremami.mp';
    navigator.clipboard.writeText(alias);
    setCopiedAlias(true);
    showToast(`💳 Alias (${activeFiatProvider}) copiado: ${alias}`, 'success');
    setTimeout(() => setCopiedAlias(false), 2000);
  };

  const handleSaveWalletFiat = async (e) => {
    e?.preventDefault();
    setIsSavingWalletFiat(true);
    try {
      const aliasFinal = walletFormFiatAlias.trim() || 'cadete.gremami.mp';
      updateFiatPaymentConfig({
        fiatProvider: walletFormFiatProvider,
        fiatAlias: aliasFinal,
        fiatCbuCvu: walletFormFiatCbuCvu.trim(),
        fiatHolderName: walletFormFiatHolder.trim(),
        fiatCuit: walletFormFiatCuit.trim()
      });
      setShowFiatConfigPanel(false);
      showToast(`💳 Billetera de cobro actualizada (${walletFormFiatProvider})`, 'success');
    } finally {
      setIsSavingWalletFiat(false);
    }
  };

  // Progreso de Educación Cripto P2P persistido en localStorage
  const [completedModules, setCompletedModules] = useState(() => {
    try {
      const saved = localStorage.getItem('gremami_crypto_school_progress');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ['keys']; // Default module 1 completed
  });

  const totalModules = CRYPTO_SCHOOL_MODULES.length;
  const progressPercentage = Math.round((completedModules.length / totalModules) * 100);
  const isAllCompleted = completedModules.length === totalModules;

  const toggleModuleCompletion = (moduleId) => {
    setCompletedModules((prev) => {
      let next;
      if (prev.includes(moduleId)) {
        next = prev.filter((id) => id !== moduleId);
      } else {
        next = [...prev, moduleId];
        showToast('🎉 ¡Módulo completado! +0.5 VALENS de conocimiento aplicado', 'success');
      }
      try {
        localStorage.setItem('gremami_crypto_school_progress', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleCopyPublicKey = () => {
    navigator.clipboard.writeText(activeWalletAddress);
    setCopiedKey(true);
    showToast('🔑 Dirección Valens copiada al portapapeles', 'success');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const getModuleIcon = (iconName) => {
    switch (iconName) {
      case 'Key':
        return <Key className="w-4 h-4 text-[#F7931A]" />;
      case 'Shield':
        return <Shield className="w-4 h-4 text-emerald-400" />;
      case 'FileText':
        return <FileText className="w-4 h-4 text-[#F0B90B]" />;
      case 'Coins':
        return <Coins className="w-4 h-4 text-[#E02424]" />;
      default:
        return <BookOpen className="w-4 h-4 text-[#F7931A]" />;
    }
  };

  const handleTriviaAnswer = (questionId, optionIndex) => {
    if (triviaClaimed[questionId]) return;
    setTriviaAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));

    const currentQ = SECURITY_TRIVIA_QUESTIONS.find((q) => q.id === questionId);
    if (!currentQ) return;

    if (optionIndex === currentQ.correctIndex) {
      setTriviaClaimed((prev) => ({ ...prev, [questionId]: true }));
      showToast('✅ ¡Respuesta correcta! Completá las 5 y reclamá tu recompensa de 5 VAL.', 'success');
    } else {
      showToast('❌ Respuesta incorrecta. Repasá la explicación e intentá de nuevo.', 'error');
    }
  };

  return (
    <div className={`w-full min-h-[calc(100vh-135px)] p-4 pb-8 space-y-4 max-w-lg mx-auto animate-fadeIn transition-colors duration-200 ${
      isDark ? 'bg-[#0A1128] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
    }`}>
      {/* Mini header de navegación con botón de regreso */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex items-center space-x-1.5 text-xs transition-colors ${
            isDark ? 'text-[#8C9BB4] hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ChevronDown className="w-4 h-4 rotate-90" />
          <span>Volver al Inicio</span>
        </button>
        <span className={`text-xs font-mono px-2 py-0.5 rounded-lg border ${
          walletSectionTab === 'wallet'
            ? isDark ? 'text-[#F0B90B] bg-[#121B2D] border-[#1F2D48]' : 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
            : isDark ? 'text-emerald-400 bg-[#064E3B]/40 border-emerald-500/40' : 'text-emerald-700 bg-emerald-50 border-emerald-300 font-bold'
        }`}>
          {walletSectionTab === 'wallet' ? 'Mi billetera' : 'Escuela Cripto'}
        </span>
      </div>

      {/* ── 1. SELECTOR DE PESTAÑAS (TAB SWITCHER SUPERIOR) ── */}
      <div className={`grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl border shadow-md transition-all ${
        isDark ? 'bg-[#121B2D] border-[#1F2D48]' : 'bg-slate-200/70 border-slate-300'
      }`}>
        <button
          type="button"
          onClick={() => setWalletSectionTab('wallet')}
          className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 active:scale-[0.98] ${
            walletSectionTab === 'wallet'
              ? 'bg-gradient-to-r from-[#F7931A] to-[#E07D09] text-black shadow-glow-orange font-black'
              : isDark
              ? 'text-[#8C9BB4] hover:text-white hover:bg-[#1A253D]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <CreditCard className={`w-4 h-4 ${walletSectionTab === 'wallet' ? 'text-black' : 'text-[#F7931A]'}`} />
          <span>Mi billetera</span>
        </button>

        <button
          type="button"
          onClick={() => setWalletSectionTab('school')}
          className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 active:scale-[0.98] relative ${
            walletSectionTab === 'school'
              ? 'bg-gradient-to-r from-[#F0B90B] to-[#F7931A] text-black shadow-md font-black'
              : isDark
              ? 'text-[#8C9BB4] hover:text-white hover:bg-[#1A253D]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <GraduationCap className={`w-4 h-4 ${walletSectionTab === 'school' ? 'text-black' : 'text-[#F0B90B]'}`} strokeWidth={1.75} />
          <span>Escuela Cripto</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECCIÓN 1: PESTAÑA BILLETERA VALENSCOIN & COBROS FIAT ──        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {walletSectionTab === 'wallet' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Encabezado vectorial de sección (S11) */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#F7931A]" strokeWidth={1.75} />
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Billetera ValensCoin
              </h3>
            </div>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-lg border ${
              isDark ? 'text-[#8C9BB4] border-[#1F2D48] bg-[#121B2D]' : 'text-slate-600 border-slate-300 bg-white'
            }`}>
              Valens L1 · 0 decimales
            </span>
          </div>

          {/* 1.1 Bloque Fiat Existente (Cobros Fiduciarios P2P - Mantenido Intacto) */}
          <div className={`relative rounded-2xl border p-5 shadow-xl overflow-hidden transition-colors ${
            isDark
              ? 'bg-gradient-to-br from-[#064E3B] via-[#04332A] to-[#021A15] border-emerald-500/40 text-white'
              : 'bg-gradient-to-br from-white via-emerald-50/70 to-teal-50 border-emerald-300 text-slate-900'
          }`}>
            {/* Glow de ambientación financiera verde esmeralda */}
            <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Header fiduciario */}
            <div className="flex items-center justify-between mb-3">
              <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs ${
                isDark ? 'bg-[#021A15]/90 border-emerald-500/40' : 'bg-emerald-100 border-emerald-300 text-emerald-900'
              }`}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold">Cobros Fiduciarios P2P</span>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                0% Comisión Apps
              </span>
            </div>

            {/* (S14b-2) Actividad en VAL: sin saldo ni cotización en pesos */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-emerald-300/80' : 'text-emerald-800'}`}>
                Actividad acumulada
              </p>
              <span className="text-xs text-ink3">
                Servicios completados
              </span>
            </div>

            <div className="my-1.5 flex items-baseline space-x-2">
              <h2 className="text-3xl sm:text-4xl font-bold text-emerald-400 tracking-tight tabular-nums">
                {Number(totalValRecibidos).toFixed(0)}
              </h2>
              <span className={`text-base font-semibold ${isDark ? 'text-emerald-200' : 'text-emerald-900'}`}>VAL</span>
            </div>
            <p className={`text-xs font-medium ${isDark ? 'text-emerald-200/70' : 'text-slate-600'}`}>
              Agradecimientos recibidos por servicios completados en la red
            </p>

            <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-line">
              <div className={`p-2.5 rounded-card border border-line ${isDark ? 'bg-elev' : 'bg-white'}`}>
                <div className="flex items-center space-x-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className={`text-xs font-semibold ${isDark ? 'text-ink2' : 'text-slate-600'}`}>
                    Esta semana
                  </span>
                </div>
                <p className="text-base font-semibold text-emerald-400 tabular-nums">
                  {Number(valSemana).toFixed(0)} <span className="text-xs font-normal">VAL</span>
                </p>
              </div>

              <div className={`p-2.5 rounded-card border border-line ${isDark ? 'bg-elev' : 'bg-white'}`}>
                <div className="flex items-center space-x-1.5 mb-1">
                  <PiggyBank className="w-3.5 h-3.5 text-accent" />
                  <span className={`text-xs font-semibold ${isDark ? 'text-ink2' : 'text-slate-600'}`}>
                    Servicios
                  </span>
                </div>
                <p className="text-base font-semibold text-accent tabular-nums">
                  {serviciosSemana} <span className="text-xs font-normal">completados</span>
                </p>
              </div>
            </div>

            {/* Botones de Acción de Cobro Fiduciario */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setReceiveTab('fiat');
                  setShowQrReceiveModal(true);
                }}
                type="button"
                className="min-h-[44px] flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98]"
              >
                <DollarSign className="w-4 h-4 stroke-[2.5]" />
                <span>Cobrar ($ ARS)</span>
              </button>

              <button
                onClick={handleCopyAlias}
                type="button"
                className={`min-h-[44px] flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${
                  copiedAlias
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : isDark
                    ? 'bg-[#021A15] hover:bg-[#032921] text-emerald-300 border-emerald-500/40'
                    : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}
              >
                {copiedAlias ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {/* (S09.0) Etiqueta corta + tooltip: antes se truncaba como "Copiar Alias (Mercad…" */}
                <span className="truncate" title={`Copiar Alias de ${activeFiatProvider}`}>Copiar Alias</span>
              </button>
            </div>
          </div>

          {/* 1.2 Tarjeta de Saldo ValensCoin */}
          <div className={`relative rounded-2xl border p-5 shadow-xl overflow-hidden transition-colors ${
            isDark
              ? 'bg-gradient-to-br from-[#121B2D] via-[#101726] to-[#070C1E] border-[#1F2D48]'
              : 'bg-gradient-to-br from-white via-slate-50 to-amber-50/50 border-slate-200'
          }`}>
            {/* (S09.7) Orbes de glow eliminados: profundidad por borde, no por blur */}

            {/* Network Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs ${
                isDark ? 'bg-[#070C1E]/90 border-[#1F2D48]' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {/* (S09.5) Sin jerga técnica en primer plano */}
                <span className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>ValensCoin</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  isDark ? 'text-[#F0B90B] bg-[#F7931A]/10 border-[#F7931A]/30' : 'text-amber-800 bg-amber-100 border-amber-300 font-bold'
                }`}>
                  ValensCoin
                </span>
              </div>
            </div>

            {/* Balance Title & Amount */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                Saldo de agradecimiento
              </p>
            </div>

            {/* (S21) El saldo en VAL es la métrica principal: sin equivalencia en pesos */}
            <div className="my-1.5">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[34px] leading-none font-bold text-ink1 tracking-tight tabular-nums">
                  {Math.floor(balance)}.00
                </h2>
                <span className="text-sm font-semibold text-accent">VAL</span>
              </div>
              <p className="text-xs text-ink3 mt-1">
                Token de agradecimiento por cada servicio completado
              </p>
            </div>

            {/* (S09.5) La info técnica queda detrás de un desplegable */}
            <details className={`mt-3 rounded-xl border px-3 py-2 text-xs ${isDark ? 'bg-[#070C1E]/70 border-[#1F2D48] text-[#8C9BB4]' : 'bg-white/70 border-slate-200 text-slate-600'}`}>
              <summary className="cursor-pointer font-semibold select-none">¿Qué es ValensCoin?</summary>
              <p className="mt-2 leading-relaxed">
                Es un <strong>token de agradecimiento</strong>: se suma a tu billetera cada vez que completás un servicio
                y sirve para propinas y canjes entre vecinos de Alta Gracia.
              </p>
              <p className="mt-1 opacity-80">Detalles técnicos: red Valens L1 · 1.000.000.000.000 VAL · sin decimales.</p>
            </details>

            {/* Botones de Acción: Recibir (QR) y Enviar VAL */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setReceiveTab('crypto');
                  setShowQrReceiveModal(true);
                }}
                type="button"
                className={`min-h-[44px] flex items-center justify-center flex-col gap-1 py-2 px-2 rounded-xl text-xs font-semibold border shadow-md transition-all active:scale-[0.98] ${
                  isDark
                    ? 'bg-[#1A253D] hover:bg-[#202E4B] text-white border-[#2D3E61]'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                }`}
              >
                <QrCode className="w-4 h-4 text-[#F7931A]" />
                <span>Recibir (QR)</span>
              </button>

              <button
                onClick={() => setShowSendModal(true)}
                type="button"
                className={`min-h-[44px] flex items-center justify-center flex-col gap-1 py-2 px-2 rounded-xl text-xs font-semibold border shadow-md transition-all active:scale-[0.98] ${
                  isDark
                    ? 'bg-[#1A253D] hover:bg-[#202E4B] text-white border-[#2D3E61]'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-[#E02424]" />
                <span>Enviar VAL</span>
              </button>
            </div>
          </div>

          {/* 1.3 Dirección Pública (Clave Pública) con Copiado de 1 Clic */}
          <div className={`rounded-2xl border p-4 shadow-xl transition-colors ${
            isDark ? 'bg-[#121B2D] border-[#1F2D48]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-[#F7931A]" />
                <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Tu Clave Pública (Dirección)</span>
              </div>
              <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-700/50 font-medium">
                Segura para compartir
              </span>
            </div>

            <p className={`text-xs mb-2.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
              Esta es tu dirección pública en Valens L1 para recibir tokens, propinas o verificar tus firmas sin intermediarios.
            </p>

            <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
              isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono text-[#F0B90B] truncate mr-2 select-all font-semibold">
                {activeWalletAddress}
              </span>
              <button
                onClick={handleCopyPublicKey}
                className={`p-2 rounded-lg transition-all flex items-center space-x-1 flex-shrink-0 ${
                  copiedKey
                    ? 'bg-emerald-500 text-black font-bold text-xs'
                    : isDark
                    ? 'bg-[#1A253D] text-gray-200 hover:text-white hover:bg-[#202E4B]'
                    : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                }`}
              >
                {copiedKey ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-xs">Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 1.4 Historial de Movimientos On-Chain */}
          <div className={`rounded-2xl border p-4 shadow-xl transition-colors ${
            isDark ? 'bg-[#121B2D] border-[#1F2D48]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Historial de Movimientos
              </h3>
              <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {transactions.length} transacciones
              </span>
            </div>

            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        tx.amount > 0
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                          : 'bg-[#F7931A]/20 text-[#F7931A] border border-[#F7931A]/30'
                      }`}
                    >
                      {tx.amount > 0 ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{tx.title}</p>
                      <p className={`text-xs font-mono truncate ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                        {tx.date} • {tx.hash}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`font-mono font-bold ${
                        tx.amount > 0 ? 'text-emerald-400' : 'text-[#F0B90B]'
                      }`}
                    >
                      {tx.amount > 0 ? `+${Math.floor(Math.abs(tx.amount))}` : `-${Math.floor(Math.abs(tx.amount))}`} VAL
                    </p>
                    <span className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECCIÓN 2: PESTAÑA ESCUELA CRIPTO P2P (VISTA EDUCATIVA) ──     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {walletSectionTab === 'school' && (
        <div className="space-y-4 animate-fadeIn">
          {/* 2.1 Encabezado de Progreso de Educación Cripto */}
          <div className={`rounded-2xl border p-5 shadow-xl transition-colors relative overflow-hidden ${
            isDark ? 'bg-[#121B2D] border-[#1F2D48]' : 'bg-white border-slate-200'
          }`}>
            <div className="absolute top-0 right-0 w-36 h-36 bg-[#F7931A]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#F7931A] to-[#F0B90B] p-0.5 shadow-glow-orange flex items-center justify-center">
                  <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${isDark ? 'bg-[#0A1128]' : 'bg-white'}`}>
                    <GraduationCap className="w-4 h-4 text-[#F7931A]" strokeWidth={1.75} />
                  </div>
                </div>
                <div>
                  <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Escuela Cripto P2P</h3>
                  <p className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                    Educación soberana y autocustodia para Alta Gracia
                  </p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                isAllCompleted 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                  : isDark ? 'bg-[#070C1E] text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}>
                {completedModules.length}/{totalModules} Completados
              </span>
            </div>

            {/* Barra de Progreso Interactiva */}
            <div className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-amber-50/50 border-amber-200'
            }`}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  <Award className="w-4 h-4 text-[#F7931A]" />
                  <span>Progreso: {completedModules.length} de {totalModules} Módulos ({progressPercentage}%)</span>
                </span>
                {isAllCompleted && (
                  <span className="text-xs font-black text-emerald-400 animate-pulse">
                    🎓 ¡Graduado Soberano!
                  </span>
                )}
              </div>

              <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div 
                  className="h-full bg-gradient-to-r from-[#F7931A] via-[#F0B90B] to-emerald-400 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {isAllCompleted ? (
                <p className="text-xs text-emerald-400 mt-2.5 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>¡Felicitaciones! Has completado todos los módulos formativos de soberanía monetaria.</span>
                </p>
              ) : (
                <p className={`text-[10.5px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Abre y marca cada módulo para afianzar tus conocimientos de seguridad y desbloquear recompensas comunitarias.
                </p>
              )}
            </div>
          </div>

          {/* 2.2 Módulos Educativos Colapsables (Acordeón de 4 Módulos) */}
          <div className="space-y-2.5">
            <h4 className={`text-xs font-bold uppercase tracking-wider px-1 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
              Módulos Formativos (Toca para desplegar)
            </h4>

            {CRYPTO_SCHOOL_MODULES.map((module) => {
              const isOpen = openModuleId === module.id;
              const isCompleted = completedModules.includes(module.id);

              return (
                <div
                  key={module.id}
                  className={`rounded-2xl border overflow-hidden transition-all shadow-md ${
                    isCompleted
                      ? isDark ? 'border-emerald-500/40 bg-[#0A1A22]' : 'border-emerald-300 bg-emerald-50/40'
                      : isDark ? 'border-[#1F2D48] bg-[#121B2D]' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenModuleId(isOpen ? null : module.id)}
                    className={`w-full p-3.5 flex items-center justify-between text-left transition-colors ${
                      isDark ? 'hover:bg-[#18243C]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div className={`p-2 rounded-xl border flex-shrink-0 ${
                        isCompleted 
                          ? 'bg-emerald-500/20 border-emerald-500/50' 
                          : isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-slate-100 border-slate-200'
                      }`}>
                        {getModuleIcon(module.icon)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {module.title}
                          </h4>
                          {isCompleted && (
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-600/50">
                              ✓ Completado
                            </span>
                          )}
                        </div>
                        <p className={`text-[10.5px] truncate mt-0.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>
                          {module.subtitle}
                        </p>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#F7931A] flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#8C9BB4] flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className={`p-4 border-t space-y-3 text-xs leading-relaxed animate-fadeIn ${
                      isDark ? 'bg-[#070C1E]/95 border-[#1F2D48] text-gray-300' : 'bg-slate-50/80 border-slate-200 text-slate-700'
                    }`}>
                      <div className={`p-3 rounded-xl border ${
                        isDark ? 'text-white bg-[#121B2D] border-[#1F2D48]' : 'text-slate-900 bg-amber-50/70 border-amber-200'
                      }`}>
                        <p className="font-semibold text-xs flex items-start gap-1.5">
                          <span className="text-base">💡</span>
                          <span>{module.summary}</span>
                        </p>
                      </div>

                      <div className="space-y-1.5 pl-1">
                        <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Puntos Clave del Módulo:
                        </p>
                        <ul className="space-y-1.5">
                          {module.points.map((pt, i) => (
                            <li key={i} className="flex items-start space-x-2 text-xs">
                              <span className="text-[#F7931A] font-bold">•</span>
                              <span className={isDark ? 'text-gray-200' : 'text-slate-700'}>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* (S14b-3) Sin botón de "marcar como leído": los VAL solo
                          se acreditan aprobando el quiz (≥ 4/5) con sesión. */}
                      <div className="pt-2 flex items-center justify-between border-t border-line">
                        <span className={`text-xs ${isDark ? 'text-ink3' : 'text-slate-500'}`}>
                          Comprensión verificada en el quiz
                        </span>
                        <span className={`px-3 py-2 rounded-control text-xs font-semibold ${
                          isCompleted
                            ? 'bg-emerald-500 text-black'
                            : 'bg-elev text-ink3 border border-line'
                        }`}>
                          {isCompleted ? '✓ Módulo verificado' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 2.3 Mini-Trivia de Seguridad Interactiva */}
          <div className={`p-4 rounded-2xl border shadow-xl transition-all ${
            isDark
              ? 'bg-gradient-to-br from-[#121B2D] via-[#101726] to-[#0A1128] border-[#F7931A]/30'
              : 'bg-gradient-to-br from-white via-amber-50/50 to-orange-50/40 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-2 text-[#F0B90B]">
                <HelpCircle className="w-4 h-4 text-[#F7931A]" />
                <span className={`text-xs font-bold ${isDark ? 'text-[#F0B90B]' : 'text-amber-900'}`}>
                  Mini-Trivia de Seguridad Cripto
                </span>
              </div>
              <div className="flex items-center gap-1">
                {SECURITY_TRIVIA_QUESTIONS.map((q, idx) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentTriviaIndex(idx)}
                    className={`w-6 h-6 rounded-lg text-xs font-bold border transition-all ${
                      currentTriviaIndex === idx
                        ? 'bg-[#F7931A] text-black border-[#F7931A]'
                        : triviaClaimed[q.id]
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : isDark
                        ? 'bg-[#070C1E] text-slate-400 border-[#1F2D48]'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Pregunta Activa */}
            {(() => {
              const currentQ = SECURITY_TRIVIA_QUESTIONS[currentTriviaIndex];
              const selectedAnswer = triviaAnswers[currentQ.id];
              const isAnswered = selectedAnswer !== undefined;
              const isCorrect = selectedAnswer === currentQ.correctIndex;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-mono font-bold uppercase tracking-wider ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    }`}>
                      {currentQ.title}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {currentTriviaIndex + 1} de {SECURITY_TRIVIA_QUESTIONS.length}
                    </span>
                  </div>

                  <p className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {currentQ.question}
                  </p>

                  <div className="space-y-2">
                    {currentQ.options.map((option, idx) => {
                      const isOptionSelected = selectedAnswer === idx;
                      let btnStyle = isDark
                        ? 'bg-[#070C1E] border-[#1F2D48] text-gray-300 hover:border-[#2D3E61]'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400';

                      if (isAnswered) {
                        if (idx === currentQ.correctIndex) {
                          btnStyle = 'bg-emerald-950/70 border-emerald-500 text-emerald-300 font-bold';
                        } else if (isOptionSelected) {
                          btnStyle = 'bg-rose-950/70 border-rose-500 text-rose-300';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleTriviaAnswer(currentQ.id, idx)}
                          className={`w-full text-left p-2.5 rounded-xl text-xs transition-all border flex items-start gap-2 ${btnStyle}`}
                        >
                          <span className="font-bold flex-shrink-0">{['A', 'B', 'C'][idx]}.</span>
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Explicación y feedback didáctico */}
                  {isAnswered && (
                    <div className={`p-3 rounded-xl border text-xs animate-fadeIn ${
                      isCorrect 
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
                        : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    }`}>
                      <p className="font-bold mb-1 flex items-center gap-1.5">
                        {isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                        <span>{isCorrect ? '¡Respuesta Correcta!' : 'Respuesta Incorrecta'}</span>
                      </p>
                      <p className="text-[10.5px] leading-relaxed">
                        {currentQ.explanation}
                      </p>
                    </div>
                  )}

                  {/* Controles Siguiente / Anterior */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={currentTriviaIndex === 0}
                      onClick={() => setCurrentTriviaIndex((prev) => Math.max(0, prev - 1))}
                      className="text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none py-1 px-2"
                    >
                      ← Anterior
                    </button>

                    <button
                      type="button"
                      disabled={currentTriviaIndex === SECURITY_TRIVIA_QUESTIONS.length - 1}
                      onClick={() => setCurrentTriviaIndex((prev) => Math.min(SECURITY_TRIVIA_QUESTIONS.length - 1, prev + 1))}
                      className="text-xs text-[#F0B90B] hover:underline disabled:opacity-30 disabled:pointer-events-none py-1 px-2 font-bold flex items-center gap-1"
                    >
                      <span>Siguiente</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 2.4 Recompensa real de 5 VAL de la Escuela Cripto (S11) */}
          <div className={`p-4 rounded-2xl border shadow-xl transition-colors ${
            schoolRewardClaimed
              ? isDark ? 'bg-[#0A1A22] border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
              : isDark ? 'bg-[#121B2D] border-[#F7931A]/30' : 'bg-gradient-to-br from-white to-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#F7931A]" strokeWidth={1.75} />
                <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Recompensa de la Escuela Cripto
                </h4>
              </div>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
                triviaScore >= 4
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : isDark ? 'bg-[#070C1E] text-[#8C9BB4] border-[#1F2D48]' : 'bg-white text-slate-600 border-slate-200'
              }`}>
                {triviaScore}/5
              </span>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
              Aprobá el cuestionario con al menos <strong>4 de 5</strong> respuestas correctas y recibí{' '}
              <strong className="text-[#F0B90B]">5 VAL</strong> reales en tu billetera. La recompensa se otorga una sola vez.
            </p>

            {schoolRewardClaimed ? (
              <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/40">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-bold text-emerald-400">
                  Recompensa de 5 VAL ya reclamada
                </span>
              </div>
            ) : canClaimSchoolReward ? (
              <button
                type="button"
                onClick={handleClaimSchoolReward}
                disabled={isClaimingReward}
                className="mt-3 w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#F7931A] to-[#E07D09] text-black text-xs font-black shadow-glow-orange hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isClaimingReward ? 'Acreditando 5 VAL...' : 'Reclamar recompensa de 5 VAL'}</span>
              </button>
            ) : isQuizCompleted && triviaScore < 4 ? (
              <div className="mt-3 space-y-2">
                <div className="p-2.5 rounded-xl border bg-rose-500/10 border-rose-500/40">
                  <p className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Obtuviste {triviaScore}/5. Necesitás 4/5 para aprobar.</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRetryQuiz}
                  className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] ${
                    isDark ? 'bg-[#1A253D] text-white border-[#2D3E61]' : 'bg-white text-slate-800 border-slate-300'
                  }`}
                >
                  Reintentar cuestionario
                </button>
              </div>
            ) : (
              <div className={`mt-3 p-2.5 rounded-xl border text-xs ${
                isDark ? 'bg-[#070C1E] border-[#1F2D48] text-[#8C9BB4]' : 'bg-white border-slate-200 text-slate-600'
              }`}>
                Progreso: {triviaAnsweredCount}/{SECURITY_TRIVIA_QUESTIONS.length} preguntas respondidas.
                Completá las 5 para habilitar el reclamo.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: ENVIAR VALENSCOIN (VAL) ─────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          {/* (S17) Encuadre móvil: alto acotado y scroll interno para que se vean
              cámara, código y botón de envío sin estirar la pantalla. */}
          <div className={`border rounded-t-2xl sm:rounded-2xl max-w-sm w-full max-h-[88dvh] overflow-y-auto overscroll-contain p-5 pb-8 sm:pb-5 shadow-2xl relative ${
            isDark ? 'bg-[#121B2D] border-[#1F2D48] text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <button
              onClick={() => { setShowSendModal(false); setSendAddress(''); setSendAmount(''); }}
              className="absolute top-3 right-3 text-[#8C9BB4] hover:text-white p-1 rounded-lg transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#E02424]/20 border border-[#E02424]/40 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-[#E02424]" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold">Enviar ValensCoin</h3>
                <p className={`text-xs ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Transferencia directa (enteros)</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Saldo disponible */}
              <div className={`p-3 rounded-xl border text-center ${
                isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-amber-50 border-amber-200'
              }`}>
                <p className={`text-xs mb-0.5 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-500'}`}>Saldo disponible</p>
                <p className="text-2xl font-black text-[#F0B90B] font-mono">{Math.floor(balance)} VAL</p>
              </div>

              {/* Dirección de destino */}
              <div className="text-left">
                <label className={`text-xs font-bold block mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Dirección de destino (vlx1...):
                </label>
                <input
                  type="text"
                  value={sendAddress}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val.startsWith('valens:')) {
                      const match = val.match(/valens:([^?]+)/);
                      if (match) setSendAddress(match[1]);
                      const amtMatch = val.match(/amount=(\d+)/);
                      if (amtMatch) setSendAmount(amtMatch[1]);
                    } else {
                      setSendAddress(val);
                    }
                  }}
                  placeholder="vlx1..."
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#F7931A] transition-colors ${
                    isDark ? 'bg-[#070C1E] border-[#1F2D48] text-[#F0B90B]' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              {/* (S14e) Lector de QR: cámara + respaldo manual */}
              <div className="text-left">
                <button
                  type="button"
                  onClick={() => { setShowQrScanner((v) => !v); if (showQrScanner) stopQrCamera(); }}
                  className="min-h-touch w-full rounded-control border border-line bg-card text-ink2 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4 text-accent" strokeWidth={1.75} />
                  {showQrScanner ? 'Cerrar lector de QR' : 'Escanear QR de GREMAMI'}
                </button>

                {showQrScanner && (
                  <div className="mt-2 rounded-card border border-line bg-card p-3 space-y-2">
                    {/* (S17) Visor más bajo en móvil (h-32) y marco guía visible */}
                    <div className="relative w-full h-32 sm:h-40 rounded-control overflow-hidden bg-app border border-line">
                      <video
                        id="gremami-qr-video"
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {!qrScanning && (
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-ink3 px-4 text-center">
                          Cámara apagada
                        </div>
                      )}
                      {qrScanning && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-28 h-28 rounded-xl border-2 border-accent/80" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setQrStatus('Apuntá la cámara al QR de GREMAMI…'); startQrCamera(); }}
                        disabled={qrScanning}
                        className="min-h-touch flex-1 rounded-control bg-accent text-slate-950 text-xs font-semibold"
                      >
                        {qrScanning ? 'Buscando QR…' : 'Activar cámara'}
                      </button>
                      <button
                        type="button"
                        onClick={stopQrCamera}
                        className="min-h-touch px-3 rounded-control border border-line bg-elev text-ink2 text-xs font-semibold"
                      >
                        Detener
                      </button>
                    </div>
                    <label htmlFor="qr-manual" className="block text-[11px] font-semibold text-ink3">
                      O pegá el código (respaldo sin cámara):
                    </label>
                    <input
                      id="qr-manual"
                      type="text"
                      value={qrManual}
                      onChange={(e) => { setQrManual(e.target.value); setQrStatus(''); }}
                      placeholder="valens:DIRECCION?amount=1"
                      className="w-full min-h-touch rounded-control px-3 bg-app border border-line text-xs text-ink1 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => applyQrPayload(qrManual)}
                      className="min-h-touch w-full rounded-control border border-line bg-elev text-ink1 text-xs font-semibold"
                    >
                      Usar este código
                    </button>
                  </div>
                )}

                {/* (S18) Confirmación fuera del panel: sigue visible al auto-cerrar */}
                {qrStatus && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={`mt-2 text-[11px] font-semibold leading-snug rounded-control px-2 py-1.5 border ${
                      qrStatus.startsWith('QR leído')
                        ? isDark
                          ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                          : 'text-emerald-700 border-emerald-300 bg-emerald-50'
                        : qrStatus.startsWith('Apuntá')
                        ? 'text-ink2 border-line bg-elev'
                        : isDark
                        ? 'text-accent border-accent/40 bg-accent/10'
                        : 'text-amber-700 border-amber-300 bg-amber-50'
                    }`}
                  >
                    {qrStatus}
                  </p>
                )}
              </div>

              {/* Monto en VAL */}
              <div className="text-left">
                <div className="flex items-center justify-between mb-1">
                  <label className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Monto a enviar (VAL enteros):
                  </label>
                  <div className="flex items-center space-x-1">
                    {[1, 5, 10].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setSendAmount(String(amt))}
                        className={`text-xs px-1.5 py-0.5 rounded border font-mono transition-colors ${
                          isDark ? 'bg-[#1A253D] border-[#2D3E61] text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        +{amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSendAmount(String(Math.floor(balance)))}
                      className={`text-xs px-1.5 py-0.5 rounded border font-mono font-bold transition-colors ${
                        isDark ? 'bg-[#F7931A]/20 border-[#F7931A]/40 text-[#F0B90B]' : 'bg-amber-100 border-amber-300 text-amber-800'
                      }`}
                    >
                      Máx
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="ej. 5"
                  className={`w-full border rounded-xl px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:border-[#F7931A] transition-colors ${
                    isDark ? 'bg-[#070C1E] border-[#1F2D48] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                {/* (S19) Sin cotización fiat: VAL se transfiere en VAL, sin USD/ARS. */}
              </div>

              {/* Alerta de seguridad */}
              <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                isDark ? 'bg-[#E02424]/10 border-[#E02424]/30' : 'bg-red-50 border-red-200'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 text-[#E02424] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#E02424] leading-relaxed">
                  Las transacciones son <strong>irreversibles</strong>. Verifica la dirección antes de confirmar.
                </p>
              </div>

              {/* Botones de acción */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowSendModal(false); setSendAddress(''); setSendAmount(''); }}
                  className={`min-h-[44px] rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    isDark ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-slate-300 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSending || !sendAddress.trim() || !sendAmount || parseInt(sendAmount) <= 0 || parseInt(sendAmount) > Math.floor(balance)}
                  onClick={async () => {
                    if (isSending) return;
                    setIsSending(true);
                    try {
                      // (S22) Normalizar a lo que espera transferTokens: si el usuario o el
                      // QR traen "vlx1..." (o valens:vlx1...), se envía como "valens" + addr
                      // para que la validación del contexto no rechace direcciones reales.
                      const rawAddr = sendAddress.trim().replace(/^valens:\/*/i, '');
                      const normalizedAddr = /^valens/i.test(rawAddr)
                        ? rawAddr
                        : `valens${rawAddr}`;
                      const result = await transferTokens(normalizedAddr, parseInt(sendAmount));
                      if (result?.success) {
                        setShowSendModal(false);
                        setSendAddress('');
                        setSendAmount('');
                      }
                    } finally {
                      setIsSending(false);
                    }
                  }}
                  className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#E02424] to-[#F7931A] text-black text-xs font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? 'Enviando...' : `Enviar ${sendAmount || 0} VAL`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL MULTIMONEDA: RECIBIR VALENSCOIN Y PESOS ($ ARS) ──       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showQrReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className={`border rounded-2xl max-w-sm w-full p-5 shadow-2xl relative text-center max-h-[90dvh] overflow-y-auto ${
            isDark ? 'bg-[#121B2D] border-[#1F2D48] text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <button
              onClick={() => setShowQrReceiveModal(false)}
              className="absolute top-3 right-3 text-[#8C9BB4] hover:text-white p-1 rounded-lg transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-start mb-3">
              <button
                onClick={() => setShowQrReceiveModal(false)}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
                <span>Volver</span>
              </button>
            </div>

            <h3 className="text-sm font-bold mb-1">
              {receiveTab === 'fiat' ? 'Cobros en Pesos ($ ARS)' : 'Recibir ValensCoin (VAL)'}
            </h3>
            <p className={`text-xs mb-3 ${isDark ? 'text-[#8C9BB4]' : 'text-slate-600'}`}>
              Transacciones directas sin comisiones corporativas en Alta Gracia
            </p>

            {/* Selector de 2 Pestañas (Tabs Multimoneda) */}
            <div className={`grid grid-cols-2 gap-1 p-1 rounded-xl border mb-3 ${
              isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setReceiveTab('crypto')}
                className={`min-h-[44px] py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  receiveTab === 'crypto'
                    ? 'bg-gradient-to-r from-[#F7931A] to-[#E07D09] text-black shadow-md font-black'
                    : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>ValensCoin (VAL)</span>
              </button>

              <button
                type="button"
                onClick={() => setReceiveTab('fiat')}
                className={`min-h-[44px] py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  receiveTab === 'fiat'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md font-black'
                    : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Pesos ($ ARS)</span>
              </button>
            </div>

            {/* TAB 1: ValensCoin (VAL) */}
            {receiveTab === 'crypto' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border-4 border-[#F7931A] my-1">
                  {/* (S11) QR vectorial real y escaneable de la dirección Valens persistida */}
                  <QRCodeSVG
                    value={activeWalletAddress}
                    size={168}
                    level="M"
                    marginSize={2}
                    bgColor="#FFFFFF"
                    fgColor="#0A1128"
                    title={`Dirección ValensCoin de ${userName || 'tu billetera'}`}
                    className="w-40 h-40"
                  />
                </div>

                {/* Monto opcional a solicitar */}
                <div className="text-left">
                  <label className={`text-xs font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Monto a solicitar en VAL (opcional):
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={receiveCustomAmount}
                    onChange={(e) => setReceiveCustomAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="ej. 10 (sin decimales)"
                    className={`w-full border rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-[#F7931A] ${
                      isDark ? 'bg-[#070C1E] border-[#1F2D48] text-[#F0B90B]' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div className={`p-2.5 rounded-xl border text-left ${
                  isDark ? 'bg-[#070C1E] border-[#1F2D48]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-xs text-slate-400 block mb-0.5">Tu dirección para recibir:</span>
                  <span className="text-xs font-mono text-[#F0B90B] break-all select-all font-semibold block">
                    {activeWalletAddress}
                  </span>
                  <span className="text-[9.5px] font-mono text-slate-400 break-all select-all block mt-1.5 border-t border-slate-800/40 pt-1">
                    URI: {receiveUri}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPublicKey}
                    className="min-h-[44px] py-2 px-2 rounded-xl bg-gradient-to-r from-[#F7931A] to-[#E07D09] text-black font-bold text-xs shadow-glow-orange hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedKey ? '¡Copiada!' : 'Copiar Dirección'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(receiveUri);
                      setCopiedQrUri(true);
                      showToast('🔗 Enlace QR de cobro copiado', 'success');
                      setTimeout(() => setCopiedQrUri(false), 2000);
                    }}
                    className={`min-h-[44px] py-2 px-2 rounded-xl border font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 ${
                      isDark ? 'bg-[#1A253D] hover:bg-[#202E4B] text-white border-[#2D3E61]' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    }`}
                  >
                    {copiedQrUri ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#F7931A]" />}
                    <span>{copiedQrUri ? '¡URI Copiado!' : 'Copiar Enlace'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Pesos ($ ARS / Transferencia) */}
            {receiveTab === 'fiat' && (
              <div className="space-y-3 animate-fadeIn text-left">
                {/* Cabecera de la Entidad Activa de Cobro */}
                <div className="flex items-center justify-between p-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl flex-shrink-0">{activeProviderInfo?.iconEmoji || '💙'}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-emerald-400 truncate">
                        {activeFiatProvider}
                      </p>
                      <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {activeProviderInfo?.badge || 'Billetera Virtual'} • 0% Comisiones
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWalletFormFiatProvider(activeFiatProvider);
                      setWalletFormFiatAlias(activeFiatAlias);
                      setWalletFormFiatCbuCvu(userProfile?.fiatCbuCvu || '');
                      setWalletFormFiatHolder(userProfile?.fiatHolderName || '');
                      setWalletFormFiatCuit(userProfile?.fiatCuit || '');
                      setShowFiatConfigPanel(!showFiatConfigPanel);
                    }}
                    className="px-2.5 py-1 rounded-lg border text-[10.5px] font-bold text-emerald-300 hover:bg-emerald-500/20 border-emerald-500/40 transition-all flex items-center gap-1 flex-shrink-0 active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{showFiatConfigPanel ? 'Cerrar' : 'Cambiar Billetera'}</span>
                  </button>
                </div>

                {/* Panel Interactivo de Cambio Rápido de Billetera FIAT */}
                {showFiatConfigPanel ? (
                  <div className={`p-3 rounded-2xl border space-y-2.5 ${
                    isDark ? 'bg-[#070C1E] border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                  }`}>
                    <p className="text-xs font-bold text-slate-300">
                      Seleccionar Billetera Virtual o Banco:
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto no-scrollbar">
                      {ARGENTINE_FIAT_PROVIDERS.map((prov) => {
                        const isSel = walletFormFiatProvider === prov.name;
                        return (
                          <button
                            key={prov.id}
                            type="button"
                            onClick={() => {
                              setWalletFormFiatProvider(prov.name);
                              if (!walletFormFiatAlias || walletFormFiatAlias === 'cadete.gremami.mp') {
                                setWalletFormFiatAlias(prov.placeholderAlias);
                              }
                            }}
                            className={`p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                              isSel
                                ? 'bg-emerald-500/25 border-emerald-400 text-white font-bold'
                                : isDark
                                ? 'bg-[#121B2D] border-slate-700 text-slate-300'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="text-sm mb-0.5">{prov.iconEmoji}</span>
                            <span className="text-xs truncate leading-tight">{prov.shortName}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div>
                        <label className="text-xs font-bold text-slate-400 block mb-0.5">
                          Alias ({walletFormFiatProvider}):
                        </label>
                        <input
                          type="text"
                          value={walletFormFiatAlias}
                          onChange={(e) => setWalletFormFiatAlias(e.target.value)}
                          placeholder="ej. cadete.gremami.mp"
                          className={`w-full border rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-emerald-400 ${
                            isDark ? 'bg-[#121B2D] border-slate-700 text-emerald-300' : 'bg-white border-emerald-300 text-emerald-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-400 block mb-0.5">
                          CBU o CVU (22 dígitos):
                        </label>
                        <input
                          type="text"
                          value={walletFormFiatCbuCvu}
                          onChange={(e) => setWalletFormFiatCbuCvu(e.target.value)}
                          placeholder="ej. 0000003100049281729384"
                          maxLength={22}
                          className={`w-full border rounded-xl px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-400 ${
                            isDark ? 'bg-[#121B2D] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowFiatConfigPanel(false)}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveWalletFiat}
                        disabled={isSavingWalletFiat}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black active:scale-95 transition-all shadow-sm"
                      >
                        {isSavingWalletFiat ? 'Guardando...' : 'Guardar y Usar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* (S21) Sin QR decorativo: se removió el gráfico sin función operativa.
                        Los datos de cobro (alias, titular, CBU/CVU) son la fuente real. */}

                    {/* Ficha de Datos Bancarios para Transferencia */}
                    <div className={`p-3 rounded-xl border space-y-2 ${
                      isDark ? 'bg-[#070C1E] border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-400 font-bold block">
                          Alias de Cobro ({activeFiatProvider}):
                        </span>
                        <span className="text-[9.5px] font-mono text-slate-400">
                          Acreditación Inmediata
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-black text-emerald-300 break-all select-all">
                          {activeFiatAlias}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyAlias}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 flex-shrink-0 active:scale-95 transition-all shadow-sm"
                        >
                          {copiedAlias ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedAlias ? '¡Listo!' : 'Copiar'}</span>
                        </button>
                      </div>

                      {/* Desglose de Titular, CUIT y CBU */}
                      <div className="pt-2 border-t border-emerald-500/20 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block">Titular:</span>
                          <span className="font-bold text-slate-200 truncate block">
                            {userProfile?.fiatHolderName || 'Satoshi Dev Nakamoto'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">CUIT/CUIL:</span>
                          <span className="font-mono font-semibold text-slate-200 block">
                            {userProfile?.fiatCuit || '20-38492019-4'}
                          </span>
                        </div>
                        {userProfile?.fiatCbuCvu && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block">CBU/CVU:</span>
                            <span className="font-mono text-slate-300 text-[9.5px] break-all block">
                              {userProfile.fiatCbuCvu}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botón Principal: Copiar Alias de [Billetera] */}
                    <button
                      type="button"
                      onClick={handleCopyAlias}
                      className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-4 h-4" />
                      <span>{copiedAlias ? `¡Alias de ${activeFiatProvider} Copiado!` : `Copiar Alias de ${activeFiatProvider}`}</span>
                    </button>

                    <div className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                      isDark ? 'bg-[#0B132B] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}>
                      <p className="font-bold text-emerald-400">💡 Instrucciones de Cobro sin Comisión:</p>
                      <p className="text-xs leading-relaxed">
                        • El cliente te transfiere directamente desde Mercado Pago, Ualá, Lemon, Brubank o su banco.
                      </p>
                      <p className="text-xs leading-relaxed">
                        • 0% retenciones corporativas (ahorras el 30% que cobran otras aplicaciones).
                      </p>
                      <p className="text-xs leading-relaxed">
                        • Acreditación instantánea en tu cuenta sin intermediarios.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
