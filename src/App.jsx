import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';


import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cidnwmmhwryhwpxbocwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpZG53bW1od3J5aHdweGJvY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDg0NzQsImV4cCI6MjA5MDk4NDQ3NH0.Jh329ywjiTRWrHdmMlV53sJtkvOB1ce5abXTbC6IvQk'
);

const GUEST_MAX_MEDICINES = 5;
const GUEST_MAX_SCANS = 1;

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
  const [pharmacies, setPharmacies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [userCoords, setUserCoords] = useState(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const mapRef = useRef(null);
  const ymapRef = useRef(null);

  const geolocate = useCallback(() => {
    if (!navigator.geolocation) { setMsg('Геолокация недоступна.'); return; }
    setBusy(true); setMsg('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        setUserCoords({ lat, lon });
        const map = ymapRef.current;
        if (!map) { setBusy(false); return; }
        map.setCenter([lat, lon], 15);
        map.geoObjects.removeAll();

        // Маркер пользователя
        map.geoObjects.add(new window.ymaps.Placemark([lat, lon], {
          balloonContent: 'Вы здесь',
        }, { preset: 'islands#blueCircleDotIcon' }));

        // Поиск аптек через Overpass API
        try {
          const q = `[out:json][timeout:25];node["amenity"="pharmacy"](around:2000,${lat},${lon});out body;`;
          const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
          const data = await res.json();
          const elements = data.elements || [];
          const items = elements.map(el => {
            const name = el.tags?.name || 'Аптека';
            const street = el.tags?.['addr:street'] || '';
            const house = el.tags?.['addr:housenumber'] || '';
            const address = [street, house].filter(Boolean).join(', ');
            const website = el.tags?.website || el.tags?.['contact:website'] || null;
            const phone = el.tags?.phone || el.tags?.['contact:phone'] || null;
            const hours = el.tags?.opening_hours || null;
            const coords = [el.lat, el.lon];
            const item = { name, address, website, phone, hours, coords };
            const placemark = new window.ymaps.Placemark(coords, {}, { preset: 'islands#redMedicalIcon' });
            placemark.events.add('click', () => setSelectedPharmacy(item));
            map.geoObjects.add(placemark);
            return item;
          });
          items.sort((a, b) => haversineKm(lat, lon, a.coords[0], a.coords[1]) - haversineKm(lat, lon, b.coords[0], b.coords[1]));
          setPharmacies(items);
          if (!items.length) setMsg('Аптеки в радиусе 2 км не найдены.');
        } catch {
          setMsg('Ошибка поиска аптек. Попробуйте позже.');
        } finally {
          setBusy(false);
        }
      },
      () => { setMsg('Нет доступа к местоположению.'); setBusy(false); }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = () => {
      if (cancelled || !mapRef.current || ymapRef.current) return;
      if (!window.ymaps) { setTimeout(init, 300); return; }
      window.ymaps.ready(() => {
        if (cancelled || ymapRef.current) return;
        ymapRef.current = new window.ymaps.Map(mapRef.current, {
          center: [55.7558, 37.6173],
          zoom: 11,
          controls: ['zoomControl'],
        });
        if (!cancelled) geolocate();
      });
    };
    setTimeout(init, 100);
    return () => {
      cancelled = true;
      if (ymapRef.current) { ymapRef.current.destroy(); ymapRef.current = null; }
    };
  }, [geolocate]);

  const focusOnPharmacy = (item) => { if (ymapRef.current) ymapRef.current.setCenter(item.coords, 17); };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-header">
          <h2>Аптеки рядом</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <button className="geo-btn" onClick={geolocate} disabled={busy}>
          {busy
            ? <div className="spinner" style={{ width: 17, height: 17, borderWidth: 2 }} />
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9"/>
              </svg>
          }
          {busy ? 'Поиск...' : 'Определить моё местоположение'}
        </button>
        {msg && <p className="pharm-status">{msg}</p>}
        <div className="map-container" ref={mapRef} />
        {pharmacies.length > 0 && (
          <div className="pharm-list">
            {pharmacies.map((item, i) => {
              const dist = userCoords ? haversineKm(userCoords.lat, userCoords.lon, item.coords[0], item.coords[1]) : null;
              return (
                <div key={i} className="pharm-card" style={{ cursor: 'pointer' }} onClick={() => { focusOnPharmacy(item); setSelectedPharmacy(item); }}>
                  <div className="pharm-card-top">
                    <span className="pharm-name">{item.name}</span>
                    {dist !== null && <span className="pharm-dist">{fmtDist(dist)}</span>}
                  </div>
                  {item.address && <span className="pharm-desc">{item.address}</span>}
                  {item.hours && <span className="pharm-desc" style={{ color: '#16a34a' }}>⏰ {item.hours}</span>}
                </div>
              );
            })}
          </div>
        )}

        {selectedPharmacy && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}
            onClick={() => setSelectedPharmacy(null)}>
            <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', padding: '24px 20px 36px', maxHeight: '70vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1, paddingRight: 12 }}>{selectedPharmacy.name}</h3>
                <button onClick={() => setSelectedPharmacy(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
              </div>
              {selectedPharmacy.address && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>📍</span>
                  <span style={{ fontSize: 14, color: '#444' }}>{selectedPharmacy.address}</span>
                </div>
              )}
              {selectedPharmacy.hours && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>⏰</span>
                  <span style={{ fontSize: 14, color: '#16a34a' }}>{selectedPharmacy.hours}</span>
                </div>
              )}
              {selectedPharmacy.phone && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>📞</span>
                  <a href={`tel:${selectedPharmacy.phone}`} style={{ fontSize: 14, color: '#3b82f6', textDecoration: 'none' }}>{selectedPharmacy.phone}</a>
                </div>
              )}
              {selectedPharmacy.website && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                  <span style={{ fontSize: 18 }}>🌐</span>
                  <a href={selectedPharmacy.website.startsWith('http') ? selectedPharmacy.website : `https://${selectedPharmacy.website}`}
                    target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: '#3b82f6', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {selectedPharmacy.website}
                  </a>
                </div>
              )}
              {userCoords && (
                <a href={`https://yandex.ru/maps/?rtext=${userCoords.lat},${userCoords.lon}~${selectedPharmacy.coords[0]},${selectedPharmacy.coords[1]}&rtt=mt`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', background: '#ef4444', color: '#fff', textAlign: 'center', padding: '14px', borderRadius: 14, fontWeight: 600, fontSize: 15, textDecoration: 'none', marginTop: 4 }}>
                  Маршрут в Яндекс.Картах
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AuthScreen = ({ onAuth, onGuest }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
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
        <button className="guest-btn" onClick={onGuest}>
          Попробовать без регистрации
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

const MedicineDetailSheet = ({ medicine, onClose }) => {
  const [wiki, setWiki] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('info');

  React.useEffect(() => {
    if (!medicine) return;
    setLoading(true);
    setWiki(null);
    // Wikipedia API — открытая, без CORS
    const url = `https://ru.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(medicine.name)}&prop=extracts&exintro=true&exchars=800&format=json&origin=*`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const pages = data?.query?.pages || {};
        const page = Object.values(pages)[0];
        if (page && page.pageid && page.extract) {
          // Убираем HTML теги
          const text = page.extract.replace(/<[^>]+>/g, '').replace(/\n+/g, '\n').trim();
          setWiki({ title: page.title, extract: text });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [medicine]);

  const expired = isExpired(medicine.expDate);
  const low = medicine.quantity <= 5;
  const grlsUrl = `https://grls.rosminzdrav.ru/grls/?t=reestr&n=medicines&search_filter=${encodeURIComponent(medicine.name)}`;
  const rlsUrl = `https://www.rlsnet.ru/search?q=${encodeURIComponent(medicine.name)}`;

  const tabs = [{ id: 'info', label: 'Общее' }, { id: 'links', label: 'Инструкция' }];

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="sheet-header">
          <h2 style={{ fontSize: 17, lineHeight: 1.3, paddingRight: 8 }}>{medicine.name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Статус */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Остаток</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: low ? '#ef4444' : '#111' }}>{medicine.quantity} шт</div>
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Срок годности</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: expired ? '#ef4444' : '#111' }}>{formatDate(medicine.expDate)}</div>
          </div>
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 16 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === t.id ? '#fff' : 'transparent',
              color: activeTab === t.id ? '#111' : '#6b7280',
              boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="spinner" style={{ width: 28, height: 28 }} />
              </div>
            ) : wiki ? (
              <div>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
                  {wiki.extract}
                </p>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Источник: Wikipedia</p>
              </div>
            ) : (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
                Описание не найдено в Wikipedia
              </p>
            )}
          </div>
        )}

        {activeTab === 'links' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 4px' }}>
              Официальные источники с полной инструкцией по применению:
            </p>
            <a href={grlsUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid #e5e7eb' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" width="18" height="18">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Реестр ГРЛС</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Минздрав России · Официальная инструкция</div>
              </div>
            </a>
            <a href={rlsUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid #e5e7eb' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" width="18" height="18">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>РЛС (rlsnet.ru)</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Справочник лекарственных средств</div>
              </div>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

const GuestRegisterSheet = ({ onClose, message, medicinesCount }) => {
  const [loading, setLoading] = React.useState(false);
  const handleSignIn = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-header">
          <h2>Зарегистрируйтесь</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="guest-register-body">
          <div className="guest-register-icon">
            <svg viewBox="0 0 48 48" fill="none" width="56" height="56">
              <circle cx="24" cy="24" r="24" fill="#f0fdf4"/>
              <path d="M24 14a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" fill="#16a34a"/>
              <path d="M14 34c0-5.5 4.5-9 10-9s10 3.5 10 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="guest-register-msg">
            {message || 'Зарегистрируйтесь, чтобы сохранить ваши данные и получить полный доступ.'}
          </p>
          {medicinesCount > 0 && (
            <div className="guest-transfer-notice">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" width="16" height="16">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {medicinesCount} {medicinesCount === 1 ? 'лекарство будет перенесено' : medicinesCount < 5 ? 'лекарства будут перенесены' : 'лекарств будут перенесены'} в ваш аккаунт
            </div>
          )}
          <button className="google-btn" onClick={handleSignIn} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <span>Вход...</span> : <><GoogleIcon />Войти через Google</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
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
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const touchStartX = useRef(null);
  const [selectedMed, setSelectedMed] = useState(null);
  const [guestScanCount, setGuestScanCount] = useState(0);
  const [showGuestRegister, setShowGuestRegister] = useState(false);
  const [guestLimitMessage, setGuestLimitMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUserId(session.user.id); setUserEmail(session.user.email || ''); loadUserData(session.user.id); }
      else setAuthStep('login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUserId(session.user.id); setUserEmail(session.user.email || ''); loadUserData(session.user.id); }
      else { setUserId(null); setUserEmail(''); setAuthStep('login'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const isGuest = authStep === 'guest';

  const initGuest = () => {
    try {
      const storedMeds = sessionStorage.getItem('guest_medicines');
      const storedIntakes = sessionStorage.getItem('guest_intakes');
      const storedScanCount = sessionStorage.getItem('guest_scan_count');
      setMedicines(storedMeds ? JSON.parse(storedMeds) : []);
      setIntakes(storedIntakes ? JSON.parse(storedIntakes) : []);
      setGuestScanCount(storedScanCount ? parseInt(storedScanCount) : 0);
    } catch { }
    setAuthStep('guest');
  };

  const loadUserData = async (uid) => {
    try {
      // Миграция гостевых данных при регистрации
      try {
        const guestMedsRaw = sessionStorage.getItem('guest_medicines');
        const guestIntakesRaw = sessionStorage.getItem('guest_intakes');
        if (guestMedsRaw) {
          const guestMeds = JSON.parse(guestMedsRaw);
          if (guestMeds.length > 0) {
            await supabase.from('medicines').insert(
              guestMeds.map(m => ({ user_id: uid, name: m.name, exp_date: m.expDate, quantity: m.quantity }))
            );
          }
          sessionStorage.removeItem('guest_medicines');
          sessionStorage.removeItem('guest_scan_count');
        }
        if (guestIntakesRaw) {
          const guestIntakes = JSON.parse(guestIntakesRaw);
          if (guestIntakes.length > 0) {
            await supabase.from('intakes').insert(
              guestIntakes.map(i => ({ user_id: uid, name: i.name, time: i.time, qty: i.qty, done: false }))
            );
          }
          sessionStorage.removeItem('guest_intakes');
        }
      } catch { }

      const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle();
      if (prof) {
        setProfile({ name: prof.name || '', allergy: prof.allergy || '' });
        setAuthStep('done');
      } else {
        setAuthStep('onboarding');
      }

      const { data: meds, error: medsError } = await supabase.from('medicines').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      if (medsError) console.error('medicines load error:', medsError);
      setMedicines((meds || []).map(m => ({ id: m.id, name: m.name, expDate: m.exp_date, quantity: m.quantity })));

      const { data: ints, error: intsError } = await supabase.from('intakes').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      if (intsError) console.error('intakes load error:', intsError);
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
    if (userId) await saveProfileToSupabase(userId, updated);
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
    if (isGuest) {
      if (medicines.length >= GUEST_MAX_MEDICINES) {
        setGuestLimitMessage(`Вы добавили максимум ${GUEST_MAX_MEDICINES} лекарств. Зарегистрируйтесь, чтобы добавить больше.`);
        setShowGuestRegister(true);
        setManualOpen(false);
        return;
      }
      const newMed = { id: Date.now(), name: manualName.trim(), expDate: manualExp || null, quantity: manualQty };
      const updated = [newMed, ...medicines];
      setMedicines(updated);
      try { sessionStorage.setItem('guest_medicines', JSON.stringify(updated)); } catch { }
      setManualOpen(false);
      return;
    }
    const uid = userId || (await supabase.auth.getSession()).data.session?.user?.id;
    const { data, error } = await supabase.from('medicines').insert({
      user_id: uid, name: manualName.trim(), exp_date: manualExp || null, quantity: manualQty,
    }).select().single();
    if (!error && data) {
      setMedicines(prev => [{ id: data.id, name: data.name, expDate: data.exp_date, quantity: data.quantity }, ...prev]);
    } else {
      console.error('Supabase insert error:', error);
      setMedicines(prev => [{ id: Date.now(), name: manualName.trim(), expDate: manualExp || null, quantity: manualQty }, ...prev]);
    }
    setManualOpen(false);
  };

  const openScanner = () => {
    if (isGuest && guestScanCount >= GUEST_MAX_SCANS) {
      setGuestLimitMessage('В гостевом режиме доступно только 1 сканирование. Зарегистрируйтесь для неограниченного доступа.');
      setShowGuestRegister(true);
      return;
    }
    setScanResult(null); setScanError(null); setAddQty(15); setScannerOpen(true); setTimeout(() => startScanner(), 200);
  };
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
    if (isGuest) {
      if (medicines.length >= GUEST_MAX_MEDICINES) {
        setGuestLimitMessage(`Вы добавили максимум ${GUEST_MAX_MEDICINES} лекарств. Зарегистрируйтесь, чтобы добавить больше.`);
        setShowGuestRegister(true);
        closeScanner();
        return;
      }
      const d = scanResult?.data || {};
      const drugs = d.drugsData || {};
      const name = d.productName || drugs.prodDescLabel || 'Неизвестное лекарство';
      const expDate = d.expDate || drugs.expirationDate || null;
      const newMed = { id: Date.now(), name, expDate, quantity: addQty };
      const updated = [newMed, ...medicines];
      setMedicines(updated);
      try { sessionStorage.setItem('guest_medicines', JSON.stringify(updated)); } catch { }
      const newCount = guestScanCount + 1;
      setGuestScanCount(newCount);
      try { sessionStorage.setItem('guest_scan_count', String(newCount)); } catch { }
      closeScanner();
      return;
    }
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    const name = d.productName || drugs.prodDescLabel || 'Неизвестное лекарство';
    const expDate = d.expDate || drugs.expirationDate || null;
    const uid = userId || (await supabase.auth.getSession()).data.session?.user?.id;
    const { data, error } = await supabase.from('medicines').insert({
      user_id: uid, name, exp_date: expDate, quantity: addQty,
    }).select().single();
    if (!error && data) {
      setMedicines(prev => [{ id: data.id, name: data.name, expDate: data.exp_date, quantity: data.quantity }, ...prev]);
    } else {
      // fallback: добавляем локально если Supabase недоступен
      console.error('Supabase insert error:', error);
      setMedicines(prev => [{ id: Date.now(), name, expDate, quantity: addQty }, ...prev]);
    }
    closeScanner();
  };

  const getMedicineData = () => {
    if (!scanResult) return null;
    const d = scanResult?.data || {};
    const drugs = d.drugsData || {};
    return { name: d.productName || drugs.prodDescLabel || 'Неизвестное лекарство', expDate: d.expDate || drugs.expirationDate || '—' };
  };

  const deleteMedicine = async (id) => {
    if (isGuest) {
      setSwipedMedId(null);
      const updated = medicines.filter(m => m.id !== id);
      setMedicines(updated);
      try { sessionStorage.setItem('guest_medicines', JSON.stringify(updated)); } catch { }
      return;
    }
    setSwipedMedId(null);
    setDeletingMeds(prev => new Set(prev).add(id));
    await supabase.from('medicines').delete().eq('id', id);
    setTimeout(() => {
      setMedicines(prev => prev.filter(m => m.id !== id));
      setDeletingMeds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 350);
  };

  const filteredMeds = medicines.filter(m => m.name.toLowerCase().includes(homeSearch.toLowerCase()));

  const handleAddIntake = async () => {
    if (!intakeName.trim()) return;
    if (isGuest) {
      const newIntake = { id: Date.now(), name: intakeName.trim(), time: intakeTime || '--:--', qty: intakeQty, done: false };
      const updated = [newIntake, ...intakes];
      setIntakes(updated);
      try { sessionStorage.setItem('guest_intakes', JSON.stringify(updated)); } catch { }
      setIntakeName(''); setIntakeTime(''); setIntakeQty(1); setAddIntakeOpen(false);
      return;
    }
    const { data, error } = await supabase.from('intakes').insert({
      user_id: userId, name: intakeName.trim(), time: intakeTime || '--:--', qty: intakeQty, done: false,
    }).select().single();
    if (!error && data) {
      setIntakes(prev => [{ id: data.id, name: data.name, time: data.time, qty: data.qty, done: data.done }, ...prev]);
    }
    setIntakeName(''); setIntakeTime(''); setIntakeQty(1); setAddIntakeOpen(false);
  };

  const toggleIntakeDone = async (id) => {
    const intake = intakes.find(i => i.id === id);
    if (!intake) return;
    const newDone = !intake.done;
    if (isGuest) {
      const updated = intakes.map(i => i.id === id ? { ...i, done: newDone } : i);
      setIntakes(updated);
      try { sessionStorage.setItem('guest_intakes', JSON.stringify(updated)); } catch { }
      setSwipedIntakeId(null);
      return;
    }
    setIntakes(prev => prev.map(i => i.id === id ? { ...i, done: newDone } : i));
    setSwipedIntakeId(null);
    await supabase.from('intakes').update({ done: newDone }).eq('id', id);
  };

  const closeSchedule = () => {
    if (isGuest) {
      const updated = intakes.filter(i => !i.done);
      setIntakes(updated);
      try { sessionStorage.setItem('guest_intakes', JSON.stringify(updated)); } catch { }
      setActiveTab('home');
      return;
    }
    const doneIds = intakes.filter(i => i.done).map(i => i.id);
    if (doneIds.length > 0) supabase.from('intakes').delete().in('id', doneIds);
    setIntakes(prev => prev.filter(i => !i.done));
    setActiveTab('home');
  };

  const deleteIntake = async (id) => {
    if (isGuest) {
      setSwipedIntakeId(null);
      const updated = intakes.filter(i => i.id !== id);
      setIntakes(updated);
      try { sessionStorage.setItem('guest_intakes', JSON.stringify(updated)); } catch { }
      return;
    }
    setSwipedIntakeId(null);
    setDeletingIntakes(prev => new Set(prev).add(id));
    await supabase.from('intakes').delete().eq('id', id);
    setTimeout(() => {
      setIntakes(prev => prev.filter(i => i.id !== id));
      setDeletingIntakes(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 350);
  };

  if (authStep === 'loading') {
    return <div className="auth-screen"><div className="spinner" style={{ width: 40, height: 40, margin: 'auto' }} /></div>;
  }

  if (authStep === 'login') {
    return <AuthScreen onAuth={async (user) => {
      await loadUserData(user.uid);
    }} onGuest={initGuest} />;
  }

  if (authStep === 'onboarding') {
    return <OnboardingScreen onDone={async (p) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await saveProfileToSupabase(session.user.id, p);
      setProfile(p);
      setAuthStep('done');
    }} />;
  }

  return (
    <div className="app" onClick={() => { setSwipedMedId(null); setSwipedIntakeId(null); }}>
      <div className="home">
        <div className="home-header">
          <h1 className="greeting">{isGuest ? 'Гостевой режим' : `Привет, ${profile.name || 'друг'}`}</h1>
          <button className="avatar" onClick={isGuest ? () => { setGuestLimitMessage(''); setShowGuestRegister(true); } : openProfile}>
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
                    onClick={e => { if (!open) { e.stopPropagation(); setSelectedMed(med); } }}
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

            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <button onClick={() => avatarInputRef.current?.click()} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e5e7eb' }}>
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 30, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>{(profile.name || '?')[0]}</span>
                  }
                </div>
                <div style={{ position: 'absolute', bottom: 2, right: 2, background: '#111', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" width="11" height="11">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
              </button>
              <div style={{ marginTop: 10, fontWeight: 700, fontSize: 18, color: '#111' }}>{profile.name || 'Пользователь'}</div>
              {userEmail && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{userEmail}</div>}
            </div>

            {/* Info rows */}
            <div style={{ background: '#f9fafb', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" width="17" height="17">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Имя</div>
                  {profileEdit
                    ? <input style={{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 500, color: '#111', background: 'transparent', padding: 0, width: '100%' }} value={profileName} onChange={e => setProfileName(e.target.value)} autoFocus />
                    : <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>{profile.name || '—'}</div>
                  }
                </div>
              </div>

              <div style={{ padding: '13px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" width="17" height="17">
                    <rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7 10-7"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Email</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>{userEmail || '—'}</div>
                </div>
              </div>

              <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" width="17" height="17">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Аллергии / Заболевания</div>
                  {profileEdit
                    ? <textarea style={{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 500, color: '#111', background: 'transparent', padding: 0, resize: 'none', minHeight: 56, fontFamily: 'inherit', width: '100%' }} value={profileAllergy} onChange={e => setProfileAllergy(e.target.value)} />
                    : <div style={{ fontSize: 15, fontWeight: 500, color: '#111', whiteSpace: 'pre-wrap' }}>{profile.allergy || '—'}</div>
                  }
                </div>
              </div>
            </div>

            {profileEdit ? (
              <button onClick={saveProfile} style={{ width: '100%', background: '#111', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
                Сохранить
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => { setProfileName(profile.name || ''); setProfileAllergy(profile.allergy || ''); setProfileEdit(true); }} style={{ width: '100%', background: '#f3f4f6', color: '#111', border: 'none', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" width="16" height="16">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Редактировать профиль
                </button>
                <button onClick={() => supabase.auth.signOut()} style={{ width: '100%', background: '#fff', color: '#ef4444', border: '1.5px solid #fecaca', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" width="16" height="16">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Выйти из аккаунта
                </button>
              </div>
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
                {isGuest && guestScanCount === 0 && (
              <div className="guest-scan-notice">
                Гостевой режим: 1 бесплатное сканирование
              </div>
            )}
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
      {selectedMed && (
        <MedicineDetailSheet
          medicine={selectedMed}
          onClose={() => setSelectedMed(null)}
        />
      )}

      {showGuestRegister && (
        <GuestRegisterSheet
          onClose={() => { setShowGuestRegister(false); setGuestLimitMessage(''); }}
          message={guestLimitMessage}
          medicinesCount={medicines.length}
        />
      )}
    </div>
  );
};

export default App;
