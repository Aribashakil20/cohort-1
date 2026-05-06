/**
 * AdRecommendation.jsx — Shows the current recommended brand ad
 * with a visual ad display preview, and a secondary time-of-day ad slot.
 *
 * Props:
 *   ageGroup      — dominant age group ("adult", "youth", etc.)
 *   crowdGender   — "male" | "female" | "mixed"
 *   ageConfident  — bool: 60%+ crowd in one age group
 *   emotion       — dominant emotion string
 *   qualityScore  — 0-100 mood score
 */

import { useState, useEffect, useRef } from "react";
import { resolveAdPool, resolveTimeAdPool } from "./adLibrary";

const EMOTION_EMOJI = {
  happiness: "😊", surprise: "😮", neutral: "😐",
  sadness: "😢", anger: "😠", disgust: "🤢", fear: "😨",
};

// Brand-specific ad banner styles — simulates actual digital signage display
const AD_BANNERS = {
  "LEGO": {
    bg: "linear-gradient(135deg, #f5c400 0%, #e3a800 100%)",
    text: "#1a1a1a", sub: "#3a2800",
    badge: "#e3a800", badgeText: "#1a1a1a",
    pattern: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.04) 8px, rgba(0,0,0,0.04) 16px)",
  },
  "Barbie": {
    bg: "linear-gradient(135deg, #ff69b4 0%, #e91e8c 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.8)",
    badge: "#c2185b", badgeText: "#fff",
    pattern: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)",
  },
  "PlayStation 5": {
    bg: "linear-gradient(135deg, #00439c 0%, #001a57 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.7)",
    badge: "#0070cc", badgeText: "#fff",
    pattern: "radial-gradient(ellipse at 70% 30%, rgba(0,112,255,0.3) 0%, transparent 60%)",
  },
  "Tanishq": {
    bg: "linear-gradient(135deg, #b8860b 0%, #8b6508 50%, #d4a017 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.8)",
    badge: "#8b6508", badgeText: "#ffd700",
    pattern: "radial-gradient(circle at 30% 70%, rgba(255,215,0,0.2) 0%, transparent 50%)",
  },
  "Maruti Suzuki": {
    bg: "linear-gradient(135deg, #1b5e20 0%, #0d3b12 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.75)",
    badge: "#2e7d32", badgeText: "#fff",
    pattern: "linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%)",
  },
  "MakeMyTrip": {
    bg: "linear-gradient(135deg, #e84393 0%, #9c1ab1 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.8)",
    badge: "#6a0080", badgeText: "#fff",
    pattern: "radial-gradient(ellipse at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)",
  },
  "LG Electronics": {
    bg: "linear-gradient(135deg, #a50034 0%, #6d0022 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.75)",
    badge: "#c62828", badgeText: "#fff",
    pattern: "radial-gradient(circle at 85% 15%, rgba(255,100,100,0.2) 0%, transparent 40%)",
  },
  "Lakme": {
    bg: "linear-gradient(135deg, #880e4f 0%, #c2185b 60%, #f06292 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.85)",
    badge: "#ad1457", badgeText: "#fff",
    pattern: "radial-gradient(circle at 75% 25%, rgba(255,255,255,0.12) 0%, transparent 45%)",
  },
  "Apollo Hospitals": {
    bg: "linear-gradient(135deg, #006064 0%, #00363a 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.75)",
    badge: "#00838f", badgeText: "#fff",
    pattern: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)",
  },
  "LIC Insurance": {
    bg: "linear-gradient(135deg, #e65100 0%, #bf360c 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.8)",
    badge: "#bf360c", badgeText: "#ffe0b2",
    pattern: "radial-gradient(ellipse at 60% 40%, rgba(255,200,100,0.15) 0%, transparent 55%)",
  },
  "Coca-Cola": {
    bg: "linear-gradient(135deg, #c62828 0%, #8b0000 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.85)",
    badge: "#b71c1c", badgeText: "#fff",
    pattern: "radial-gradient(circle at 25% 75%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  "Himalaya Wellness": {
    bg: "linear-gradient(135deg, #1b5e20 0%, #33691e 60%, #558b2f 100%)",
    text: "#fff", sub: "rgba(255,255,255,0.8)",
    badge: "#2e7d32", badgeText: "#f1f8e9",
    pattern: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 45%)",
  },
};

// Local ad image paths
const AD_IMAGE_FILES = {
  "Coca-Cola":         "/ads/cocacola.webp",
  "LEGO":              "/ads/lego.jpg",
  "Barbie":            "/ads/barbie.jpg",
  "PlayStation 5":     "/ads/ps5.jpg",
  "Tanishq":           "/ads/tanishq.jpg",
  "Maruti Suzuki":     "/ads/maruti.jpg",
  "MakeMyTrip":        "/ads/makemytrip.jpg",
  "LG Electronics":    "/ads/lg.jpg",
  "Lakme":             "/ads/lakme.jpg",
  "Apollo Hospitals":  "/ads/apollo.jpg",
  "LIC Insurance":     "/ads/lic.jpg",
  "Himalaya Wellness": "/ads/himalaya.jpg",
  "Nike":              "/ads/nike.jpg",
  "boAt":              "/ads/boat.jpg",
  "iPhone":            "/ads/iphone.jpg",
  "Max Protein":       "/ads/maxprotien.jpg",
  "Levi's":            "/ads/levis.jpg",
  "Nykaa":             "/ads/nykaa.jpg",
  "Myntra":            "/ads/myntra.jpg",
  "Plum":              "/ads/plum.jpg",
  "Magnum":            "/ads/magnum.jpg",
  "Goibibo":           "/ads/goibibo.jpg",
  "Amazon":            "/ads/amazon.jpg",
  "Dabur":             "/ads/dabur.jpg",
  "Lay's":             "/ads/lays.jpg",
  "Dairy Milk":        "/ads/diarymilk.jpg",
  "Netflix":           "/ads/netflix.jpg",
  "Domino's":          "/ads/dominos.jpg",
  "KFC":               "/ads/kfc.jpg",
  "Subway":            "/ads/subway.jpg",
  "Burger King":       "/ads/burgerking.jpg",
  "Blinkit":           "/ads/blinkit.jpg",
  "Nescafé":           "/ads/nescafe.jpg",
  "Maggi":             "/ads/maggi.jpg",
  "Zomato":            "/ads/zomato.jpg",
  "Spotify":           "/ads/spotify.jpg",
};

function AdBanner({ ad, hero = false }) {
  const style = AD_BANNERS[ad?.brand] ?? {
    bg: `linear-gradient(135deg, ${ad?.color ?? "#334155"}cc, ${ad?.color ?? "#334155"}99)`,
    text: "#fff", sub: "rgba(255,255,255,0.75)",
    badge: ad?.color ?? "#334155", badgeText: "#fff",
    pattern: "",
  };

  const imgSrc = AD_IMAGE_FILES[ad?.brand];
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imgSrc && !imgFailed;

  if (hero) {
    return (
      <div
        className="rounded-xl overflow-hidden border-2 shadow-xl relative w-full"
        style={{ borderColor: `${ad?.color ?? "#334155"}66` }}
      >
        {/* Full-width ad image */}
        {showImage ? (
          <img
            src={imgSrc}
            alt={ad?.brand}
            className="w-full object-cover"
            style={{ height: "420px" }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="w-full flex flex-col items-center justify-center overflow-hidden relative"
            style={{ background: style.bg, height: "420px" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: style.pattern }} />
            <div className="text-8xl mb-4 drop-shadow-lg relative z-10">{ad?.icon ?? "📢"}</div>
            <div className="text-4xl font-black tracking-tight text-center relative z-10 drop-shadow" style={{ color: style.text }}>
              {ad?.brand}
            </div>
            <div className="text-lg italic mt-2 font-medium text-center relative z-10" style={{ color: style.sub }}>
              "{ad?.headline}"
            </div>
          </div>
        )}

        {/* Top-left: NOW ON AIR */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-[10px] font-bold tracking-widest uppercase">Now On Air</span>
        </div>

        {/* Top-right: category badge */}
        <div className="absolute top-3 right-3">
          <span
            className="text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider"
            style={{ background: style.badge, color: style.badgeText }}
          >
            {ad?.category}
          </span>
        </div>

        {/* Bottom overlay: brand + headline + target */}
        <div
          className="absolute bottom-0 left-0 right-0 px-5 py-4"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
        >
          <div className="text-white text-2xl font-black leading-tight drop-shadow">{ad?.brand}</div>
          <div className="text-slate-200 text-sm italic mt-0.5">"{ad?.headline}"</div>
          <div className="text-slate-400 text-xs mt-1">Target: <span className="text-slate-200">{ad?.target}</span></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden border-2 shadow-lg"
      style={{ borderColor: `${ad?.color ?? "#334155"}66` }}
    >
      {/* Top bar — "NOW ON AIR" */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: "rgba(0,0,0,0.75)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white/80 text-[10px] font-bold tracking-widest uppercase">Now On Air</span>
        </div>
        <span
          className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: style.badge, color: style.badgeText }}
        >
          {ad?.category}
        </span>
      </div>

      {/* Main ad creative */}
      {showImage ? (
        <div className="relative">
          <img
            src={imgSrc}
            alt={ad?.brand}
            className="w-full object-cover"
            style={{ maxHeight: "160px" }}
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div
          className="relative flex flex-col items-center justify-center px-6 py-6 min-h-[130px] text-center overflow-hidden"
          style={{ background: style.bg }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: style.pattern }} />
          <div className="text-5xl mb-2 drop-shadow-lg relative z-10">{ad?.icon ?? "📢"}</div>
          <div className="text-2xl font-black tracking-tight leading-tight relative z-10 drop-shadow" style={{ color: style.text }}>
            {ad?.brand}
          </div>
          <div className="text-sm italic mt-1 font-medium relative z-10" style={{ color: style.sub }}>
            "{ad?.headline}"
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: "rgba(0,0,0,0.75)" }}
      >
        <span className="text-slate-300 text-[10px]">Target: <span className="text-white font-medium">{ad?.target}</span></span>
        <span className="text-slate-400 text-[10px] italic">"{ad?.headline}"</span>
      </div>
    </div>
  );
}

const ROTATE_INTERVAL = 3000; // 3 seconds per ad

export default function AdRecommendation({ ageGroup, crowdGender, ageConfident, emotion, qualityScore, hero = false }) {
  const demoPool = resolveAdPool(crowdGender ?? "mixed", ageGroup ?? "adult", ageConfident ?? false, emotion ?? "neutral");
  const timePool = resolveTimeAdPool();
  const qualPct  = qualityScore ?? null;

  // Merge demographic + time-slot into one pool, deduplicated by brand
  const seen = new Set();
  const combined = [...demoPool, ...timePool].filter(ad => {
    if (seen.has(ad.brand)) return false;
    seen.add(ad.brand);
    return true;
  });

  const [idx,      setIdx]      = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef    = useRef(null);
  const progressRef = useRef(null);

  // Reset when demographics change
  useEffect(() => {
    setIdx(0);
    setProgress(0);
  }, [crowdGender, ageGroup, ageConfident, emotion]);

  // Rotate through combined pool
  useEffect(() => {
    if (combined.length <= 1) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIdx(i => (i + 1) % combined.length);
      setProgress(0);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [combined.length, crowdGender, ageGroup, ageConfident, emotion]);

  // Progress bar
  useEffect(() => {
    if (combined.length <= 1) return;
    clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      setProgress(p => Math.min(100, p + (100 / (ROTATE_INTERVAL / 100))));
    }, 100);
    return () => clearInterval(progressRef.current);
  }, [idx, combined.length]);

  const ad = combined[idx] ?? combined[0];
  const isTimeSlot    = timePool.some(t => t.brand === ad?.brand) && !demoPool.some(d => d.brand === ad?.brand);
  const moodOverride  = ["angry", "disgusted", "fearful"].includes(emotion);

  return (
    <div className="flex flex-col gap-3">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-slate-300 text-sm font-medium">
            {isTimeSlot ? "Time Slot Ad" : "Recommended Ad"}
          </div>
          {combined.length > 1 && (
            <div className="flex gap-1">
              {combined.map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{ backgroundColor: i === idx ? (ad?.color ?? "#60a5fa") : "#475569" }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {isTimeSlot && (
            <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full">🕐 Time-based</span>
          )}
          {moodOverride && (
            <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">Mood override</span>
          )}
          {combined.length > 1 && (
            <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
              {idx + 1}/{combined.length} rotating
            </span>
          )}
        </div>
      </div>

      {/* ── Single ad banner ────────────────────────────────────────── */}
      <AdBanner ad={ad} hero={hero} />

      {/* ── Progress bar ────────────────────────────────────────────── */}
      {combined.length > 1 && (
        <div className="w-full h-0.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{ width: `${progress}%`, backgroundColor: ad?.color ?? "#60a5fa" }}
          />
        </div>
      )}

      {/* ── Description ─────────────────────────────────────────────── */}
      <div
        className="rounded-lg px-3 py-2.5 border"
        style={{ background: `${ad?.color ?? "#334155"}11`, borderColor: `${ad?.color ?? "#334155"}33` }}
      >
        <div className="text-slate-300 text-xs mb-1">{ad?.description}</div>
        <div className="text-slate-500 text-[10px]">
          {isTimeSlot
            ? <span className="text-orange-300">Showing based on time of day</span>
            : <>Audience: <span className="text-slate-300 capitalize">{ageGroup ?? "—"}</span>
                {crowdGender && crowdGender !== "—" && <span className="text-slate-300"> · {crowdGender}</span>}</>
          }
        </div>
      </div>

      {/* ── Quality score ───────────────────────────────────────────── */}
      {qualPct != null && (
        <div className="bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400">Ad Quality Score</span>
            <span className={`font-bold ${qualPct >= 70 ? "text-green-300" : qualPct >= 40 ? "text-yellow-300" : "text-red-300"}`}>
              {qualPct}/100
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${qualPct}%`, backgroundColor: qualPct >= 70 ? "#34d399" : qualPct >= 40 ? "#fbbf24" : "#ef4444" }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
