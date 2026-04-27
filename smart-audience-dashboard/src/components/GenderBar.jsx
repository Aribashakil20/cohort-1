/**
 * GenderBar.jsx — A horizontal bar showing Male vs Female split
 *
 * Purpose:
 *   Visual breakdown of the audience gender. Blue = male, pink = female.
 *   The bar fills proportionally based on percentages from the API.
 *
 * Props:
 *   malePct   — number 0.0 to 1.0  (e.g. 0.6 = 60% male)
 *   femalePct — number 0.0 to 1.0  (e.g. 0.4 = 40% female)
 *   maleCount   — raw count
 *   femaleCount — raw count
 */

export default function GenderBar({ malePct = 0, femalePct = 0, maleCount = 0, femaleCount = 0, crowdGender = "mixed" }) {
  const maleW   = Math.round(malePct   * 100);
  const femaleW = Math.round(femalePct * 100);
  const isMixed = crowdGender === "mixed";

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="text-slate-400 text-sm font-medium">Gender Split</div>
        {isMixed ? (
          <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            Mixed crowd — neutral ad
          </span>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            crowdGender === "Male"
              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
              : "bg-pink-500/20 text-pink-300 border-pink-500/30"
          }`}>
            {crowdGender} majority
          </span>
        )}
      </div>

      {/* Stacked bar */}
      <div className="w-full h-6 rounded-full overflow-hidden flex bg-slate-700">
        <div
          className="bg-blue-500 h-full transition-all duration-700"
          style={{ width: `${maleW}%` }}
        />
        <div
          className="bg-pink-500 h-full transition-all duration-700"
          style={{ width: `${femaleW}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-slate-300">Male</span>
          <span className="text-white font-semibold">{maleCount} ({maleW}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300">Female</span>
          <span className="text-white font-semibold">{femaleCount} ({femaleW}%)</span>
          <span className="inline-block w-3 h-3 rounded-full bg-pink-500" />
        </div>
      </div>
    </div>
  );
}
