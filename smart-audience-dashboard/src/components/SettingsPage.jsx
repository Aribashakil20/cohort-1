/**
 * SettingsPage.jsx — "Settings" tab
 *
 * Editable:
 *   - Screen / location name (stored in localStorage)
 *   - Poll interval (live refresh rate)
 *
 * Read-only reference:
 *   - Backend URL, camera ID, gaze thresholds, DB backend
 *
 * Props:
 *   screenName      — string: current screen label
 *   onScreenName    — function(newName): save new name
 *   pollInterval    — number (ms)
 *   onPollInterval  — function(ms)
 *   cameraId        — string
 *   connected       — boolean
 */

import { useState } from "react";

function SettingRow({ label, children, hint }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-4 border-b border-slate-700 last:border-0">
      <div className="sm:w-48 shrink-0">
        <div className="text-slate-300 text-sm font-medium">{label}</div>
        {hint && <div className="text-slate-500 text-xs mt-0.5">{hint}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ReadOnly({ value }) {
  return (
    <span className="font-mono text-sm bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg inline-block">
      {value}
    </span>
  );
}

const POLL_OPTIONS = [
  { label: "2 seconds",  value: 2000  },
  { label: "5 seconds",  value: 5000  },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

export default function SettingsPage({ screenName, onScreenName, pollInterval, onPollInterval, cameraId, connected }) {
  const [nameInput, setNameInput] = useState(screenName);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onScreenName(nameInput.trim() || "Screen 1");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Editable settings ─────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="text-slate-300 text-sm font-semibold mb-1">Display Settings</div>
        <div className="text-slate-500 text-xs mb-4">Customize how this dashboard identifies itself</div>

        <SettingRow label="Screen / Location Name" hint="Shown in the header and reports">
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              maxLength={40}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Entrance Display"
            />
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </SettingRow>

        <SettingRow label="Live Refresh Rate" hint="How often the dashboard polls the backend">
          <div className="flex gap-2 flex-wrap">
            {POLL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onPollInterval(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pollInterval === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      {/* ── Read-only pipeline config ──────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="text-slate-300 text-sm font-semibold mb-1">Pipeline Configuration</div>
        <div className="text-slate-500 text-xs mb-4">
          These values are set in <code className="text-slate-400">pipeline.py</code>. Restart the pipeline to change them.
        </div>

        <SettingRow label="Backend URL">
          <ReadOnly value="http://localhost:8000" />
        </SettingRow>

        <SettingRow label="Camera ID">
          <ReadOnly value={cameraId || "cam_01"} />
        </SettingRow>

        <SettingRow label="Backend Status">
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "Connected" : "Offline"}
          </span>
        </SettingRow>

        <SettingRow label="Gaze Thresholds" hint="Yaw / Pitch angles (degrees)">
          <div className="flex gap-2">
            <ReadOnly value="Yaw ±30°" />
            <ReadOnly value="Pitch ±25°" />
          </div>
        </SettingRow>

        <SettingRow label="Inference Model">
          <ReadOnly value="InsightFace buffalo_l (ONNX)" />
        </SettingRow>

        <SettingRow label="Database">
          <ReadOnly value="SQLite (default) / PostgreSQL" />
        </SettingRow>
      </div>

      {/* ── Privacy note ──────────────────────────────────────────── */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
        <div className="text-slate-400 text-xs leading-relaxed">
          <span className="text-green-400 font-semibold">Privacy: </span>
          No video is saved. No individual is tracked. All data is anonymous aggregates (counts and percentages only).
          Face images are never stored. The system cannot identify who anyone is.
        </div>
      </div>

    </div>
  );
}
