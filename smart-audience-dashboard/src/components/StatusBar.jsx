/**
 * StatusBar.jsx — Top bar showing connection status and last-updated time
 *
 * Purpose:
 *   Tells the user at a glance whether the backend (pipeline.py) is running
 *   and when data was last received. A green dot = connected, red = down.
 *
 * Props:
 *   connected  — boolean: is the /health endpoint returning "ok"?
 *   lastUpdate — Date object or null: when we last got fresh data
 */

export default function StatusBar({ connected, lastUpdate }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString()
    : "—";

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700">
      {/* Left — project title */}
      <div className="flex items-center gap-3">
        <span className="text-white font-semibold text-lg tracking-tight">
          Smart Audience Analysis
        </span>
        <span className="text-slate-500 text-sm">Live Dashboard</span>
      </div>

      {/* Right — status indicator + time */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          {/* Pulsing dot — green when connected, red when not */}
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connected ? "bg-green-400 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            {connected ? "Backend connected" : "Backend offline"}
          </span>
        </div>
        <span className="text-slate-500">Last update: {timeStr}</span>
      </div>
    </div>
  );
}
