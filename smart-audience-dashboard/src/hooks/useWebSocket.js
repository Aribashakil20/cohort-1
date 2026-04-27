/**
 * useWebSocket.js — Persistent WebSocket connection with auto-reconnect
 *
 * Why WebSocket over polling?
 *   Polling asks "any new data?" every N seconds — even when nothing changed.
 *   WebSocket is a persistent two-way connection: the server PUSHES data the
 *   moment it is ready. Result: zero lag, no wasted requests, instant updates.
 *
 * How this hook works:
 *   1. Connect to `url` on mount.
 *   2. On each message, parse JSON and set `data`.
 *   3. On close / error: reconnect after RECONNECT_DELAY ms.
 *   4. On unmount: cleanly close the socket and cancel any pending reconnect.
 *
 * Parameters:
 *   url — WebSocket URL, e.g. "ws://localhost:8000/ws/live"
 *          Pass null to disable (used in demo mode).
 *
 * Returns:
 *   { data, connected }
 *   data      — latest parsed JSON object from the server (null until first message)
 *   connected — boolean: true while the socket is open
 */

import { useState, useEffect, useRef } from "react";

const RECONNECT_DELAY = 3000; // ms between reconnect attempts

export function useWebSocket(url) {
  const [data,      setData]      = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef      = useRef(null);
  const timerRef   = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!url) {
      setConnected(false);
      return;
    }

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          setData(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        // Auto-reconnect after a short delay
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        // onerror is always followed by onclose — let onclose handle reconnect
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  return { data, connected };
}
