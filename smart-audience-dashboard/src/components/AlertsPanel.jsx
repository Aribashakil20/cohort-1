/**
 * AlertsPanel.jsx — "Alerts" tab showing the log of anomaly events
 *
 * What triggers an alert?
 *   When engagement_rate drops below the configured threshold (default 25%),
 *   the pipeline writes a row to the `alerts` table. This panel displays them.
 *
 * Props:
 *   alerts     — array of alert rows from /api/v1/alerts
 *   threshold  — number 0–1: the configured threshold (for display)
 */

// Severity color by engagement_rate
function severityColor(rate) {
  if (rate < 0.10) return { dot: "bg-red-500",    text: "text-red-400",    badge: "bg-red-500/10 border-red-500/30",    label: "Critical" };
  if (rate < 0.20) return { dot: "bg-orange-500", text: "text-orange-400", badge: "bg-orange-500/10 border-orange-500/30", label: "High" };
  return              { dot: "bg-yellow-500",   text: "text-yellow-400", badge: "bg-yellow-500/10 border-yellow-500/30", label: "Medium" };
}

function formatTime(isoStr) {
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoStr;
  }
}

function formatDate(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function AlertsPanel({ alerts, threshold = 0.25 }) {

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <div className="text-5xl mb-4">✅</div>
        <div className="text-sm font-medium text-slate-400">No alerts</div>
        <div className="text-xs mt-1">
          Alerts fire when engagement drops below {Math.round(threshold * 100)}%
        </div>
      </div>
    );
  }

  // Show newest first
  const sorted = [...alerts].reverse();

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Summary banner ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-slate-800 rounded-xl px-5 py-4 border border-slate-700">
        <div>
          <div className="text-white font-semibold">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} recorded</div>
          <div className="text-slate-500 text-xs mt-0.5">
            Threshold: engagement below {Math.round(threshold * 100)}% — configurable in <code className="text-slate-400">pipeline.py</code>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />Medium (&lt;25%)</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />High (&lt;20%)</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Critical (&lt;10%)</span>
        </div>
      </div>

      {/* ── Alert list ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {sorted.map((alert) => {
          const sev = severityColor(alert.engagement_rate);
          return (
            <div key={alert.id}
                 className={`flex items-start gap-4 rounded-xl px-5 py-4 border ${sev.badge}`}>
              {/* Dot */}
              <div className="mt-1 shrink-0">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${sev.dot}`} />
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${sev.text}`}>{sev.label}</span>
                  <span className="text-slate-400 text-sm">— {alert.message}</span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  <span>Engagement: <span className={`font-medium ${sev.text}`}>{Math.round(alert.engagement_rate * 100)}%</span></span>
                  <span>Viewers: <span className="text-slate-400">{alert.viewer_count}</span></span>
                  <span>Camera: <span className="font-mono text-slate-400">{alert.camera_id}</span></span>
                </div>
              </div>

              {/* Timestamp */}
              <div className="text-right text-xs text-slate-500 shrink-0">
                <div>{formatTime(alert.timestamp)}</div>
                <div className="text-slate-600">{formatDate(alert.timestamp)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
