import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { createClient } from '@supabase/supabase-js';

const firebaseConfig = {
  apiKey: "AIzaSyDWobakstAyjx-rTGJupLDgDZ_Jzkfv0xc",
  authDomain: "kidpill.firebaseapp.com",
  projectId: "kidpill",
  storageBucket: "kidpill.firebasestorage.app",
  messagingSenderId: "228749438184",
  appId: "1:228749438184:web:7d08dfc0f83e3942d72d5d",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const supabase = createClient(
  'https://cidnwmmhwryhwpxbocwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpZG53bW1od3J5aHdweGJvY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDg0NzQsImV4cCI6MjA5MDk4NDQ3NH0.Jh329ywjiTRWrHdmMlV53sJtkvOB1ce5abXTbC6IvQk'
);

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

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
const fmtDist = (km) => km < 1 ? `${Math.round(km*1000)} м` : `${km.toFixed(1)} км`;

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const PharmacySheet = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [pharmacies, setPharmacies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [userCoords, setUserCoords] = useState(null);
  const mapRef = useRef(null);
  const ymapRef = useRef(null);

  const parseFeatures = useCallback((data, map, userMark) => {
    map.geoObjects.removeAll();
    if (userMark) map.geoObjects.add(userMark);
    const items = [];
    (data.features || []).forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const name = f.properties.name || 'Аптека';
      const address = f.properties.description || '';
      const meta = f.properties.CompanyMetaData || {};
      const website = meta.url || null;
      items.push({ name, address, coords: [lat, lon], website });
      map.geoObjects.add(new window.ymaps.Placemark(
        [lat, lon],
        { balloonContentHeader: name, balloonContentBody: address, hintContent: name },
        { preset: 'islands#redMedicalIcon' }
      ));
    });
    return items;
  }, []);

  const fetchPharmacies = useCallback((center, searchText, userMark = null) => {
    const ll = `${center[1]},${center[0]}`;
    const spn = searchText !== 'аптека' ? '0.5,0.5' : '0.2,0.2';
    const url = `/api/pharmacy-search?ll=${ll}&text=${encodeURIComponent(searchText)}&spn=${spn}`;
    return fetch(url).then(r => r.json()).then(data => parseFeatures(data, ymapRef.current, userMark));
  }, [parseFeatures]);

  const geolocate = useCallback((searchText = 'аптека') => {
    if (!navigator.geolocation) { setMsg('Геолокация недоступна.'); return; }
    setBusy(true); setMsg('');
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lon } }) => {
        setUserCoords({ lat, lon });
        if (!ymapRef.current || !window.ymaps) { setBusy(false); return; }
        window.ymaps.ready(() => {
          ymapRef.current.setCenter([lat, lon], 14);
          const userMark = new window.ymaps.Placemark(
            [lat, lon],
            { hintContent: 'Вы здесь', balloonContent: 'Вы здесь' },
            { preset: 'islands#blueCircleDotIcon' }
          );
          fetchPharmacies([lat, lon], searchText, userMark)
            .then(items => { setPharmacies(items); if (!items.length) setMsg('Аптеки рядом не найдены.'); })
            .catch(() => setMsg('Ошибка поиска аптек.'))
            .finally(() => setBusy(false));
        });
      },
      () => { setMsg('Нет доступа к местоположению.'); setBusy(false); }
    );
  }, [fetchPharmacies]);

  useEffect(() => {
    let cancelled = false;
    const tryInit = () => {
      if (cancelled || !mapRef.current || ymapRef.current) return;
      if (!window.ymaps) { setTimeout(tryInit, 250); return; }
      window.ymaps.ready(() => {
        if (cancelled || !mapRef.current || ymapRef.current) return;
        ymapRef.current = new window.ymaps.Map(mapRef.current, { center: [55.7558, 37.6173], zoom: 12, controls: ['zoomControl'] });
        if (!cancelled) geolocate('аптека');
      });
    };
    setTimeout(tryInit, 150);
    return () => {
      cancelled = true;
      if (ymapRef.current) { ymapRef.current.destroy(); ymapRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    const q = query.trim();
    const searchText = q ? `аптека ${q}` : 'аптека';
    if (userCoords) {
      setBusy(true); setMsg('');
      fetchPharmacies([userCoords.lat, userCoords.lon], searchText)
        .then(items => { setPharmacies(items); if (!items.length) setMsg(q ? `Аптеки с "${q}" не найдены.` : 'Аптеки не найдены.'); })
        .catch(() => setMsg('Ошибка поиска.'))
        .finally(() => setBusy(false));
    } else { geolocate(searchText); }
  };

  const focusOnPharmacy = (item) => { if (ymapRef.current) ymapRef.current.setCenter(item.coords, 16); };
  const normalizeUrl = (url) => url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-header">
          <h2>Поиск аптек</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="pharm-search-row">
          <input className="field-input" style={{ marginBottom: 0, flex: 1 }} placeholder="Название лекарства" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <button className="pharm-search-btn" onClick={handleSearch} disabled={busy}>
            {busy ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <SearchIcon />}
          </button>
        </div>
        <button className="geo-btn" onClick={() => geolocate(query.trim() ? `аптека ${query.trim()}` : 'аптека')} disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9"/>
          </svg>
          Определить моё местоположение
        </button>
        {msg && <p className="pharm-status">{msg}</p>}
        <div className="map-container" ref={mapRef} />
        {pharmacies.length > 0 && (
          <div className="pharm-list">
            {pharmacies.map((item, i) => {
              const dist = userCoords ? haversineKm(userCoords.lat, userCoords.lon, item.coords[0], item.coords[1]) : null;
              return (
                <div key={i} className="pharm-card">
                  <div className="pharm-card-top" style={{ cursor: 'pointer' }} onClick={() => focusOnPharmacy(item)}>
                    <span className="pharm-name">{item.name}</span>
                    {dist !== null && <span className="pharm-dist">{fmtDist(dist)}</span>}
                  </div>
                  {item.address && <span className="pharm-desc">{item.address}</span>}
                  {item.website && (
                    <a href={normalizeUrl(item.website)} target="_blank" rel="noopener noreferrer" className="pharm-website-btn">
                      Перейти на сайт
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                        <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
                      </svg>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const AuthScreen = ({ onAuth }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      onAuth(result.user);
    } catch (e) {
      setError('Ошибка входа: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-logo">
        <div className="auth-icon-wrap">
          <svg viewBox="0 0 80 80" fill="none" width="96" height="96">
            <rect x="8" y="18" width="64" height="50" rx="10" fill="#fff"/>
            <rect x="8" y="18" width="64" height="50" rx="10" stroke="#e0e8f0" strokeWidth="2"/>
            <rect x="14" y="10" width="52" height="14" rx="6" fill="#D0E8FF"/>
            <rect x="14" y="10" width="52" height="14" rx="6" stroke="#A8CBE8" strokeWidth="1.5"/>
            <rect x="33" y="7" width="14" height="8" rx="4" fill="#A8CBE8"/>
            <rect x="36" y="31" width="8" height="24" rx="4" fill="#ef4444"/>
            <rect x="28" y="39" width="24" height="8" rx="4" fill="#ef4444"/>
            <rect x="16" y="24" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
          </svg>
        </div>
        <span className="auth-app-name">МОЯ АПТЕЧКА</span>
      </div>
      <div className="auth-card">
        <h2 className="auth-title">Вход</h2>
        <p className="auth-sub">Войдите в аккаунт чтобы получить доступ к своей аптечке</p>
        {error && <p className="auth-error">{error}</p>}
        <button className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
          {loading ? <span>Вход...</span> : <><GoogleIcon />Войти через Google</>}
        </button>
      </div>
    </div>
  );
};

const OnboardingScreen = ({ onDone }) => {
  const [name, setName] = useState('');
  const [allergy, setAllergy] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDone({ name: trimmed, allergy: allergy.trim() });
  };

  return (
    <div className="auth-screen">
      <div className="onboard-content">
        <h1 className="onboard-title">Добро пожаловать!</h1>
        <label className="field-label">Ваше имя</label>
        <input className="field-input" placeholder="" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
        <label className="field-label">Аллергии / Заболевания</label>
        <input className="field-input" placeholder="Необязательно" value={allergy} onChange={e => setAllergy(e.target.value)} />
        <button className="primary-btn" onClick={handleSubmit} disabled={!name.trim()}>Войти</button>
      </div>
    </div>
  );
};

const App = () => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authStep, setAuthStep] = useState('loading');
  const [activeTab, setActiveTab] = useState('home');
  const [medicines, setMedicines] = useState([]);
  const [homeSearch, setHomeSearch] = useState('');
  const [swipedMedId, setSwipedMedId] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualExp, setManualExp] = useState('');
  const [manualQty, setManualQty] = useState(15);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [addQty, setAddQty] = useState(15);
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState({});
  const [profileEdit, setProfileEdit] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAllergy, setProfileAllergy] = useState('');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('pillbox_avatar') || '');
  const avatarInputRef = useRef(null);
  const [deletingMeds, setDeletingMeds] = useState(new Set());
  const [deletingIntakes, setDeletingIntakes] = useState(new Set());
  const [intakes, setIntakes] = useState([]);
  const [addIntakeOpen, setAddIntakeOpen] = useState(false);
  const [intakeName, setIntakeName] = useState('');
  const [intakeTime, setIntakeTime] = useState('');
  const [intakeQty, setIntakeQty] = useState(1);
  const [swipedIntakeId, setSwipedIntakeId] = useState(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        await loadUserData(user.uid);
      } else {
        setFirebaseUser(null);
        setAuthStep('login');
      }
    });
    return () => unsub();
  }, []);

  const loadUserData = async (uid) => {
    try {
      const [{ data: prof, error: profError }, { data: meds }, { data: ints }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('medicines').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('intakes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      ]);
      if (prof) {
        setProfile({ name: prof.name || '', allergy: prof.allergy || '' });
        setAuthStep('done');
      } else {
        setAuthStep('onboarding');
      }
      setMedicines((meds || []).map(m => ({ id: m.id, name: m.name, expDate: m.exp_date, quantity: m.quantity })));
      setIntakes((ints || []).map(i => ({ id: i.id, name: i.name, time: i.time, qty: i.qty, done: i.done })));
    } catch (e) {
      console.error('loadUserData error:', e);
      setAuthStep('onboarding');
    }
  };

  const saveProfileToSupabase = async (uid, data) => {
    await supabase.from('profiles').upsert({ user_id: uid, name: data.name, allergy: data.allergy }, { onConflict: 'user_id' });
  };

  const openProfile = () => {
    setProfileName(profile.name || '');
    setProfileAllergy(profile.allergy || '');
    setProfileEdit(false);
    setActiveTab('profile');
  };

  const saveProfile = async () => {
    const updated = { name: profileName, allergy: profileAllergy };
    setProfile(updated);
    setProfileEdit(false);
    if (firebaseUser) await saveProfileToSupabase(firebaseUser.uid, updated);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setAvatar(ev.target.result); localStorage.setItem('pillbox_avatar', ev.target.result); };
    reader.readAsDataURL(file);
  };

  const openManual = () => { setManualName(''); setManualExp(''); setManualQty(15); setManualOpen(true); };

  const handleManualAdd = async () => {
    if (!manualName.trim()) return;
    const id = Date.now();
    const newMed = { id, name: manualName.trim(), expDate: manualExp || null, quantity: manualQty };
    setMedicines(prev => [newMed, ...prev]);
    setManualOpen(false);
    if (firebaseUser) {
      await supabase.from('medicines').insert({ id, user_id: firebaseUser.uid, name: newMed.name, exp_date: newMed.expDate, quantity: newMed.quantity });
    }
  };

  const openScanner = () => { setScanResult(null); setScanError(null); setAddQty(15); setScannerOpen(true); setTimeout(() => startScanner(), 200); };
  const closeScanner = () => { stopScanner(); setScanResult(null); setScanError(null); setScannerOpen(false); };

  const startScanner = async () => {
    setScanResult(null); setScanError(null); setScanning(true);
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
    } catch (err) { setScanError('Не удалось запустить камеру: ' + err.message); setScanning(false); }
  };

  const stopScanner = () => { if (readerRef.current) { readerRef.current.reset(); readerRef.current = null; } setScanning(false); };

  const fetchProduct = async (text) => {
    setLoading(true); stopScanner();
    const cis = text.trim();
    const endpoints = [
      `https://mobile.api.crpt.ru/mobile/check?cis=${encodeURIComponent(cis)}`,
      `https://ismotp.crpt.ru/api/v1/facade/check?cis=${encodeURIComponent(cis)}`,
    ];
    let lastError = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
        const data = await res.json();
        setScanResult({ success: true, cis, data });
        setLoading(false);
        return;
      } catch (e) { lastError = e.message; }
    }
    setScanError('Не удалось получить данные о препарате.');
    setLoading(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLoading(true); stopScanner();
    const formData = new FormData();
    formData.append('file', file, file.name);
    try {
      const res = await fetch(getApiUrl('scan'), { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) setScanResult(data);
      else setScanError(data.error || 'Код не распознан на фото');
    } catch (e) { setScanError('Ошибка загрузки: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleAddMedicine = async () => {
    if (!scanResult) return;
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    const id = Date.now();
    const newMed = {
      id,
      name: d.productName || drugs.prodDescLabel || 'Неизвестное лекарство',
      expDate: d.expDate || drugs.expirationDate || null,
      quantity: addQty,
    };
    setMedicines(prev => [newMed, ...prev]);
    closeScanner();
    if (firebaseUser) {
      await supabase.from('medicines').insert({ id, user_id: firebaseUser.uid, name: newMed.name, exp_date: newMed.expDate, quantity: newMed.quantity });
    }
  };

  const getMedicineData = () => {
    if (!scanResult) return null;
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    return { name: d.productName || drugs.prodDescLabel || 'Неизвестное лекарство', expDate: d.expDate || drugs.expirationDate || '—' };
  };

  const deleteMedicine = async (id) => {
    setSwipedMedId(null);
    setDeletingMeds(prev => new Set(prev).add(id));
    setTimeout(async () => {
      setMedicines(prev => prev.filter(m => m.id !== id));
      setDeletingMeds(prev => { const s = new Set(prev); s.delete(id); return s; });
      if (firebaseUser) await supabase.from('medicines').delete().eq('id', id).eq('user_id', firebaseUser.uid);
    }, 350);
  };

  const filteredMeds = medicines.filter(m => m.name.toLowerCase().includes(homeSearch.toLowerCase()));

  const handleAddIntake = async () => {
    if (!intakeName.trim()) return;
    const id = Date.now();
    const newIntake = { id, name: intakeName.trim(), time: intakeTime || '--:--', qty: intakeQty, done: false };
    setIntakes(prev => [newIntake, ...prev]);
    setIntakeName(''); setIntakeTime(''); setIntakeQty(1); setAddIntakeOpen(false);
    if (firebaseUser) {
      await supabase.from('intakes').insert({ id, user_id: firebaseUser.uid, name: newIntake.name, time: newIntake.time, qty: newIntake.qty, done: false });
    }
  };

  const toggleIntakeDone = async (id) => {
    setIntakes(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
    setSwipedIntakeId(null);
    const intake = intakes.find(i => i.id === id);
    if (firebaseUser && intake) {
      await supabase.from('intakes').update({ done: !intake.done }).eq('id', id).eq('user_id', firebaseUser.uid);
    }
  };

  const closeSchedule = () => {
    const doneIds = intakes.filter(i => i.done).map(i => i.id);
    setIntakes(prev => prev.filter(i => !i.done));
    setActiveTab('home');
    if (firebaseUser && doneIds.length) {
      supabase.from('intakes').delete().in('id', doneIds).eq('user_id', firebaseUser.uid);
    }
  };

  const deleteIntake = async (id) => {
    setSwipedIntakeId(null);
    setDeletingIntakes(prev => new Set(prev).add(id));
    setTimeout(async () => {
      setIntakes(prev => prev.filter(i => i.id !== id));
      setDeletingIntakes(prev => { const s = new Set(prev); s.delete(id); return s; });
      if (firebaseUser) await supabase.from('intakes').delete().eq('id', id).eq('user_id', firebaseUser.uid);
    }, 350);
  };

  if (authStep === 'loading') {
    return <div className="auth-screen"><div className="spinner" style={{ width: 40, height: 40, margin: 'auto' }} /></div>;
  }

  if (authStep === 'login') {
    return <AuthScreen onAuth={async (user) => {
      setFirebaseUser(user);
      await loadUserData(user.uid);
    }} />;
  }

  if (authStep === 'onboarding') {
    return <OnboardingScreen onDone={async (p) => {
      setProfile(p);
      setAuthStep('done');
      if (firebaseUser) await saveProfileToSupabase(firebaseUser.uid, p);
    }} />;
  }

  return (
    <div className="app" onClick={() => { setSwipedMedId(null); setSwipedIntakeId(null); }}>
      <div className="home">
        <div className="home-header">
          <h1 className="greeting">Привет, {profile.name || 'друг'}</h1>
          <button className="avatar" onClick={openProfile}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
            }
          </button>
        </div>
        <div className="search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" width="16" height="16">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input placeholder="Поиск по аптечке" value={homeSearch} onChange={e => setHomeSearch(e.target.value)} />
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
              const deleting = deletingMeds.has(med.id);
              return (
                <div key={med.id} className={`med-row${deleting ? ' row-deleting' : ''}`}>
                  <button className="del-btn" onClick={e => { e.stopPropagation(); deleteMedicine(med.id); }}><CloseIcon /></button>
                  <div
                    className={`med-card${open ? ' swiped' : ''}`}
                    onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                    onTouchMove={e => { const dx = e.touches[0].clientX - touchStartX.current; if (dx < -10 && !open) e.stopPropagation(); }}
                    onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchStartX.current; if (dx < -40) setSwipedMedId(med.id); else if (dx > 30) setSwipedMedId(null); }}
                  >
                    <div className="med-top">
                      <span className="med-name">{med.name}</span>
                      <span className={`badge ${expired ? 'badge-exp' : 'badge-ok'}`}>{expired ? 'Истек' : 'В норме'}</span>
                    </div>
                    <div className="med-bottom">
                      <span className={`med-qty${low ? ' qty-low' : ''}`}>Остаток: {med.quantity} шт</span>
                      <span className="med-exp">До {formatDate(med.expDate)}</span>
                    </div>
                    {low && !expired && <div className="low-warning">Заканчивается! Нужно докупить</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

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
        <button className="nav-btn" onClick={() => activeTab === 'schedule' ? closeSchedule() : setActiveTab('schedule')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Приём</span>
        </button>
      </nav>

      {activeTab === 'search' && <PharmacySheet onClose={() => setActiveTab('home')} />}

      {activeTab === 'schedule' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeSchedule()}>
          <div className="sheet">
            {addIntakeOpen ? (
              <>
                <div className="sheet-header">
                  <h2>Прием лекарств</h2>
                  <button className="close-btn" onClick={() => setAddIntakeOpen(false)}>×</button>
                </div>
                <label className="field-label">Название лекарства</label>
                <input className="field-input" placeholder="Например, парацетамол" value={intakeName} onChange={e => setIntakeName(e.target.value)} />
                <label className="field-label">Время приема</label>
                <input className="field-input field-input--time" type="time" value={intakeTime} onChange={e => setIntakeTime(e.target.value)} />
                <label className="field-label">Сколько таблеток за прием</label>
                <input className="field-input" type="number" min="1" placeholder="Например, 1 или 2" value={intakeQty} onChange={e => setIntakeQty(Number(e.target.value))} />
                <button className="primary-btn" onClick={handleAddIntake} style={{ marginTop: 8 }}>Добавить лекарство</button>
              </>
            ) : (
              <>
                <div className="sheet-header">
                  <h2>Прием лекарств</h2>
                  <button className="close-btn" onClick={closeSchedule}>×</button>
                </div>
                <button className="primary-btn" onClick={() => setAddIntakeOpen(true)} style={{ marginBottom: 16 }}>Добавить прием</button>
                {intakes.length === 0 ? (
                  <p className="empty" style={{ marginTop: 32 }}>Пока нету приемов</p>
                ) : (
                  <div className="intake-list">
                    {intakes.map(item => {
                      const open = swipedIntakeId === item.id;
                      const deleting = deletingIntakes.has(item.id);
                      return (
                        <div key={item.id} className={`intake-row${deleting ? ' row-deleting' : ''}`}>
                          <button className="del-btn" onClick={e => { e.stopPropagation(); deleteIntake(item.id); }}><CloseIcon /></button>
                          <div
                            className={`intake-card${item.done ? ' intake-done' : ''}${open ? ' swiped' : ''}`}
                            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                            onTouchMove={e => { const dx = e.touches[0].clientX - touchStartX.current; if (dx < -10 && !open) e.stopPropagation(); }}
                            onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchStartX.current; if (dx < -40) setSwipedIntakeId(item.id); else if (dx > 30) setSwipedIntakeId(null); }}
                          >
                            <div className="intake-info">
                              <span className="intake-name">{item.name}</span>
                              <span className="intake-sub">Остаток: {item.qty} шт</span>
                            </div>
                            <div className="intake-right">
                              <span className="intake-time">{item.time}</span>
                              <button className={`check-btn${item.done ? ' check-done' : ''}`} onClick={e => { e.stopPropagation(); toggleIntakeDone(item.id); }}>
                                {item.done && <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>}
                              </button>
                            </div>
                          </div>
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

      {activeTab === 'profile' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setActiveTab('home')}>
          <div className="sheet">
            <div className="sheet-header">
              <h2>Профиль</h2>
              <button className="close-btn" onClick={() => setActiveTab('home')}>×</button>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <div className="profile-row">
              <button className="profile-avatar" onClick={() => avatarInputRef.current?.click()}>
                {avatar ? (
                  <img src={avatar} alt="avatar" className="profile-avatar-img" />
                ) : (
                  <span className="profile-avatar-initials">
                    {(firebaseUser?.email?.[0] || profile.name?.[0] || '?').toUpperCase()}
                  </span>
                )}
                <div className="avatar-edit-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" width="10" height="10">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
              </button>
              <div className="profile-name-field">
                <label className="field-label">Ваше имя</label>
                <input className="field-input" style={{ marginBottom: 0 }} placeholder="Имя" value={profileName} onChange={e => setProfileName(e.target.value)} readOnly={!profileEdit} />
              </div>
            </div>
            <label className="field-label" style={{ marginTop: 16 }}>Email</label>
            <div className="field-input profile-email">{firebaseUser?.email || 'Нет данных'}</div>
            <label className="field-label">Аллергия / Заболевания</label>
            <textarea className="field-input field-textarea" placeholder="" value={profileAllergy} onChange={e => setProfileAllergy(e.target.value)} readOnly={!profileEdit} />
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
                <button className="logout-btn" onClick={async () => { await signOut(auth); setFirebaseUser(null); setAuthStep('login'); }}>
                  Выйти
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setManualOpen(false)}>
          <div className="sheet">
            <div className="sheet-header">
              <h2>Новое лекарство</h2>
              <button className="close-btn" onClick={() => setManualOpen(false)}>×</button>
            </div>
            <label className="field-label">Название лекарства</label>
            <input className="field-input" placeholder="Например, парацетамол" value={manualName} onChange={e => setManualName(e.target.value)} />
            <label className="field-label">Срок годности</label>
            <input className="field-input" type="date" value={manualExp} onChange={e => setManualExp(e.target.value)} />
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

      {scannerOpen && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeScanner()}>
          <div className="scanner-sheet">
            <div className="sheet-header">
              <h2>Сканирование<br />Честного Знака</h2>
              <button className="close-btn" onClick={closeScanner}>×</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            {!scanResult && !scanError && (
              <>
                <p className="scan-hint">Наведите камеру на Честный Знак с упаковки лекарства.</p>
                <div className="viewfinder">
                  <video ref={videoRef} playsInline />
                  {loading && <div className="loading-overlay"><div className="spinner" /></div>}
                </div>
                <div className="scan-status neutral">Сканирование запущено...</div>
                <button className="upload-photo-btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
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
                <div className="error-row">{scanError}</div>
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
