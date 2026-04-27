/**
 * api.js — All API calls to the FastAPI backend
 *
 * The backend runs at http://localhost:8000 (started by pipeline.py).
 * We use axios — a library that makes HTTP requests easier than
 * the built-in fetch(), with better error handling.
 *
 * All functions accept an optional `cameraId` parameter to filter results
 * to a specific camera (multi-camera support).
 */

import axios from "axios";

export const BASE    = "http://localhost:8000";
export const WS_BASE = "ws://localhost:8000";

const ax = axios.create({ baseURL: `${BASE}/api/v1` });

/** Check if the backend is alive */
export async function fetchHealth() {
  const res = await ax.get("/health");
  return res.data; // { status: "ok", database: "connected" }
}

/** Latest single analytics row — "right now" snapshot */
export async function fetchLive(cameraId) {
  const res = await ax.get("/analytics/live",
    cameraId ? { params: { camera_id: cameraId } } : {}
  );
  return res.data;
}

/**
 * Last N rows in time order — used for line charts.
 * Optional `date` (YYYY-MM-DD) filters to a specific calendar day.
 */
export async function fetchHistory(limit = 30, cameraId, date) {
  const params = { limit };
  if (cameraId) params.camera_id = cameraId;
  if (date)     params.date      = date;
  const res = await ax.get("/analytics/history", { params });
  return res.data;
}

/** Averages across last N rows — used for summary cards */
export async function fetchSummary(limit = 30, cameraId) {
  const params = { limit };
  if (cameraId) params.camera_id = cameraId;
  const res = await ax.get("/analytics/summary", { params });
  return res.data;
}

/** Recent dwell sessions — each row = one continuous audience visit */
export async function fetchDwell(limit = 20, cameraId) {
  const params = { limit };
  if (cameraId) params.camera_id = cameraId;
  const res = await ax.get("/analytics/dwell", { params });
  return res.data;
}

/** All distinct camera IDs that have data in the DB */
export async function fetchCameras() {
  const res = await ax.get("/cameras");
  return res.data; // string[]
}

/** Recent alert events (low engagement, etc.) */
export async function fetchAlerts(limit = 50, cameraId) {
  const params = { limit };
  if (cameraId) params.camera_id = cameraId;
  const res = await ax.get("/alerts", { params });
  return res.data;
}

/**
 * Returns the CSV export URL (not a fetch — opens as file download).
 * Usage: window.location.href = exportUrl(date, cameraId)
 */
export function exportUrl(date, cameraId) {
  const params = new URLSearchParams();
  if (date)     params.set("date",      date);
  if (cameraId) params.set("camera_id", cameraId);
  const qs = params.toString();
  return `${BASE}/api/v1/export${qs ? "?" + qs : ""}`;
}
