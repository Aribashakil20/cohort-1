/**
 * AdDisplayScreen.jsx — Full ad display gallery
 * Shows all 12 brand ads with their real images or styled banners.
 * Accessible from the Ad Performance tab.
 */

import { useState } from "react";
import { AD_LIBRARY, TIME_SLOTS } from "./adLibrary";

// Flatten time slot pools into displayable ad objects
const TIME_ADS = Object.values(TIME_SLOTS).flatMap(slot =>
  slot.pool.map(ad => ({ ...ad, _timeSlot: true }))
);
// Deduplicate by brand name
const UNIQUE_TIME_ADS = TIME_ADS.filter((ad, idx, arr) => arr.findIndex(a => a.brand === ad.brand) === idx);

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

const AD_BANNER_STYLES = {
  "LEGO":              { bg: "linear-gradient(135deg,#f5c400,#e3a800)", text: "#1a1a1a", sub: "#3a2800" },
  "Barbie":            { bg: "linear-gradient(135deg,#ff69b4,#e91e8c)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "PlayStation 5":     { bg: "linear-gradient(135deg,#00439c,#001a57)", text: "#fff",    sub: "rgba(255,255,255,0.75)" },
  "Tanishq":           { bg: "linear-gradient(135deg,#b8860b,#d4a017)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "Maruti Suzuki":     { bg: "linear-gradient(135deg,#1b5e20,#0d3b12)", text: "#fff",    sub: "rgba(255,255,255,0.8)" },
  "MakeMyTrip":        { bg: "linear-gradient(135deg,#e84393,#9c1ab1)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "LG Electronics":    { bg: "linear-gradient(135deg,#a50034,#6d0022)", text: "#fff",    sub: "rgba(255,255,255,0.8)" },
  "Lakme":             { bg: "linear-gradient(135deg,#880e4f,#f06292)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "Apollo Hospitals":  { bg: "linear-gradient(135deg,#006064,#00363a)", text: "#fff",    sub: "rgba(255,255,255,0.8)" },
  "LIC Insurance":     { bg: "linear-gradient(135deg,#e65100,#bf360c)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "Coca-Cola":         { bg: "linear-gradient(135deg,#c62828,#8b0000)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
  "Himalaya Wellness": { bg: "linear-gradient(135deg,#1b5e20,#558b2f)", text: "#fff",    sub: "rgba(255,255,255,0.85)" },
};

function AdCard({ ad, selected, onClick }) {
  const imgSrc = AD_IMAGE_FILES[ad.brand];
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imgSrc && !imgFailed;
  const style = AD_BANNER_STYLES[ad.brand] ?? { bg: `${ad.color}cc`, text: "#fff", sub: "rgba(255,255,255,0.8)" };

  return (
    <div
      className={`rounded-2xl overflow-hidden border-2 cursor-pointer transition-all duration-200 shadow-lg hover:scale-[1.02] ${
        selected ? "border-white shadow-white/20" : "border-slate-700 hover:border-slate-500"
      }`}
      style={selected ? { borderColor: ad.color } : {}}
      onClick={onClick}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/70">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white/70 text-[10px] font-bold tracking-widest uppercase">Ad Display</span>
        </div>
        <span
          className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: `${ad.color}33`, color: ad.color, border: `1px solid ${ad.color}55` }}
        >
          {ad.category}
        </span>
      </div>

      {/* Creative */}
      {showImage ? (
        <img
          src={imgSrc}
          alt={ad.brand}
          className="w-full object-cover"
          style={{ height: "160px" }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="flex flex-col items-center justify-center text-center px-4 py-6"
          style={{ background: style.bg, height: "160px" }}
        >
          <div className="text-4xl mb-2">{ad.icon}</div>
          <div className="font-black text-xl leading-tight" style={{ color: style.text }}>{ad.brand}</div>
          <div className="text-xs italic mt-1" style={{ color: style.sub }}>"{ad.headline}"</div>
        </div>
      )}

      {/* Bottom */}
      <div className="px-3 py-2 bg-black/70 flex items-center justify-between gap-2">
        <div>
          <div className="text-white text-xs font-semibold">{ad.brand}</div>
          <div className="text-slate-400 text-[10px] italic truncate">"{ad.headline}"</div>
        </div>
        <span className="text-lg shrink-0">{ad.icon}</span>
      </div>
    </div>
  );
}

function AdFullPreview({ ad }) {
  const imgSrc = AD_IMAGE_FILES[ad.brand];
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imgSrc && !imgFailed;
  const style = AD_BANNER_STYLES[ad.brand] ?? { bg: `${ad.color}cc`, text: "#fff", sub: "rgba(255,255,255,0.8)" };

  return (
    <div className="flex flex-col gap-4">
      {/* Full size display */}
      <div className="rounded-2xl overflow-hidden border-2 shadow-2xl" style={{ borderColor: ad.color }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/80">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white/80 text-xs font-bold tracking-widest uppercase">Now On Air</span>
          </div>
          <span
            className="text-xs font-semibold px-3 py-0.5 rounded-full"
            style={{ background: ad.color, color: "#fff" }}
          >
            {ad.category}
          </span>
        </div>

        {/* Creative */}
        {showImage ? (
          <img
            src={imgSrc}
            alt={ad.brand}
            className="w-full object-cover"
            style={{ maxHeight: "320px" }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center text-center px-8 py-12"
            style={{ background: style.bg, minHeight: "240px" }}
          >
            <div className="text-7xl mb-4">{ad.icon}</div>
            <div className="font-black text-4xl leading-tight mb-2" style={{ color: style.text }}>{ad.brand}</div>
            <div className="text-lg italic" style={{ color: style.sub }}>"{ad.headline}"</div>
          </div>
        )}

        {/* Bottom */}
        <div className="px-4 py-3 bg-black/80 flex items-center justify-between">
          <div>
            <div className="text-white font-bold">{ad.brand}</div>
            <div className="text-slate-300 text-sm italic">"{ad.headline}"</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{ad.target}</div>
            <div className="text-slate-500">{ad.category}</div>
          </div>
        </div>
      </div>

      {/* Ad details */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-slate-500 text-xs mb-0.5">Brand</div>
          <div className="text-white font-semibold">{ad.brand}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">Category</div>
          <div style={{ color: ad.color }} className="font-semibold">{ad.category}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">Target Audience</div>
          <div className="text-white">{ad.target}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">Tagline</div>
          <div className="text-slate-300 italic">"{ad.headline}"</div>
        </div>
        <div className="col-span-2">
          <div className="text-slate-500 text-xs mb-0.5">Description</div>
          <div className="text-slate-300">{ad.description}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdDisplayScreen() {
  const demographicAds = Object.values(AD_LIBRARY);
  // Merge demographic + time slot ads, deduplicated
  const allAds = [...demographicAds, ...UNIQUE_TIME_ADS].filter(
    (ad, idx, arr) => arr.findIndex(a => a.brand === ad.brand) === idx
  );
  const [selectedBrand, setSelectedBrand] = useState(allAds[0].brand);
  const ads = allAds;
  const selectedAd = ads.find(a => a.brand === selectedBrand) ?? ads[0];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-xl font-bold">Ad Display Gallery</h2>
          <p className="text-slate-400 text-sm mt-0.5">Click any ad to preview the full display screen</p>
        </div>
        <div className="text-slate-500 text-sm">{ads.length} ads · {demographicAds.length} demographic · {UNIQUE_TIME_ADS.length} time-based</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left — grid of all ads */}
        <div className="xl:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ads.map((ad) => (
              <AdCard
                key={ad.brand}
                ad={ad}
                selected={selectedBrand === ad.brand}
                onClick={() => setSelectedBrand(ad.brand)}
              />
            ))}
          </div>
        </div>

        {/* Right — full preview of selected ad */}
        <div className="xl:col-span-1">
          <div className="sticky top-4">
            <div className="text-slate-400 text-xs uppercase tracking-widest mb-3">Full Preview</div>
            <AdFullPreview ad={selectedAd} />
          </div>
        </div>

      </div>
    </div>
  );
}
