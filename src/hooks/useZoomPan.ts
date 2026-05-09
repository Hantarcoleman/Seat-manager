import { useState, useRef, useCallback } from 'react';
import type { Point } from '../types';

export function useZoomPan() {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  // refs כדי לא לתפוס closure ישן
  const zoomRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  zoomRef.current = zoom;
  offsetRef.current = offset;

  const isPanRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const zoomToward = useCallback((screenX: number, screenY: number, factor: number) => {
    const z = zoomRef.current;
    const o = offsetRef.current;
    const newZoom = Math.max(0.15, Math.min(6, z * factor));
    const mx = (screenX - o.x) / z;
    const my = (screenY - o.y) / z;
    zoomRef.current = newZoom;
    setZoom(newZoom);
    const newOff = { x: screenX - mx * newZoom, y: screenY - my * newZoom };
    offsetRef.current = newOff;
    setOffset(newOff);
  }, []);

  const startPan = useCallback((screenX: number, screenY: number) => {
    isPanRef.current = true;
    panStartRef.current = { mx: screenX, my: screenY, ox: offsetRef.current.x, oy: offsetRef.current.y };
  }, []);

  const movePan = useCallback((screenX: number, screenY: number): boolean => {
    if (!isPanRef.current) return false;
    const newOff = {
      x: panStartRef.current.ox + screenX - panStartRef.current.mx,
      y: panStartRef.current.oy + screenY - panStartRef.current.my,
    };
    offsetRef.current = newOff;
    setOffset(newOff);
    return true;
  }, []);

  const endPan = useCallback((): boolean => {
    if (!isPanRef.current) return false;
    isPanRef.current = false;
    return true;
  }, []);

  // המרה ממיקום מסך → מיקום קנבס
  const toCanvas = useCallback((screenX: number, screenY: number): Point => ({
    x: (screenX - offsetRef.current.x) / zoomRef.current,
    y: (screenY - offsetRef.current.y) / zoomRef.current,
  }), []);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  }, []);

  return { zoom, offset, isPanRef, zoomToward, startPan, movePan, endPan, toCanvas, resetView };
}
