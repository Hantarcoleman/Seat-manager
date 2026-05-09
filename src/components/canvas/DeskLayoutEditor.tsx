import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import type { Wall, FixedElement, Point, Desk, Seat, ZoneTag } from '../../types';
import { computeAllAutoZones } from '../../services/zoneCalculator';
import { useZoomPan } from '../../hooks/useZoomPan';
import DeskGridControls from './DeskGridControls';

const WALL_STYLES: Record<string, { color: string; width: number; dash?: number[] }> = {
  blank:        { color: '#1c1917', width: 6 },
  window_lobby: { color: '#0284c7', width: 5, dash: [10, 6] },
  window_yard:  { color: '#16a34a', width: 5, dash: [10, 6] },
  small_window: { color: '#0ea5e9', width: 3, dash: [4, 4] },
  door:         { color: '#ea580c', width: 6 },
  board:        { color: '#7c3aed', width: 8 },
};

const ZONE_LABELS: Record<ZoneTag, { label: string; color: string }> = {
  front_row:   { label: 'קדמי ביותר', color: '#7c3aed' },
  second_row:  { label: 'שורה 2', color: '#9333ea' },
  back_row:    { label: 'אחורי', color: '#1e40af' },
  side_column: { label: 'צד', color: '#92400e' },
  center:      { label: 'מרכז', color: '#475569' },
  near_window: { label: 'חלון', color: '#0284c7' },
  near_door:   { label: 'דלת', color: '#ea580c' },
  near_wall:   { label: 'קיר', color: '#525252' },
};

type TemplateType = 'select' | 'single' | 'pair' | 'row' | 'column' | 'grid' | 'cluster' | 'het' | 'u';

interface Props {
  classroomId: string;
}

const snap = (v: number, gridOn: boolean) => (gridOn ? Math.round(v / 10) * 10 : v);

interface TemplateConfig {
  count: number;     // לטור/שורה
  hGap: number;      // מרווח אופקי
  vGap: number;      // מרווח אנכי
  rows: number;      // לגריד
  cols: number;      // לגריד
}

interface TemplateOutput {
  desk: Omit<Desk, 'id'>;
  seats: Omit<Seat, 'id' | 'deskId'>[];
}

function buildTemplate(type: TemplateType, center: Point, cfg: TemplateConfig): TemplateOutput[] {
  const result: TemplateOutput[] = [];

  const pairAt = (x: number, y: number, rotation = 0): TemplateOutput => ({
    desk: { position: { x: Math.round(x), y: Math.round(y) }, rotation, seatCount: 2 },
    seats: [
      { side: 'left',  autoZones: [] },
      { side: 'right', autoZones: [] },
    ],
  });
  const singleAt = (x: number, y: number, rotation = 0): TemplateOutput => ({
    desk: { position: { x: Math.round(x), y: Math.round(y) }, rotation, seatCount: 1 },
    seats: [{ side: 'solo', autoZones: [] }],
  });

  switch (type) {
    case 'single':
      result.push(singleAt(center.x, center.y));
      break;

    case 'pair':
      result.push(pairAt(center.x, center.y));
      break;

    // שורה (אופקית, מימין לשמאל)
    case 'row': {
      const n = cfg.count;
      const total = (n - 1) * cfg.hGap;
      for (let i = 0; i < n; i++) {
        const x = center.x - total / 2 + i * cfg.hGap;
        result.push(pairAt(x, center.y));
      }
      break;
    }

    // טור (אנכי, מלמעלה למטה) — שולחנות מסובבים 90° כך שהמושבים פונים החוצה
    case 'column': {
      const n = cfg.count;
      const total = (n - 1) * cfg.vGap;
      for (let i = 0; i < n; i++) {
        const y = center.y - total / 2 + i * cfg.vGap;
        result.push(pairAt(center.x, y, 90));
      }
      break;
    }

    // גריד מלא: rows × cols
    case 'grid': {
      const totalW = (cfg.cols - 1) * cfg.hGap;
      const totalH = (cfg.rows - 1) * cfg.vGap;
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          const x = center.x - totalW / 2 + c * cfg.hGap;
          const y = center.y - totalH / 2 + r * cfg.vGap;
          result.push(pairAt(x, y));
        }
      }
      break;
    }

    case 'cluster': {
      const offX = cfg.hGap / 2;
      const offY = cfg.vGap / 2;
      result.push(pairAt(center.x - offX, center.y - offY));
      result.push(pairAt(center.x + offX, center.y - offY));
      result.push(pairAt(center.x - offX, center.y + offY));
      result.push(pairAt(center.x + offX, center.y + offY));
      break;
    }

    case 'het': {
      // שתי עמודות (ימין/שמאל, 3 כל אחת) + שורה תחתונה (3 זוגיים)
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x + 2 * cfg.hGap, center.y - cfg.vGap + i * cfg.vGap, 90));
        result.push(pairAt(center.x - 2 * cfg.hGap, center.y - cfg.vGap + i * cfg.vGap, 90));
      }
      for (let i = -1; i <= 1; i++) {
        result.push(pairAt(center.x + i * cfg.hGap, center.y + 2 * cfg.vGap));
      }
      break;
    }

    case 'u': {
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x + 2 * cfg.hGap, center.y - cfg.vGap + i * cfg.vGap, 90));
        result.push(pairAt(center.x - 2 * cfg.hGap, center.y - cfg.vGap + i * cfg.vGap, 90));
      }
      for (let i = -1; i <= 1; i++) {
        result.push(pairAt(center.x + i * cfg.hGap, center.y - 2 * cfg.vGap));
      }
      break;
    }
  }

  if (result.length > 1) {
    const groupId = Math.random().toString(36).slice(2, 8);
    result.forEach((r) => { r.desk.layoutGroup = groupId; });
  }
  return result;
}

const TEMPLATE_INFO: Record<TemplateType, { label: string; emoji: string; desc: string }> = {
  select:  { label: 'בחירה', emoji: '↖', desc: 'בחר ומחק שולחנות' },
  single:  { label: 'יחיד',  emoji: '🪑', desc: 'שולחן עם מקום אחד' },
  pair:    { label: 'זוגי',  emoji: '👥', desc: 'שולחן עם 2 מקומות' },
  row:     { label: 'שורה',  emoji: '➡',  desc: 'שורת שולחנות אופקית (מימין לשמאל)' },
  column:  { label: 'טור',   emoji: '⬇',  desc: 'טור שולחנות אנכי (מלמעלה למטה)' },
  grid:    { label: 'גריד',  emoji: '⊞',  desc: 'גריד מלא: שורות × טורים' },
  cluster: { label: 'גוש',   emoji: '◫',  desc: '4 זוגיים בריבוע' },
  het:     { label: 'ח',     emoji: 'ח',  desc: 'צורת ח (3 צדדים)' },
  u:       { label: 'U',     emoji: 'U',  desc: 'צורת U (3 צדדים)' },
};

const NEEDS_COUNT = (t: TemplateType) => t === 'row' || t === 'column';
const NEEDS_GRID = (t: TemplateType) => t === 'grid';
const NEEDS_GAP = (t: TemplateType) => t === 'row' || t === 'column' || t === 'grid' || t === 'cluster' || t === 'het' || t === 'u';

export default function DeskLayoutEditor({ classroomId }: Props) {
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addDesk = useClassroomStore((s) => s.addDesk);
  const updateDesk = useClassroomStore((s) => s.updateDesk);
  const removeDesk = useClassroomStore((s) => s.removeDesk);
  const updateSeat = useClassroomStore((s) => s.updateSeat);
  const clearAll = useClassroomStore((s) => s.clearAll);
  const undo = useClassroomStore((s) => s.undo);
  const redo = useClassroomStore((s) => s.redo);
  const historyDepth = useClassroomStore((s) => (s.currentId ? s._history[s.currentId]?.length ?? 0 : 0));
  const futureDepth  = useClassroomStore((s) => (s.currentId ? s._future[s.currentId]?.length ?? 0 : 0));

  const [template, setTemplate] = useState<TemplateType>('select');
  const [cfg, setCfg] = useState<TemplateConfig>({ count: 5, hGap: 160, vGap: 110, rows: 4, cols: 5 });
  const [gridOn, setGridOn] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  // multi-select של שולחנות
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // rubber-band selection
  const [rubberStart, setRubberStart] = useState<Point | null>(null);
  const [rubberEnd, setRubberEnd] = useState<Point | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ vLines: number[]; hLines: number[] }>({ vLines: [], hLines: [] });

  const { zoom, offset, isPanRef, zoomToward, startPan, movePan, endPan, toCanvas, resetView } = useZoomPan();

  // multi-select drag
  const dragStartRef = useRef<{
    deskId: string; startX: number; startY: number;
    others: { id: string; startX: number; startY: number }[];
  } | null>(null);

  const stageRef = useRef<Konva.Stage>(null);

  const isSelectMode = template === 'select';

  // חישוב אזורים אוטומטיים
  useEffect(() => {
    if (!classroom) return;
    const map = computeAllAutoZones(classroom);
    classroom.seats.forEach((seat) => {
      const newZones = map.get(seat.id) ?? [];
      const same = newZones.length === seat.autoZones.length &&
                   newZones.every((z, i) => seat.autoZones[i] === z);
      if (!same) updateSeat(seat.id, { autoZones: newZones });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom?.desks.length, classroom?.walls.length, classroom?.fixedElements.length]);

  // מקלדת
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          selectedIds.forEach((id) => removeDesk(id));
          setSelectedIds(new Set());
        }
      }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setRubberStart(null); setRubberEnd(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, undo, redo, removeDesk]);

  if (!classroom) return null;

  // ── עכבר ──────────────────────────────────────────
  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // middle mouse — pan
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition()!;
      startPan(pos.x, pos.y);
      return;
    }
    if (e.target !== stageRef.current) return;
    if (!isSelectMode) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const p = toCanvas(pos.x, pos.y); // canvas coords
    setRubberStart(p);
    setRubberEnd(p);
    if (!e.evt.shiftKey) setSelectedIds(new Set());
  };

  const onStageMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (endPan()) return;
    if (e.target !== stageRef.current) return;
    if (!isSelectMode || !rubberStart || !rubberEnd) {
      setRubberStart(null); setRubberEnd(null);
      return;
    }
    const x1 = Math.min(rubberStart.x, rubberEnd.x);
    const y1 = Math.min(rubberStart.y, rubberEnd.y);
    const x2 = Math.max(rubberStart.x, rubberEnd.x);
    const y2 = Math.max(rubberStart.y, rubberEnd.y);
    if (x2 - x1 > 6 || y2 - y1 > 6) {
      const inside = classroom.desks.filter((d) =>
        d.position.x >= x1 && d.position.x <= x2 && d.position.y >= y1 && d.position.y <= y2
      );
      const next = e.evt.shiftKey ? new Set(selectedIds) : new Set<string>();
      inside.forEach((d) => next.add(d.id));
      setSelectedIds(next);
    }
    setRubberStart(null); setRubberEnd(null);
  };

  const DESK_MARGIN = 95;

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanRef.current) return;
    if (e.target !== stageRef.current) return;
    if (isSelectMode) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const cp = toCanvas(pos.x, pos.y);
    const center = { x: snap(cp.x, gridOn), y: snap(cp.y, gridOn) };
    const items = buildTemplate(template, center, cfg);
    items.forEach((item) => {
      const clamped = {
        ...item.desk,
        position: {
          x: Math.max(DESK_MARGIN, Math.min(classroom.width - DESK_MARGIN, item.desk.position.x)),
          y: Math.max(DESK_MARGIN, Math.min(classroom.height - DESK_MARGIN, item.desk.position.y)),
        },
      };
      addDesk(clamped, item.seats);
    });
  };

  const onStageMouseMove = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    if (movePan(pos.x, pos.y)) return;
    const cp = toCanvas(pos.x, pos.y);
    if (isSelectMode && rubberStart) {
      setRubberEnd(cp);
    } else {
      setMousePos({ x: snap(cp.x, gridOn), y: snap(cp.y, gridOn) });
    }
  };

  // ── רינדור ─────────────────────────────────────────
  const renderGrid = () => {
    if (!gridOn) return null;
    const lines: React.ReactElement[] = [];
    const step = 50;
    for (let x = 0; x <= classroom.width; x += step) {
      lines.push(<Line key={`gx${x}`} points={[x, 0, x, classroom.height]} stroke="#f3f4f6" strokeWidth={1} listening={false} />);
    }
    for (let y = 0; y <= classroom.height; y += step) {
      lines.push(<Line key={`gy${y}`} points={[0, y, classroom.width, y]} stroke="#f3f4f6" strokeWidth={1} listening={false} />);
    }
    return <>{lines}</>;
  };

  const renderWall = (w: Wall) => {
    const style = WALL_STYLES[w.type] ?? WALL_STYLES.blank;
    const flat: number[] = [];
    w.points.forEach((p) => { flat.push(p.x, p.y); });
    return (
      <Line key={w.id} points={flat} stroke={style.color} strokeWidth={style.width}
            dash={style.dash} lineCap="round" lineJoin="round" listening={false} />
    );
  };

  const renderTeacherDesk = (el: FixedElement) => {
    const isGamma = el.type === 'teacher_desk_gamma';
    return (
      <Group key={el.id} x={el.position.x} y={el.position.y} rotation={el.rotation} listening={false}>
        <Rect x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height}
              fill="#fef3c7" stroke="#92400e" strokeWidth={2} cornerRadius={4} />
        {isGamma && el.gammaArmLength && (
          <Rect x={-el.width / 2} y={el.height / 2} width={el.gammaArmLength} height={el.height * 0.7}
                fill="#fef3c7" stroke="#92400e" strokeWidth={2} cornerRadius={4} />
        )}
        <Text x={-el.width / 2} y={-8} width={el.width} align="center"
              text="מורה" fontSize={11} fontFamily="Heebo" fill="#92400e" fontStyle="bold" />
      </Group>
    );
  };

  const renderDesk = (desk: Desk) => {
    const seats = classroom.seats.filter((s) => s.deskId === desk.id);
    const isSelected = selectedIds.has(desk.id);
    const w = desk.seatCount === 2 ? 130 : 80;
    const h = 70;
    const zones = seats[0]?.autoZones ?? [];

    const clampDesk = (x: number, y: number, seatCount: number) => {
      const hw = (seatCount === 2 ? 130 : 80) / 2;
      return {
        x: Math.max(hw, Math.min(classroom.width - hw, snap(x, gridOn))),
        y: Math.max(35, Math.min(classroom.height - 35, snap(y, gridOn))),
      };
    };

    return (
      <Group
        key={desk.id}
        id={`desk-${desk.id}`}
        x={desk.position.x}
        y={desk.position.y}
        rotation={desk.rotation}
        draggable={isSelected || !isSelectMode}
        onClick={(e) => {
          e.cancelBubble = true;
          if (e.evt.shiftKey) {
            const next = new Set(selectedIds);
            if (next.has(desk.id)) next.delete(desk.id); else next.add(desk.id);
            setSelectedIds(next);
          } else {
            setSelectedIds(new Set([desk.id]));
          }
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          setSelectedIds(new Set([desk.id]));
        }}
        onDragStart={(e) => {
          if (selectedIds.size > 1 && isSelected) {
            dragStartRef.current = {
              deskId: desk.id,
              startX: e.target.x(),
              startY: e.target.y(),
              others: classroom.desks
                .filter((d) => d.id !== desk.id && selectedIds.has(d.id))
                .map((d) => ({ id: d.id, startX: d.position.x, startY: d.position.y })),
            };
          } else {
            dragStartRef.current = null;
          }
        }}
        onDragMove={(e) => {
          let cx = e.target.x();
          let cy = e.target.y();
          const vLines: number[] = [];
          const hLines: number[] = [];
          // snap alignment — מדלג על כל הנבחרים
          classroom.desks.forEach((other) => {
            if (other.id === desk.id || selectedIds.has(other.id)) return;
            if (Math.abs(other.position.x - cx) <= SNAP_THRESHOLD) { cx = other.position.x; vLines.push(other.position.x); }
            if (Math.abs(other.position.y - cy) <= SNAP_THRESHOLD) { cy = other.position.y; hLines.push(other.position.y); }
          });
          if (cx !== e.target.x() || cy !== e.target.y()) { e.target.x(cx); e.target.y(cy); }
          setSnapGuides({ vLines, hLines });
          // גרירת מרובה
          const info = dragStartRef.current;
          if (info && info.deskId === desk.id) {
            const dx = cx - info.startX;
            const dy = cy - info.startY;
            info.others.forEach(({ id, startX, startY }) => {
              const node = stageRef.current?.findOne<Konva.Group>(`#desk-${id}`);
              if (node) { node.x(startX + dx); node.y(startY + dy); }
            });
          }
        }}
        onDragEnd={(e) => {
          setSnapGuides({ vLines: [], hLines: [] });
          const pos = clampDesk(e.target.x(), e.target.y(), desk.seatCount);
          e.target.x(pos.x); e.target.y(pos.y);
          updateDesk(desk.id, { position: pos });
          // עדכן את כל הנבחרים האחרים
          const info = dragStartRef.current;
          if (info && info.deskId === desk.id) {
            const dx = pos.x - info.startX;
            const dy = pos.y - info.startY;
            info.others.forEach(({ id, startX, startY }) => {
              const otherDesk = classroom.desks.find((d) => d.id === id);
              if (!otherDesk) return;
              const oPos = clampDesk(startX + dx, startY + dy, otherDesk.seatCount);
              const node = stageRef.current?.findOne<Konva.Group>(`#desk-${id}`);
              if (node) { node.x(oPos.x); node.y(oPos.y); }
              updateDesk(id, { position: oPos });
            });
            dragStartRef.current = null;
          }
        }}
      >
        <Rect
          x={-w / 2} y={-h / 2} width={w} height={h}
          fill="#e7e5e4"
          stroke={isSelected ? '#ea580c' : '#78716c'}
          strokeWidth={isSelected ? 4 : 1.5}
          cornerRadius={6}
        />
        {seats.map((seat) => {
          const dx = seat.side === 'solo' ? 0 : (seat.side === 'left' ? -32 : 32);
          return (
            <Circle key={seat.id} x={dx} y={0} radius={18}
                    fill="#fff" stroke="#16a34a" strokeWidth={2.5} />
          );
        })}
        {showZones && zones.length > 0 && (
          <Text
            x={-w / 2} y={h / 2 + 4} width={w} align="center"
            text={zones.map((z) => ZONE_LABELS[z]?.label ?? z).join(' · ')}
            fontSize={9} fontFamily="Heebo"
            fill={ZONE_LABELS[zones[0]]?.color ?? '#a8a29e'} fontStyle="bold"
          />
        )}
      </Group>
    );
  };

  const renderPreview = () => {
    if (isSelectMode) return null;
    const items = buildTemplate(template, mousePos, cfg);
    return (
      <Group listening={false} opacity={0.4}>
        {items.map((item, i) => {
          const w = item.desk.seatCount === 2 ? 130 : 80;
          const h = 70;
          return (
            <Group key={i} x={item.desk.position.x} y={item.desk.position.y} rotation={item.desk.rotation}>
              <Rect x={-w / 2} y={-h / 2} width={w} height={h}
                    fill="#fef3c7" stroke="#ea580c" strokeWidth={2} cornerRadius={6} dash={[4, 4]} />
            </Group>
          );
        })}
      </Group>
    );
  };

  const SNAP_THRESHOLD = 12;

  const renderSnapGuides = () => {
    if (snapGuides.vLines.length === 0 && snapGuides.hLines.length === 0) return null;
    return (
      <>
        {snapGuides.vLines.map((x, i) => (
          <Line key={`sv${i}`} points={[x, 0, x, classroom.height]}
                stroke="#ea580c" strokeWidth={1.5} dash={[8, 5]} listening={false} opacity={0.7} />
        ))}
        {snapGuides.hLines.map((y, i) => (
          <Line key={`sh${i}`} points={[0, y, classroom.width, y]}
                stroke="#ea580c" strokeWidth={1.5} dash={[8, 5]} listening={false} opacity={0.7} />
        ))}
      </>
    );
  };

  const renderRubberBand = () => {
    if (!rubberStart || !rubberEnd) return null;
    const x = Math.min(rubberStart.x, rubberEnd.x);
    const y = Math.min(rubberStart.y, rubberEnd.y);
    const w = Math.abs(rubberEnd.x - rubberStart.x);
    const h = Math.abs(rubberEnd.y - rubberStart.y);
    return (
      <Rect x={x} y={y} width={w} height={h}
            fill="rgba(234, 88, 12, 0.1)" stroke="#ea580c" strokeWidth={1.5} dash={[5, 4]} listening={false} />
    );
  };

  // ── UI ─────────────────────────────────────────────
  const TemplateButton = ({ type }: { type: TemplateType }) => {
    const info = TEMPLATE_INFO[type];
    const active = template === type;
    return (
      <button
        onClick={() => { setTemplate(type); setSelectedIds(new Set()); }}
        title={info.desc}
        style={{
          background: active ? 'var(--ac)' : 'var(--bg2)',
          color: active ? '#fff' : 'var(--ink)',
          border: `1.5px solid ${active ? 'var(--ac)' : 'var(--bd2)'}`,
          borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          minWidth: 70,
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>{info.emoji}</span>
        <span>{info.label}</span>
      </button>
    );
  };

  const ActionButton = ({ onClick, disabled, emoji, label, danger }: {
    onClick: () => void; disabled?: boolean; emoji: string; label: string; danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'var(--bg2)',
        color: disabled ? 'var(--ink3)' : (danger ? 'var(--rd)' : 'var(--ink)'),
        border: `1.5px solid ${disabled ? 'var(--bd)' : (danger ? '#fecaca' : 'var(--bd2)')}`,
        borderRadius: 'var(--rs)', padding: '8px 12px', fontSize: 13, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <span style={{ fontSize: 16 }}>{emoji}</span><span>{label}</span>
    </button>
  );

  // אינפוט מספרי עם +/- ועריכה חופשית
  const NumberInput = ({ label, value, onChange, min, max, step = 10 }: {
    label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
  }) => {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    const commit = () => {
      const n = parseInt(text, 10);
      if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
      else setText(String(value));
    };
    const btnStyle = {
      width: 26, height: 30, padding: 0, fontSize: 16, fontWeight: 800,
      background: 'var(--bg2)', color: 'var(--ink2)',
      border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
      cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
    } as const;
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--ink2)' }}>
        <span style={{ fontWeight: 700, marginLeft: 4 }}>{label}:</span>
        <button type="button" style={btnStyle} title={`-${step}`}
          onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <input
          type="text" inputMode="numeric" value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
          style={{
            width: 50, padding: '5px 6px', fontSize: 14, fontWeight: 700,
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
          }}
        />
        <button type="button" style={btnStyle} title={`+${step}`}
          onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </label>
    );
  };

  const exportImage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    // שמור zoom/offset זמנית, אפס, ייצא, שחזר
    const prevScale = stage.scaleX();
    const prevX = stage.x();
    const prevY = stage.y();
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    stage.scale({ x: prevScale, y: prevScale });
    stage.position({ x: prevX, y: prevY });
    const link = document.createElement('a');
    link.download = `${classroom.name}-שולחנות.png`;
    link.href = dataURL;
    link.click();
  };

  return (
    <div>
      {/* ── תבניות ── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 12, marginBottom: 8, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <TemplateButton type="select" />
        <div style={{ width: 1, height: 36, background: 'var(--bd2)' }} />
        <TemplateButton type="single" />
        <TemplateButton type="pair" />
        <TemplateButton type="row" />
        <TemplateButton type="column" />
        <TemplateButton type="grid" />
        <TemplateButton type="cluster" />
        <TemplateButton type="het" />
        <TemplateButton type="u" />
      </div>

      {/* ── הגדרות תבנית ── */}
      {!isSelectMode && (NEEDS_COUNT(template) || NEEDS_GRID(template) || NEEDS_GAP(template)) && (
        <div style={{
          background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 'var(--r)',
          padding: 10, marginBottom: 8,
          display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#9a3412' }}>הגדרות תבנית:</span>
          {NEEDS_COUNT(template) && (
            <NumberInput label="כמות" value={cfg.count} min={2} max={20} step={1}
                         onChange={(v) => setCfg({ ...cfg, count: v })} />
          )}
          {NEEDS_GRID(template) && (
            <>
              <NumberInput label="שורות" value={cfg.rows} min={1} max={12} step={1}
                           onChange={(v) => setCfg({ ...cfg, rows: v })} />
              <NumberInput label="טורים" value={cfg.cols} min={1} max={12} step={1}
                           onChange={(v) => setCfg({ ...cfg, cols: v })} />
            </>
          )}
          {NEEDS_GAP(template) && (template === 'row' || template === 'grid' || template === 'cluster' || template === 'het' || template === 'u') && (
            <NumberInput label="מרווח אופקי" value={cfg.hGap} min={80} max={300} step={10}
                         onChange={(v) => setCfg({ ...cfg, hGap: v })} />
          )}
          {NEEDS_GAP(template) && (template === 'column' || template === 'grid' || template === 'cluster' || template === 'het' || template === 'u') && (
            <NumberInput label="מרווח אנכי" value={cfg.vGap} min={80} max={300} step={10}
                         onChange={(v) => setCfg({ ...cfg, vGap: v })} />
          )}
        </div>
      )}

      {/* ── פעולות ── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 10, marginBottom: 12, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <ActionButton onClick={undo} disabled={historyDepth === 0} emoji="↶" label={`ביטול${historyDepth ? ` (${historyDepth})` : ''}`} />
        <ActionButton onClick={redo} disabled={futureDepth === 0}  emoji="↷" label={`הבא${futureDepth ? ` (${futureDepth})` : ''}`} />
        <ActionButton
          onClick={() => {
            if (selectedIds.size === 0) return;
            selectedIds.forEach((id) => removeDesk(id));
            setSelectedIds(new Set());
          }}
          disabled={selectedIds.size === 0}
          emoji="🗑"
          label={selectedIds.size > 1 ? `מחק ${selectedIds.size} שולחנות` : 'מחק שולחן'}
          danger
        />
        <ActionButton
          onClick={() => {
            if (classroom.desks.length === 0 && classroom.walls.length === 0) return;
            if (confirm('למחוק את כל השולחנות, הקירות והאלמנטים בכיתה? פעולה זו לא ניתנת לביטול בלחיצה אחת (אבל אפשר לבטל ב-↶).')) {
              clearAll();
              setSelectedIds(new Set());
            }
          }}
          emoji="🧨"
          label="מחק הכל"
          danger
        />
        <ActionButton onClick={exportImage} emoji="💾" label="ייצא PNG" />
        <div style={{ width: 1, height: 24, background: 'var(--bd2)' }} />
        {/* פקדי זום */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => zoomToward(classroom.width / 2, classroom.height / 2, 1 / 1.2)}
            style={{ width: 28, height: 28, fontSize: 16, fontWeight: 800, border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)', background: 'var(--bg2)', cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomToward(classroom.width / 2, classroom.height / 2, 1.2)}
            style={{ width: 28, height: 28, fontSize: 16, fontWeight: 800, border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)', background: 'var(--bg2)', cursor: 'pointer' }}>+</button>
          <button onClick={resetView}
            style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--ink2)' }}>איפוס</button>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
            <strong>{classroom.desks.length}</strong> שולחנות · <strong>{classroom.seats.length}</strong> מושבים
            {selectedIds.size > 0 && <span style={{ color: 'var(--ac)', fontWeight: 700 }}> · {selectedIds.size} נבחרו</span>}
          </span>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
            תוויות אזורים
          </label>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={gridOn} onChange={(e) => setGridOn(e.target.checked)} />
            רשת snap
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
        {isSelectMode
          ? '💡 לחץ לבחירה (Shift = הוסף). גרור על ריק = ריבוע בחירה. גרור שולחן נבחר להזזה (מרובה). Delete = מחק. גלגלת = זום, לחצן אמצעי = הזזת תצוגה.'
          : '💡 לחץ על הקנבס להצבת התבנית. לאחר ההצבה — גרור להזזה. גלגלת = זום, לחצן אמצעי = הזזת תצוגה.'}
      </div>

      <DeskGridControls classroomId={classroomId}>
        <div style={{
          background: 'var(--bg2)', border: '1.5px solid var(--bd)', borderRadius: 'var(--r)',
          overflow: 'hidden', boxShadow: 'var(--sh)', position: 'relative',
        }}>
          <Stage
            ref={stageRef}
            width={classroom.width}
            height={classroom.height}
            scaleX={zoom} scaleY={zoom}
            x={offset.x} y={offset.y}
            onWheel={(e) => { e.evt.preventDefault(); const pos = stageRef.current?.getPointerPosition(); if (pos) zoomToward(pos.x, pos.y, e.evt.deltaY < 0 ? 1.12 : 1 / 1.12); }}
            onMouseDown={onStageMouseDown}
            onMouseUp={onStageMouseUp}
            onClick={onStageClick}
            onTap={onStageClick}
            onMouseMove={onStageMouseMove}
            style={{ cursor: isPanRef.current ? 'grab' : (isSelectMode ? 'default' : 'crosshair'), background: '#fff' }}
          >
            <Layer listening={false}>{renderGrid()}</Layer>
            <Layer>
              {classroom.walls.map(renderWall)}
              {classroom.fixedElements.map(renderTeacherDesk)}
              {classroom.desks.map(renderDesk)}
              {renderSnapGuides()}
              {renderPreview()}
              {renderRubberBand()}
            </Layer>
          </Stage>

          <div style={{
            position: 'absolute', bottom: 6, left: 12, fontSize: 11, color: 'var(--ink3)',
            background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: 4,
          }}>
            {mousePos.x},{mousePos.y}
            {selectedIds.size > 0 && ` · ${selectedIds.size} נבחרו`}
          </div>
        </div>
      </DeskGridControls>
    </div>
  );
}
