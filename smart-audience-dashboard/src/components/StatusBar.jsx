/**
 * StatusBar.jsx — Top bar: title, camera badge, demo toggle, connection status
 *
 * Props:
 *   connected  — boolean: is the backend reachable?
 *   lastUpdate — Date or null: when we last got fresh data
 *   cameraId   — string: which camera is active (e.g. "cam_01")
 *   demoMode   — boolean: is demo mode on?
 *   onToggleDemo — function: called when user clicks the demo button
 */

export default function StatusBar({ connected, lastUpdate, cameraId, demoMode, onToggleDemo }) {
  const timeStr = lastUpdate ? lastUpdate.toLocaleTimeString() : "—";

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-950 border-b border-slate-700 flex-wrap gap-2">

      {/* Left — title + camera badge */}
      <div className="flex items-center gap-3">
        <span className="text-white font-bold text-lg tracking-tight">
          Smart Audience Analysis
        </span>
        <span className="text-slate-500 text-sm hidden sm:inline">Live Dashboard</span>
        {cameraId && (
          <span className="bg-slate-700 text-slate-300 text-xs font-mono px-2 py-0.5 rounded">
            {cameraId}
          </span>
        )}
        {demoMode && (
          <span className="bg-yellow-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded animate-pulse">
            DEMO
          </span>
        )}
      </div>

      {/* Right — demo toggle + status */}
      <div className="flex items-center gap-4 text-sm flex-wrap">

        {/* Demo mode toggle button */}
        <button
          onClick={onToggleDemo}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            demoMode
              ? "border-yellow-500 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20"
              : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
          }`}
        >
          {demoMode ? "Exit Demo" : "Demo Mode"}
        </button>

        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              demoMode ? "bg-yellow-400" :
              connected ? "bg-green-400 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={
            demoMode   ? "text-yellow-400" :
            connected  ? "text-green-400"  : "text-red-400"
          }>
            {demoMode ? "Demo data" : connected ? "Backend connected" : "Backend offline"}
          </span>
        </div>

        <span className="text-slate-500 hidden sm:inline">Updated: {timeStr}</span>
      </div>
    </div>
  );
}
