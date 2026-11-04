import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Droplet, Ruler, Layers, Droplets, FileText } from 'lucide-react';

const FEATURES = [
  { icon: Ruler, title: 'Desain & visualisasi penampang', text: 'Susun konstruksi pipa, saringan, dan kerikil secara visual.' },
  { icon: Layers, title: 'Log geologi', text: 'Catat lapisan tanah per kedalaman dengan rapi.' },
  { icon: Droplets, title: 'Monitoring air tanah', text: 'Pantau muka air dan lihat tren dalam grafik.' },
  { icon: FileText, title: 'Laporan siap cetak', text: 'Hasilkan dokumen PDF dari data sumur Anda.' },
];

/* Ilustrasi penampang sumur bor — SVG murni yang digambar ulang mengikuti
   ukuran wadahnya, sehingga selalu pas mengisi panel di layar apa pun. */
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function wave(w, y, amp, ph, step = 8) {
  const pts = [];
  for (let x = 0; x <= w; x += step) {
    const yy = y + Math.sin((x / w) * Math.PI * 2.6 + ph) * amp + Math.sin((x / w) * Math.PI * 7 + ph * 2) * amp * 0.3;
    pts.push(`${x.toFixed(1)} ${yy.toFixed(1)}`);
  }
  return pts;
}
const fillBelow = (pts, w, h) => `M${pts.join('L')}L${w} ${h}L0 ${h}Z`;

function rng(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function BoreholeArt() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 520, h: 300 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 80 && r.height > 80) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const g = useMemo(() => {
    const y0 = 50, y1 = h - 28, k = (y1 - y0) / 80;
    const Y = (d) => y0 + d * k;
    const cx = Math.round(w * 0.5);
    const pw = Math.max(22, Math.min(36, w * 0.06));
    const gw = pw * 2.5;
    const rand = rng(7);
    const grains = Array.from({ length: Math.round(w / 9) }, () => [rand() * w, Y(rand() * 48), rand() < 0.25 ? 2.2 : 1.4]);
    const bubbles = Array.from({ length: 9 }, (_, i) => [cx + (rand() < 0.5 ? -1 : 1) * (gw / 2 + 14 + rand() * (w * 0.3)), Y(58 + rand() * 18), 1.6 + rand() * 2.2, i * 0.9]);
    return {
      y0, y1, Y, cx, pw, gw, grains, bubbles,
      top: fillBelow(wave(w, Y(0), 3, 0.6), w, h),
      clay: fillBelow(wave(w, Y(16), 5, 1.9), w, h),
      sand: fillBelow(wave(w, Y(36), 5, 3.1), w, h),
      water: (() => { const p = []; for (let x = 0; x <= w + 80; x += 6) p.push(`${x} ${(Y(50) + Math.sin((x / 80) * Math.PI * 2) * 2.4).toFixed(1)}`); return `M${p.join('L')}L${w + 80} ${h}L0 ${h}Z`; })(),
      waterLine: (() => { const p = []; for (let x = 0; x <= w + 80; x += 6) p.push(`${x} ${(Y(50) + Math.sin((x / 80) * Math.PI * 2) * 2.4).toFixed(1)}`); return `M${p.join('L')}`; })(),
    };
  }, [w, h]);

  const { Y, cx, pw, gw } = g;
  const px = cx - pw / 2;
  const slots = Math.max(3, Math.floor((Y(74) - Y(53)) / 11));
  const wide = w >= 360;

  return (
    <div className="auth-art" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Ilustrasi penampang sumur bor">
        <defs>
          <linearGradient id="aa-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".07" />
            <stop offset="1" stopColor="#ffffff" stopOpacity=".01" />
          </linearGradient>
          <linearGradient id="aa-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d7a4c" /><stop offset="1" stopColor="#5f6140" />
          </linearGradient>
          <linearGradient id="aa-clay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a6b3d" /><stop offset="1" stopColor="#64502f" />
          </linearGradient>
          <linearGradient id="aa-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8f7a4a" /><stop offset="1" stopColor="#6f6240" />
          </linearGradient>
          <linearGradient id="aa-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3fbfb2" /><stop offset=".5" stopColor="#1d8a83" /><stop offset="1" stopColor="#0d5551" />
          </linearGradient>
          <linearGradient id="aa-pipe" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#bfd3d0" /><stop offset=".3" stopColor="#ffffff" /><stop offset=".55" stopColor="#e3eeec" /><stop offset="1" stopColor="#8fb0ab" />
          </linearGradient>
          <linearGradient id="aa-inwater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7ff0e3" stopOpacity=".75" /><stop offset="1" stopColor="#2fb7ad" stopOpacity=".55" />
          </linearGradient>
          <radialGradient id="aa-glow" cx=".5" cy="0" r=".6">
            <stop offset="0" stopColor="#7ff0e3" stopOpacity=".35" /><stop offset="1" stopColor="#7ff0e3" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="aa-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset=".6" stopColor="#031f1d" stopOpacity="0" /><stop offset="1" stopColor="#031f1d" stopOpacity=".55" />
          </linearGradient>
          <clipPath id="aa-clip"><rect x="0" y="0" width={w} height={h} rx="22" /></clipPath>
        </defs>

        <g clipPath="url(#aa-clip)">
          <rect width={w} height={h} fill="rgba(3,31,29,.35)" />
          <rect width={w} height={g.y0} fill="url(#aa-sky)" />

          {/* lapisan tanah */}
          <path d={g.top} fill="url(#aa-top)" />
          <path d={g.clay} fill="url(#aa-clay)" />
          <path d={g.sand} fill="url(#aa-sand)" />

          {/* butiran */}
          <g fill="#fff" fillOpacity=".22">
            {g.grains.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
          </g>

          {/* akuifer + gelombang muka air */}
          <g clipPath="url(#aa-clip)">
            <g className="aa-wave"><path d={g.water} fill="url(#aa-water)" /><path d={g.waterLine} fill="none" stroke="#9ff7ec" strokeOpacity=".75" strokeWidth="1.4" /></g>
          </g>
          <rect x="0" y={Y(50)} width={w} height={Y(80) - Y(50) + 40} fill="url(#aa-glow)" opacity=".7" />
          <g fill="#c9fff9" fillOpacity=".5">
            {g.bubbles.map(([x, y, r, d], i) => <circle key={i} className="aa-bubble" cx={x} cy={y} r={r} style={{ animationDelay: `${d}s` }} />)}
          </g>
          <rect width={w} height={h} fill="url(#aa-fade)" />

          {/* kerikil (gravel pack) */}
          <rect x={cx - gw / 2} y={g.y0} width={gw} height={Y(76) - g.y0} rx="3" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.16)" />
          <g fill="#fff" fillOpacity=".45">
            {Array.from({ length: Math.floor((Y(76) - g.y0) / 13) }).map((_, i) => (
              <g key={i}>
                <circle cx={cx - gw / 2 + 6} cy={g.y0 + 8 + i * 13} r="1.7" />
                <circle cx={cx + gw / 2 - 6} cy={g.y0 + 14 + i * 13} r="1.7" />
              </g>
            ))}
          </g>

          {/* pipa casing */}
          <rect x={px} y={g.y0 - 16} width={pw} height={Y(53) - g.y0 + 16} rx="3" fill="url(#aa-pipe)" />
          {/* saringan */}
          <rect x={px} y={Y(53)} width={pw} height={Y(74) - Y(53)} rx="3" fill="url(#aa-pipe)" fillOpacity=".88" />
          <rect x={px + 2} y={Y(50)} width={pw - 4} height={Y(74) - Y(50)} fill="url(#aa-inwater)" />
          <g stroke="#0a4a46" strokeWidth="2" strokeLinecap="round" strokeOpacity=".8">
            {Array.from({ length: slots }).map((_, i) => (
              <g key={i}>
                <line x1={px + 5} y1={Y(53) + 8 + i * 11} x2={px + pw / 2 - 1} y2={Y(53) + 8 + i * 11} />
                <line x1={px + pw / 2 + 2} y1={Y(53) + 13 + i * 11} x2={px + pw - 5} y2={Y(53) + 13 + i * 11} />
              </g>
            ))}
          </g>
          <path d={`M${px} ${Y(74)} H${px + pw} V${Y(74) + 9} Q${cx} ${Y(74) + 16} ${px} ${Y(74) + 9} Z`} fill="#e6f2f0" />
          {/* tutup sumur */}
          <rect x={cx - pw * 0.78} y={g.y0 - 26} width={pw * 1.56} height="10" rx="3" fill="#fff" />
          <rect x={cx - pw * 0.78} y={g.y0 - 26} width={pw * 1.56} height="10" rx="3" fill="none" stroke="#7ff0e3" strokeOpacity=".5" />

          {/* penanda muka air tanah */}
          <g className="aa-mat">
            <path d={`M${cx + gw / 2 + 8} ${Y(50)} l11 -6.5 v13 z`} fill="#7ff0e3" />
            <line x1={cx + gw / 2 + 24} y1={Y(50)} x2={w - 66} y2={Y(50)} stroke="#bffaf3" strokeOpacity=".8" strokeDasharray="3 4" />
            <text x={w - 58} y={Y(50) + 4} fill="#d6fffa" fontSize="11" fontWeight="600" fontFamily={MONO}>MAT</text>
          </g>

          {/* label lapisan (di kiri pipa, agar tidak bertabrakan dengan penanda MAT) */}
          {w >= 420 && (
            <g fontFamily={MONO} fontSize="9.5" fill="#fff" fillOpacity=".7" letterSpacing=".1em">
              <text x="88" y={Y(8) + 3}>TANAH</text>
              <text x="88" y={Y(26) + 3}>LEMPUNG</text>
              <text x="88" y={Y(43) + 3}>PASIR</text>
              <text x="88" y={Y(66) + 3}>AKUIFER</text>
            </g>
          )}

          {/* skala kedalaman */}
          <g fontFamily={MONO} fontSize="10.5" fill="#fff" fillOpacity=".7">
            <line x1="24" y1={g.y0} x2="24" y2={g.y1} stroke="#fff" strokeOpacity=".4" />
            {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((d) => (
              <g key={d}>
                <line x1="24" y1={Y(d)} x2={d % 20 === 0 ? 36 : 30} y2={Y(d)} stroke="#fff" strokeOpacity={d % 20 === 0 ? 0.65 : 0.4} />
                {d % 20 === 0 && <text x="42" y={Y(d) + 3.5}>{d} m</text>}
              </g>
            ))}
          </g>

          {/* chip judul */}
          {wide && (
            <g fontFamily={MONO} fontSize="9.5" fill="#d6fffa">
              <rect x={w - 190} y="12" width="178" height="22" rx="11" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.2)" />
              <circle cx={w - 175} cy="23" r="3" fill="#7ff0e3" className="aa-live" />
              <text x={w - 165} y="26.5" fontSize="9" letterSpacing=".04em">PENAMPANG A–A′ · 80 M</text>
            </g>
          )}
        </g>
        <rect x=".5" y=".5" width={w - 1} height={h - 1} rx="22" fill="none" stroke="#ffffff" strokeOpacity=".22" />
      </svg>
    </div>
  );
}

function BrandMark({ size = 40 }) {
  return (
    <span className="auth-mark" style={{ '--s': `${size}px` }} aria-hidden="true">
      <Droplet size={Math.round(size * 0.5)} strokeWidth={2.1} />
    </span>
  );
}

export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout auth-shell">
      {/* Panel merek — hanya tampil di layar lebar */}
      <aside className="auth-aside" aria-hidden="false">
        <div className="auth-aside-bg" aria-hidden="true" />
        <div className="auth-aside-inner">
          <div className="auth-brand">
            <BrandMark size={44} />
            <span className="auth-brand-text">
              <strong>Borewell Engineering</strong>
              <small>Visualizer</small>
            </span>
          </div>

          <div className="auth-aside-body">
            <p className="auth-kicker">Rekayasa sumur bor</p>
            <h2 className="auth-headline">Dari penampang desain hingga laporan akhir, <span className="auth-accent">dalam satu tempat kerja.</span></h2>
            <ul className="auth-features">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="auth-feature-ico" aria-hidden="true"><Icon size={18} strokeWidth={1.9} /></span>
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <BoreholeArt />
        </div>
      </aside>

      {/* Konten form */}
      <div className="auth-main">
        {/* Band merek ringkas — hanya tampil di ponsel/tablet */}
        <header className="auth-mobile-hero">
          <div className="auth-mobile-brand">
            <BrandMark size={40} />
            <span className="auth-brand-text">
              <strong>Borewell Engineering</strong>
              <small>Visualizer</small>
            </span>
          </div>
          <p>Desain, geologi, monitoring, dan laporan sumur bor dalam satu aplikasi.</p>
        </header>

        <main className="auth-viewport" aria-label="Halaman autentikasi">
          {children}
        </main>

        <footer className="auth-legal">© {new Date().getFullYear()} Borewell Engineering Visualizer</footer>
      </div>
    </div>
  );
}
