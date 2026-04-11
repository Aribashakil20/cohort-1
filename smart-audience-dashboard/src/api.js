/**
 * api.js — All API calls to the FastAPI backend
 *
 * The backend runs at http://localhost:8000 (started by pipeline.py).
 * These four functions match the four endpoints FastAPI exposes.
 * We use axios — a library that makes HTTP requests easier than
 * the built-in fetch(), with better error handling.
 */

import axios from "axios";

const BASE = "http://localhost:8000/api/v1";

/** Check if the backend is alive */
export async function fetchHealth() {
  const res = await axios.get(`${BASE}/health`);
  return res.data; // { status: "ok", database: "connected" }
}

/** Latest single analytics row — "right now" snapshot */
export async function fetchLive() {
  const res = await axios.get(`${BASE}/analytics/live`);
  return res.data;
}

/**
 * Last N rows in time order — used for line charts
 * Default 30 rows = last ~5 minutes at 10-second save interval
 */
export async function fetchHistory(limit = 30) {
  const res = await axios.get(`${BASE}/analytics/history?limit=${limit}`);
  return res.data;
}

/** Averages across last N rows — used for summary cards */
export async function fetchSummary(limit = 30) {
  const res = await axios.get(`${BASE}/analytics/summary?limit=${limit}`);
  return res.data;
}
