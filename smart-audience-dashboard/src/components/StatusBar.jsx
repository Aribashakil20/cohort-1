/**
 * StatusBar.jsx — Top bar: title, camera badge, demo toggle, connection status
 *
 * Props:
 *   connected      — boolean: is the backend reachable?
 *   wsConnected    — boolean: WebSocket real-time connection status
 *   lastUpdate     — Date or null: when we last got fresh data
 *   cameraId       — string: currently active camera id
 *   cameras        — string[]: list of available camera ids (for switcher)
 *   onCameraChange — function(id): called when user picks a different camera
 *   screenName     — string: user-defined location label
 *   demoMode       — boolean: is demo mode on?
 *   onToggleDemo   — function: called when user clicks the demo button
 */

export default function StatusBar({
  connected, wsConnected, lastUpdate,
  cameraId, cameras = [], onCameraChange,
  screenName, demoMode, onToggleDemo,
}) {
  const timeStr = lastUpdate ? lastUpdate.toLocaleTimeString() : "—";

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-950 border-b border-slate-700 flex-wrap gap-2">

      {/* Left — title + screen name + camera switcher */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-white font-bold text-lg tracking-tight">
          Smart Audience Analysis
        </span>
        {screenName && (
          <span className="text-slate-400 text-sm hidden sm:inline">{screenName}</span>
        )}

        {/* Camera switcher — dropdown when multiple cameras, badge when single */}
        {cameras.length > 1 ? (
          <select
            value={cameraId || ""}
            onChange={(e) => onCameraChange(e.target.value || null)}
            className="bg-slate-700 text-slate-300 text-xs font-mono px-2 py-0.5 rounded border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">All cameras</option>
            {cameras.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : cameraId ? (
          <span className="bg-slate-700 text-slate-300 text-xs font-mono px-2 py-0.5 rounded">
            {cameraId}
          </span>
        ) : null}

        {demoMode && (
          <span className="bg-yellow-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded animate-pulse">
            DEMO
          </span>
        )}
      </div>

      {/* Right — demo toggle + WS indicator + connection status */}
      <div className="flex items-center gap-4 text-sm flex-wrap">

        {/* Demo mode toggle */}
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

        {/* WebSocket real-time indicator */}
        {!demoMode && (
          <div className="flex items-center gap-1.5 text-xs" title={wsConnected ? "Real-time WebSocket active" : "Polling mode"}>
            <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? "bg-blue-400 animate-pulse" : "bg-slate-600"}`} />
            <span className={wsConnected ? "text-blue-400" : "text-slate-600"}>
              {wsConnected ? "Live" : "Poll"}
            </span>
          </div>
        )}

        {/* Backend connection indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              demoMode  ? "bg-yellow-400" :
              connected ? "bg-green-400 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={
            demoMode  ? "text-yellow-400" :
            connected ? "text-green-400"  : "text-red-400"
          }>
            {demoMode ? "Demo data" : connected ? "Connected" : "Offline"}
          </span>
        </div>

        <span className="text-slate-500 hidden sm:inline">Updated: {timeStr}</span>
      </div>
    </div>
  );
}
