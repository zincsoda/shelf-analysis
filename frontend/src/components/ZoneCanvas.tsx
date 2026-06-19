import { useCallback, useRef, useState, type MouseEvent } from 'react';
import type { CameraZone } from '@shelf-analysis/shared';

interface ZoneCanvasProps {
  previewUrl: string;
  zones: CameraZone[];
  onCreateZone: (zone: { name: string; x: number; y: number; width: number; height: number }) => Promise<void>;
  onDeleteZone: (zoneId: string) => Promise<void>;
}

interface DraftRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeRect(start: { x: number; y: number }, end: { x: number; y: number }): DraftRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

export default function ZoneCanvas({ previewUrl, zones, onCreateZone, onDeleteZone }: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getRelativePoint = useCallback((e: MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  function handleMouseDown(e: MouseEvent) {
    if (saving || !drawMode) return;
    const point = getRelativePoint(e);
    if (!point) return;
    setSelectedZoneId(null);
    setDrawing(true);
    setStartPoint(point);
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handleMouseMove(e: MouseEvent) {
    if (!drawing || !startPoint) return;
    const point = getRelativePoint(e);
    if (!point) return;
    setDraft(normalizeRect(startPoint, point));
  }

  async function handleMouseUp() {
    if (!drawing || !draft) {
      setDrawing(false);
      return;
    }

    setDrawing(false);
    setStartPoint(null);

    if (draft.width < 0.02 || draft.height < 0.02) {
      setDraft(null);
      return;
    }

    const name = window.prompt('Zone name');
    if (!name?.trim()) {
      setDraft(null);
      return;
    }

    setSaving(true);
    try {
      await onCreateZone({
        name: name.trim(),
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
      });
      setDraft(null);
      setDrawMode(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selectedZoneId) return;
    if (!confirm('Delete this zone?')) return;
    setSaving(true);
    try {
      await onDeleteZone(selectedZoneId);
      setSelectedZoneId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="zone-canvas-wrap">
      <div className="zone-canvas-toolbar">
        <span className="zone-canvas-hint">
          {saving
            ? 'Saving…'
            : drawMode
              ? 'Click and drag to draw a zone'
              : 'Select a zone or enter draw mode'}
        </span>
        <div className="btn-group">
          {selectedZoneId && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleDeleteSelected}
              disabled={saving}
            >
              Delete zone
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm ${drawMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setDrawMode((m) => !m);
              setDraft(null);
              setDrawing(false);
            }}
            disabled={saving}
          >
            {drawMode ? 'Done drawing' : 'Draw zone'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`zone-canvas${drawMode ? ' zone-canvas-drawing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={previewUrl}
          alt="Camera preview"
          className="zone-canvas-image"
          draggable={false}
        />
        <svg
          className={`zone-canvas-overlay${drawMode ? ' zone-canvas-overlay-drawing' : ''}`}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                className={`zone-rect${selectedZoneId === zone.id ? ' zone-rect-selected' : ''}`}
                onMouseDown={(e) => {
                  if (drawMode) return;
                  e.stopPropagation();
                  setSelectedZoneId(zone.id);
                }}
              />
              <text
                x={zone.x + 0.008}
                y={zone.y + 0.025}
                className="zone-label"
              >
                {zone.name}
              </text>
            </g>
          ))}
          {draft && (
            <rect
              x={draft.x}
              y={draft.y}
              width={draft.width}
              height={draft.height}
              className="zone-rect zone-rect-draft"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
