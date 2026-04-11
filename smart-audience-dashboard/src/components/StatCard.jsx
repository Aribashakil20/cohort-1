/**
 * StatCard.jsx — A single summary card (e.g. "Viewers: 4")
 *
 * Purpose:
 *   Reusable card component used in the top row of the dashboard.
 *   Each card shows one key metric with a label, value, and icon.
 *
 * Props:
 *   label     — string: what the number means (e.g. "Total Viewers")
 *   value     — string or number: the big number to display
 *   icon      — emoji or small string shown on the card
 *   highlight — optional color class for the value (e.g. "text-green-400")
 *   sub       — optional small line below the value (e.g. "avg last 5 min")
 */

export default function StatCard({ label, value, icon, highlight = "text-white", sub }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 flex flex-col gap-2 border border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm font-medium">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`text-3xl font-bold ${highlight}`}>{value ?? "—"}</div>
      {sub && <div className="text-slate-500 text-xs">{sub}</div>}
    </div>
  );
}
