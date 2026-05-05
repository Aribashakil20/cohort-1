/**
 * TabBar.jsx — Top navigation tabs
 *
 * Props:
 *   activeTab    — string: currently active tab id
 *   onTabChange  — function: called with new tab id
 *   alertCount   — number: unread alerts badge on the Alerts tab
 */

const TABS = [
  { id: "live",       label: "Live View",          icon: "📡" },
  { id: "analytics",  label: "Today's Analytics",  icon: "📈" },
  { id: "cameras",    label: "All Cameras",        icon: "🎥" },
  { id: "ads",        label: "Ad Performance",     icon: "🎯" },
  { id: "adgallery",  label: "Ad Gallery",         icon: "🖼️" },
  { id: "alerts",     label: "Alerts",             icon: "🔔" },
  { id: "settings",   label: "Settings",           icon: "⚙️" },
];

export default function TabBar({ activeTab, onTabChange, alertCount = 0 }) {
  return (
    <div className="flex gap-1 px-6 pt-3 bg-slate-950 border-b border-slate-700 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
            ${activeTab === tab.id
              ? "bg-slate-800 text-white border border-b-0 border-blue-600/60"
              : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            }`}
        >
          <span>{tab.icon}</span>
          {tab.label}
          {tab.id === "alerts" && alertCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
