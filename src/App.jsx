import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseApp = initializeApp({
  apiKey: "AIzaSyDWobakstAyjx-rTGJupLDgDZ_Jzkfv0xc",
  authDomain: "kidpill.firebaseapp.com",
  projectId: "kidpill",
  storageBucket: "kidpill.firebasestorage.app",
  messagingSenderId: "228749438184",
  appId: "1:228749438184:web:7d08dfc0f83e3942d72d5d",
});
const auth = getAuth(firebaseApp);

const getApiUrl = (endpoint) => `/api/${endpoint}`;

const parseExpDate = (dateStr) => {
  if (!dateStr || dateStr === '—') return null;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('.');
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}\.\d{4}$/.test(dateStr)) {
    const [m, y] = dateStr.split('.');
    return new Date(y, m - 1, 1);
  }
  return new Date(dateStr);
};

const isExpired = (dateStr) => {
  const date = parseExpDate(dateStr);
  if (!date) return false;
  return date < new Date();
};

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === '—') return '—';
  const date = parseExpDate(dateStr);
  if (!date || isNaN(date)) return dateStr;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);
  return `${d}.${m}.${y}`;
};

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);

// ── AUTH SCREEN ──
const AuthScreen = ({ onAuth }) => {
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const codeRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const timerRef = useRef(null);

  const formatPhone = (val) => {
    const d = val.replace(/\D/g, '').slice(0, 10);
    let r = '';
    if (d.length > 0) r += '(' + d.slice(0, 3);
    if (d.length >= 3) r += ') ' + d.slice(3, 6);
    if (d.length >= 6) r += '-' + d.slice(6, 8);
    if (d.length >= 8) r += '-' + d.slice(8, 10);
    return r;
  };

  const startTimer = () => {
    setTimer(60);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const sendCode = async () => {
    const digits10 = phone.replace(/\D/g, '');
    if (digits10.length < 10) { setError('Введите полный номер телефона'); return; }
    setLoading(true);
    setError('');
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
      const fullPhone = '+7' + digits10;
      const result = await signInWithPhoneNumber(auth, fullPhone, window.recaptchaVerifier);
      setConfirmationResult(result);
      setStep('code');
      startTimer();
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch (e) {
      setError('Ошибка отправки кода: ' + e.message);
      // сбросить recaptcha при ошибке
      window.recaptchaVerifier = null;
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (i, val) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError('');
    if (d && i < 5) codeRefs[i + 1].current?.focus();
  };

  const handleDigitKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) codeRefs[i - 1].current?.focus();
  };

  const verifyCode = async () => {
    const code = digits.join('');
    if (code.length < 6) { setError('Введите 6-значный код'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(code);
      localStorage.setItem('pillbox_token', result.user.uid);
      onAuth(result.user.uid);
    } catch {
      setError('Неверный код');
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => codeRefs[0].current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="40" height="40">
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
          <path d="M12 8v8M8 12h8"/>
        </svg>
        <span>Аптечка</span>
      </div>

      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" />

      <div className="auth-card">
        {step === 'phone' ? (
          <>
            <h2 className="auth-title">Вход</h2>
            <p className="auth-sub">Введите номер телефона, мы отправим SMS с кодом</p>
            <div className="auth-phone-row">
              <div className="auth-prefix">+7</div>
              <input
                className="auth-phone-input"
                type="tel"
                placeholder="(900) 000-00-00"
                value={formatPhone(phone)}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && sendCode()}
                inputMode="numeric"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button className="primary-btn" onClick={sendCode} disabled={loading}>
              {loading ? 'Отправка...' : 'Получить код'}
            </button>
          </>
        ) : (
          <>
            <h2 className="auth-title">Введите код</h2>
            <p className="auth-sub">Отправили SMS на +7{phone.slice(0,3)}***{phone.slice(-2)}</p>
            <div className="code-inputs">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={codeRefs[i]}
                  className="code-cell"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                />
              ))}
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button className="primary-btn" onClick={verifyCode} disabled={loading}>
              {loading ? 'Проверка...' : 'Войти'}
            </button>
            <button
              className="auth-resend"
              onClick={() => { setDigits(['', '', '', '', '', '']); sendCode(); }}
              disabled={timer > 0 || loading}
            >
              {timer > 0 ? `Повторить через ${timer}с` : 'Отправить код повторно'}
            </button>
            <button className="auth-back" onClick={() => { setStep('phone'); setError(''); setDigits(['', '', '', '', '', '']); }}>
              ← Изменить номер
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const App = () => {
  // ── AUTH ──
  const [authStep, setAuthStep] = useState(() => localStorage.getItem('pillbox_token') ? 'done' : 'phone');

  // ── NAV ──
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'search' | 'schedule' | 'profile'

  // ── MEDICINES ──
  const [medicines, setMedicines] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pillbox') || '[]'); }
    catch { return []; }
  });
  const [homeSearch, setHomeSearch] = useState('');
  const [swipedMedId, setSwipedMedId] = useState(null);

  // ── MANUAL ADD ──
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualExp, setManualExp] = useState('');
  const [manualQty, setManualQty] = useState(15);

  // ── SCANNER ──
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [addQty, setAddQty] = useState(15);
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── PHARMACY SEARCH ──
  const [pharmName, setPharmName] = useState('');
  const [pharmResults, setPharmResults] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // ── PROFILE ──
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pillbox_profile') || '{}'); }
    catch { return {}; }
  });
  const [profileEdit, setProfileEdit] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAllergy, setProfileAllergy] = useState('');

  // ── SCHEDULE ──
  const [intakes, setIntakes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pillbox_intakes') || '[]'); }
    catch { return []; }
  });
  const [addIntakeOpen, setAddIntakeOpen] = useState(false);
  const [intakeName, setIntakeName] = useState('');
  const [intakeTime, setIntakeTime] = useState('');
  const [intakeQty, setIntakeQty] = useState(1);
  const [swipedIntakeId, setSwipedIntakeId] = useState(null);

  const touchStartX = useRef(null);

  useEffect(() => {
    localStorage.setItem('pillbox', JSON.stringify(medicines));
  }, [medicines]);

  useEffect(() => {
    localStorage.setItem('pillbox_intakes', JSON.stringify(intakes));
  }, [intakes]);

  useEffect(() => {
    localStorage.setItem('pillbox_profile', JSON.stringify(profile));
  }, [profile]);

  const openProfile = () => {
    setProfileName(profile.name || '');
    setProfilePhone(profile.phone || '');
    setProfileAllergy(profile.allergy || '');
    setProfileEdit(false);
    setActiveTab('profile');
  };

  const saveProfile = () => {
    setProfile({ name: profileName, phone: profilePhone, allergy: profileAllergy });
    setProfileEdit(false);
  };

  // ── MANUAL ADD ──
  const openManual = () => {
    setManualName('');
    setManualExp('');
    setManualQty(15);
    setManualOpen(true);
  };

  const handleManualAdd = () => {
    if (!manualName.trim()) return;
    setMedicines(prev => [{
      id: Date.now(),
      name: manualName.trim(),
      expDate: manualExp || null,
      quantity: manualQty,
    }, ...prev]);
    setManualOpen(false);
  };

  // ── SCANNER ──
  const openScanner = () => {
    setScanResult(null);
    setScanError(null);
    setAddQty(15);
    setScannerOpen(true);
    setTimeout(() => startScanner(), 200);
  };

  const closeScanner = () => {
    stopScanner();
    setScanResult(null);
    setScanError(null);
    setScannerOpen(false);
  };

  const startScanner = async () => {
    setScanResult(null);
    setScanError(null);
    setScanning(true);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    readerRef.current = reader;
    try {
      const devices = await reader.listVideoInputDevices();
      const back = devices.find(d => /back|rear|задн/i.test(d.label)) || devices[0];
      await reader.decodeFromConstraints(
        { video: { deviceId: back?.deviceId, width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' } },
        videoRef.current,
        (result) => { if (result) fetchProduct(result.getText()); }
      );
    } catch (err) {
      setScanError('Не удалось запустить камеру: ' + err.message);
      setScanning(false);
    }
  };

  const stopScanner = () => {
    if (readerRef.current) { readerRef.current.reset(); readerRef.current = null; }
    setScanning(false);
  };

  const fetchProduct = async (text) => {
    setLoading(true);
    stopScanner();
    try {
      const res = await fetch(getApiUrl('scan-text'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (data.success) setScanResult(data);
      else setScanError(data.error || 'Лекарство не найдено');
    } catch (e) {
      setScanError('Ошибка сервера: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLoading(true);
    stopScanner();
    const formData = new FormData();
    formData.append('file', file, file.name);
    try {
      const res = await fetch(getApiUrl('scan'), { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) setScanResult(data);
      else setScanError(data.error || 'Код не распознан на фото');
    } catch (e) {
      setScanError('Ошибка загрузки: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedicine = () => {
    if (!scanResult) return;
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    setMedicines(prev => [{
      id: Date.now(),
      name: d.productName || drugs.prodDescLabel || 'Неизвестное лекарство',
      expDate: d.expDate || drugs.expirationDate || null,
      quantity: addQty,
    }, ...prev]);
    closeScanner();
  };

  const getMedicineData = () => {
    if (!scanResult) return null;
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    return {
      name: d.productName || drugs.prodDescLabel || 'Неизвестное лекарство',
      expDate: d.expDate || drugs.expirationDate || '—',
    };
  };

  // ── MEDICINES LIST ──
  const deleteMedicine = (id) => { setMedicines(prev => prev.filter(m => m.id !== id)); setSwipedMedId(null); };
  const filteredMeds = medicines.filter(m => m.name.toLowerCase().includes(homeSearch.toLowerCase()));

  // ── PHARMACY SEARCH ──
  const PHARMACY_LINKS = [
    { name: 'Аптека.ру', desc: 'Крупная сеть аптек по России', url: (q) => `https://www.apteka.ru/search/?q=${encodeURIComponent(q)}` },
    { name: 'Яндекс Маркет', desc: 'Поиск по аптекам и магазинам', url: (q) => `https://market.yandex.ru/search?text=${encodeURIComponent(q + ' аптека')}` },
    { name: 'Ozon', desc: 'Маркетплейс, раздел с аптекой', url: (q) => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}` },
  ];

  const handlePharmSearch = () => {
    if (pharmName.trim()) setPharmResults(true);
  };

  // ── SCHEDULE ──
  const handleAddIntake = () => {
    if (!intakeName.trim()) return;
    setIntakes(prev => [{
      id: Date.now(),
      name: intakeName.trim(),
      time: intakeTime || '--:--',
      qty: intakeQty,
      done: false,
    }, ...prev]);
    setIntakeName('');
    setIntakeTime('');
    setIntakeQty(1);
    setAddIntakeOpen(false);
  };

  const toggleIntakeDone = (id) => {
    setIntakes(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  };

  const deleteIntake = (id) => { setIntakes(prev => prev.filter(i => i.id !== id)); setSwipedIntakeId(null); };

  if (authStep !== 'done') {
    return <AuthScreen onAuth={() => setAuthStep('done')} />;
  }

  return (
    <div className="app" onClick={() => { setSwipedMedId(null); setSwipedIntakeId(null); }}>

      {/* ── HOME ── */}
      <div className="home">
        <div className="home-header">
          <h1 className="greeting">Привет, {profile.name || 'Артем'}</h1>
          <button className="avatar" onClick={openProfile}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
        </div>

        <div className="search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" width="16" height="16">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="Поиск по аптечке"
            value={homeSearch}
            onChange={e => setHomeSearch(e.target.value)}
          />
        </div>

        <button className="add-btn" onClick={openManual}>Добавить лекарство</button>

        <div className="medicines">
          {filteredMeds.length === 0 ? (
            <p className="empty">В аптечке пока пусто</p>
          ) : (
            filteredMeds.map(med => {
              const expired = isExpired(med.expDate);
              const low = med.quantity <= 5;
              const open = swipedMedId === med.id;
              return (
                <div key={med.id} className="med-row">
                  <div
                    className={`med-card${open ? ' swiped' : ''}`}
                    onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={e => {
                      const dx = e.changedTouches[0].clientX - touchStartX.current;
                      if (dx < -50) setSwipedMedId(med.id);
                      else if (dx > 50) setSwipedMedId(null);
                    }}
                  >
                    <div className="med-top">
                      <span className="med-name">{med.name}</span>
                      <span className={`badge ${expired ? 'badge-exp' : 'badge-ok'}`}>
                        {expired ? 'Истек' : 'В норме'}
                      </span>
                    </div>
                    <div className="med-bottom">
                      <span className={`med-qty${low ? ' qty-low' : ''}`}>Остаток: {med.quantity} шт</span>
                      <span className="med-exp">До {formatDate(med.expDate)}</span>
                    </div>
                    {low && !expired && <div className="low-warning">Заканчивается! Нужно докупить</div>}
                  </div>
                  {open && (
                    <button className="del-btn" onClick={e => { e.stopPropagation(); deleteMedicine(med.id); }}>
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="bottom-nav">
        <button className="nav-btn" onClick={() => setActiveTab(activeTab === 'search' ? 'home' : 'search')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Поиск</span>
        </button>
        <button className="nav-scanner" onClick={openScanner}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="28" height="28">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="nav-btn" onClick={() => setActiveTab(activeTab === 'schedule' ? 'home' : 'schedule')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Приём</span>
        </button>
      </nav>

      {/* ── PHARMACY SEARCH SHEET ── */}
      {activeTab === 'search' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setActiveTab('home')}>
          <div className="sheet">
            <div className="sheet-header">
              <h2>{mapOpen ? 'Аптеки рядом' : 'Поиск по аптекам'}</h2>
              <button className="close-btn" onClick={() => { setActiveTab('home'); setPharmResults(false); setMapOpen(false); setPharmName(''); }}>×</button>
            </div>

            {mapOpen ? (
              <>
                <input
                  className="field-input"
                  value="Санкт-Петербург"
                  readOnly
                  style={{ marginBottom: 14 }}
                />
                <div className="map-frame">
                  <iframe
                    title="Аптеки на карте"
                    src="https://yandex.ru/map-widget/v1/?text=аптека&z=13&l=map"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                  />
                </div>
                <button className="secondary-btn" onClick={() => setMapOpen(false)} style={{ marginTop: 14 }}>← Назад</button>
              </>
            ) : (
              <>
                <label className="field-label">Название лекарства</label>
                <input
                  className="field-input"
                  placeholder="Например, парацетамол"
                  value={pharmName}
                  onChange={e => { setPharmName(e.target.value); setPharmResults(false); }}
                  onKeyDown={e => e.key === 'Enter' && handlePharmSearch()}
                />
                <button className="primary-btn" onClick={handlePharmSearch} style={{ marginBottom: 16 }}>
                  Найти в магазинах
                </button>

                {pharmResults && pharmName.trim() && (
                  <div className="pharm-list">
                    {PHARMACY_LINKS.map(p => (
                      <a key={p.name} className="pharm-card" href={p.url(pharmName)} target="_blank" rel="noopener noreferrer">
                        <span className="pharm-name">{p.name}</span>
                        <span className="pharm-desc">{p.desc}</span>
                      </a>
                    ))}
                  </div>
                )}

                <p className="map-hint">Можно посмотреть на карте</p>
                <button className="primary-btn" onClick={() => setMapOpen(true)}>
                  Показать аптеки на карте
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SCHEDULE SHEET ── */}
      {activeTab === 'schedule' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setActiveTab('home')}>
          <div className="sheet">
            {addIntakeOpen ? (
              <>
                <div className="sheet-header">
                  <h2>Прием лекарств</h2>
                  <button className="close-btn" onClick={() => setAddIntakeOpen(false)}>×</button>
                </div>

                <label className="field-label">Название лекарства</label>
                <input
                  className="field-input"
                  placeholder="Например, парацетамол"
                  value={intakeName}
                  onChange={e => setIntakeName(e.target.value)}
                />

                <label className="field-label">Время приема</label>
                <input
                  className="field-input field-input--time"
                  type="time"
                  value={intakeTime}
                  onChange={e => setIntakeTime(e.target.value)}
                />

                <label className="field-label">Сколько таблеток за прием</label>
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  placeholder="Например, 1 или 2"
                  value={intakeQty}
                  onChange={e => setIntakeQty(Number(e.target.value))}
                />

                <button className="primary-btn" onClick={handleAddIntake} style={{ marginTop: 8 }}>
                  Добавить лекарство
                </button>
              </>
            ) : (
              <>
                <div className="sheet-header">
                  <h2>Прием лекарств</h2>
                  <button className="close-btn" onClick={() => setActiveTab('home')}>×</button>
                </div>

                <button className="primary-btn" onClick={() => setAddIntakeOpen(true)} style={{ marginBottom: 16 }}>
                  Добавить прием
                </button>

                {intakes.length === 0 ? (
                  <p className="empty" style={{ marginTop: 32 }}>Пока нету приемов</p>
                ) : (
                  <div className="intake-list">
                    {intakes.map(item => {
                      const open = swipedIntakeId === item.id;
                      return (
                        <div key={item.id} className="intake-row">
                          <div
                            className={`intake-card${item.done ? ' intake-done' : ''}${open ? ' swiped' : ''}`}
                            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                            onTouchEnd={e => {
                              const dx = e.changedTouches[0].clientX - touchStartX.current;
                              if (dx < -50) setSwipedIntakeId(item.id);
                              else if (dx > 50) setSwipedIntakeId(null);
                            }}
                          >
                            <div className="intake-info">
                              <span className="intake-name">{item.name}</span>
                              <span className="intake-sub">Остаток: {item.qty} шт</span>
                            </div>
                            <div className="intake-right">
                              <span className="intake-time">{item.time}</span>
                              <button
                                className={`check-btn${item.done ? ' check-done' : ''}`}
                                onClick={e => { e.stopPropagation(); toggleIntakeDone(item.id); }}
                              >
                                {item.done && (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" width="14" height="14">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                          {open && (
                            <button className="del-btn" onClick={e => { e.stopPropagation(); deleteIntake(item.id); }}>
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE SHEET ── */}
      {activeTab === 'profile' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setActiveTab('home')}>
          <div className="sheet">
            <div className="sheet-header">
              <h2>Профиль</h2>
              <button className="close-btn" onClick={() => setActiveTab('home')}>×</button>
            </div>

            <div className="profile-row">
              <div className="profile-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="36" height="36">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                {profileEdit && (
                  <div className="avatar-edit-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" width="10" height="10">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="profile-name-field">
                <label className="field-label">Ваше имя</label>
                <input
                  className="field-input"
                  style={{ marginBottom: 0 }}
                  placeholder="Имя"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  readOnly={!profileEdit}
                />
              </div>
            </div>

            <label className="field-label" style={{ marginTop: 16 }}>Номер телефона</label>
            <div className="phone-row">
              <div className="phone-prefix">+7</div>
              <input
                className="field-input phone-input"
                placeholder=""
                type="tel"
                value={profilePhone}
                onChange={e => setProfilePhone(e.target.value)}
                readOnly={!profileEdit}
              />
            </div>

            <label className="field-label">Аллергия / Заболевания</label>
            <textarea
              className="field-input field-textarea"
              placeholder=""
              value={profileAllergy}
              onChange={e => setProfileAllergy(e.target.value)}
              readOnly={!profileEdit}
            />

            {profileEdit ? (
              <button className="primary-btn" onClick={saveProfile}>Сохранить</button>
            ) : (
              <>
                <button className="primary-btn profile-edit-btn" onClick={() => setProfileEdit(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" width="16" height="16" style={{ marginRight: 8 }}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Редактировать
                </button>
                <button
                  className="logout-btn"
                  onClick={() => { localStorage.removeItem('pillbox_token'); setAuthStep('phone'); }}
                >
                  Выйти
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MANUAL ADD SHEET ── */}
      {manualOpen && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setManualOpen(false)}>
          <div className="sheet">
            <div className="sheet-header">
              <h2>Новое лекарство</h2>
              <button className="close-btn" onClick={() => setManualOpen(false)}>×</button>
            </div>

            <label className="field-label">Название лекарства</label>
            <input
              className="field-input"
              placeholder="Например, парацетамол"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
            />

            <label className="field-label">Срок годности</label>
            <input
              className="field-input"
              type="date"
              value={manualExp}
              onChange={e => setManualExp(e.target.value)}
            />

            <label className="field-label">Количество</label>
            <div className="qty-row" style={{ marginBottom: 20 }}>
              <span className="qty-label" style={{ fontSize: 15 }}>{manualQty} шт</span>
              <div className="qty-controls">
                <button onClick={() => setManualQty(q => Math.max(1, q - 1))}>−</button>
                <span>{manualQty}</span>
                <button onClick={() => setManualQty(q => q + 1)}>+</button>
              </div>
            </div>

            <button className="primary-btn" onClick={handleManualAdd}>Добавить лекарство</button>
          </div>
        </div>
      )}

      {/* ── SCANNER SHEET ── */}
      {scannerOpen && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeScanner()}>
          <div className="scanner-sheet">
            <div className="sheet-header">
              <h2>Сканирование<br />Честного Знака</h2>
              <button className="close-btn" onClick={closeScanner}>×</button>
            </div>

            {/* hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoUpload}
            />

            {!scanResult && !scanError && (
              <>
                <p className="scan-hint">
                  Наведите камеру на Честный Знак с упаковки лекарства. Сканирование может занять несколько секунд.
                </p>
                <div className="viewfinder">
                  <video ref={videoRef} playsInline />
                  {loading && <div className="loading-overlay"><div className="spinner" /></div>}
                </div>
                <div className="scan-status neutral">Сканирование запущено...</div>
                <button className="upload-photo-btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Загрузить фото кода
                </button>
              </>
            )}

            {scanResult && (() => {
              const med = getMedicineData();
              return (
                <>
                  <div className="scan-status success">Сканирование выполнено</div>
                  <div className="result-row">
                    <div>
                      <div className="result-name">{med.name}</div>
                      <div className="result-exp">Годен до: {formatDate(med.expDate)}</div>
                    </div>
                    <button className="change-btn" onClick={() => { setScanResult(null); startScanner(); }}>Изменить</button>
                  </div>
                  <div className="qty-row">
                    <span className="qty-label">Количество:</span>
                    <div className="qty-controls">
                      <button onClick={() => setAddQty(q => Math.max(1, q - 1))}>−</button>
                      <span>{addQty} шт</span>
                      <button onClick={() => setAddQty(q => q + 1)}>+</button>
                    </div>
                  </div>
                  <button className="primary-btn" onClick={handleAddMedicine}>Добавить лекарство</button>
                </>
              );
            })()}

            {scanError && (
              <>
                <div className="scan-status error">Сканирование не выполнено</div>
                <div className="error-row">{scanError || 'Лекарство не найдено'}</div>
                <button className="primary-btn" onClick={closeScanner}>Добавить вручную</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
