import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import type { WallType, FixedElementType, Point, Wall, FixedElement, Desk } from '../../types';
import { buildGenericClassroom } from '../../services/classroomTemplates';
import { tryEmbedDoor, tryEmbedSegment, projectOntoWall } from '../../services/wallGeometry';

const WALL_STYLES: Record<WallType, { color: string; width: number; dash?: number[]; label: string; emoji: string }> = {
  blank:        { color: '#1c1917', width: 6,                       label: 'קיר אטום',    emoji: '⬛' },
  window_lobby: { color: '#0284c7', width: 5, dash: [10, 6],        label: 'חלון ללובי',  emoji: '🪟' },
  window_yard:  { color: '#16a34a', width: 5, dash: [10, 6],        label: 'חלון לחצר',   emoji: '🌳' },
  small_window: { color: '#0ea5e9', width: 3, dash: [4, 4],         label: 'חלון קטן',    emoji: '🪟' },
  door:         { color: '#ea580c', width: 6,                        label: 'דלת',         emoji: '🚪' },
  board:        { color: '#7c3aed', width: 8,                        label: 'לוח',         emoji: '📋' },
};

type ShapeType = 'shape_rect' | 'shape_l';
type ToolMode = 'select' | WallType | FixedElementType | ShapeType;

interface Props {
  classroomId: string;
}

const snap = (v: number, gridOn: boolean) => (gridOn ? Math.round(v / 10) * 10 : v);

function snapToAxis(prev: Point, p: Point): Point {
  const dx = Math.abs(p.x - prev.x);
  const dy = Math.abs(p.y - prev.y);
  return dx > dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
}

function buildRectWalls(topLeft: Point, bottomRight: Point): Omit<Wall, 'id'>[] {
  const { x: x1, y: y1 } = topLeft;
  const { x: x2, y: y2 } = bottomRight;
  return [
    { type: 'blank', points: [{ x: x1, y: y1 }, { x: x2, y: y1 }] },
    { type: 'blank', points: [{ x: x2, y: y1 }, { x: x2, y: y2 }] },
    { type: 'blank', points: [{ x: x2, y: y2 }, { x: x1, y: y2 }] },
    { type: 'blank', points: [{ x: x1, y: y2 }, { x: x1, y: y1 }] },
  ];
}

function buildLRoomWalls(topLeft: Point, size: { w: number; h: number; notchW: number; notchH: number }): Omit<Wall, 'id'>[] {
  const { x, y } = topLeft;
  const { w, h, notchW, notchH } = size;
  const points: Point[] = [
    { x: x,              y: y },
    { x: x + w,          y: y },
    { x: x + w,          y: y + h - notchH },
    { x: x + w - notchW, y: y + h - notchH },
    { x: x + w - notchW, y: y + h },
    { x: x,              y: y + h },
  ];
  const walls: Omit<Wall, 'id'>[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    walls.push({ type: 'blank', points: [a, b] });
  }
  return walls;
}


// בדיקת חפיפה בין קיר לרצועת בחירה
function wallIntersectsRect(w: Wall, r: { x1: number; y1: number; x2: number; y2: number }): boolean {
  if (w.points.length === 0) return false;
  const xs = w.points.map((p) => p.x);
  const ys = w.points.map((p) => p.y);
  const wx1 = Math.min(...xs), wx2 = Math.max(...xs);
  const wy1 = Math.min(...ys), wy2 = Math.max(...ys);
  return !(wx2 < r.x1 || wx1 > r.x2 || wy2 < r.y1 || wy1 > r.y2);
}

export default function RoomEditor({ classroomId }: Props) {
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addWall = useClassroomStore((s) => s.addWall);
  const removeWall = useClassroomStore((s) => s.removeWall);
  const updateWall = useClassroomStore((s) => s.updateWall);
  const addFixedElement = useClassroomStore((s) => s.addFixedElement);
  const removeFixedElement = useClassroomStore((s) => s.removeFixedElement);
  const updateFixedElement = useClassroomStore((s) => s.updateFixedElement);
  const addDesk = useClassroomStore((s) => s.addDesk);
  const clearAll = useClassroomStore((s) => s.clearAll);
  const undo = useClassroomStore((s) => s.undo);
  const redo = useClassroomStore((s) => s.redo);
  const historyDepth = useClassroomStore((s) => (s.currentId ? s._history[s.currentId]?.length ?? 0 : 0));
  const futureDepth  = useClassroomStore((s) => (s.currentId ? s._future[s.currentId]?.length ?? 0 : 0));

  const [tool, setTool] = useState<ToolMode>('select');
  const [gridOn, setGridOn] = useState(true);
  const [straightOn, setStraightOn] = useState(true);
  const [showDesks, setShowDesks] = useState(true);

  // ציור קיר ידני
  const [drafting, setDrafting] = useState<Point[] | null>(null);
  const [draftingType, setDraftingType] = useState<WallType | null>(null);
  // ציור צורה (drag)
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

  // multi-select
  const [selectedWallIds, setSelectedWallIds] = useState<Set<string>>(new Set());
  const [selectedFixedIds, setSelectedFixedIds] = useState<Set<string>>(new Set());

  // rubber-band
  const [rubberStart, setRubberStart] = useState<Point | null>(null);
  const [rubberEnd, setRubberEnd] = useState<Point | null>(null);

  // תצוגה מקדימה של דלת בריחוף מעל קיר
  const [doorPreview, setDoorPreview] = useState<{ p1: Point; p2: Point } | null>(null);

  // מודאל כיתה גנרית
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [tplRows, setTplRows] = useState(4);
  const [tplCols, setTplCols] = useState(5);

  const stageRef = useRef<Konva.Stage>(null);

  const isSelectTool = tool === 'select';
  const isManualWallTool = tool === 'blank' || tool === 'board' || tool === 'window_lobby' || tool === 'window_yard' || tool === 'small_window';
  const isDoorTool = tool === 'door';
  const isShapeTool = tool === 'shape_rect' || tool === 'shape_l';
  const isFixedTool = tool === 'teacher_desk_single' || tool === 'teacher_desk_gamma';

  const totalSelected = selectedWallIds.size + selectedFixedIds.size;
  const clearSelection = () => { setSelectedWallIds(new Set()); setSelectedFixedIds(new Set()); };

  const finishDraft = () => {
    if (drafting && draftingType && drafting.length >= 2) {
      // לחלון/דלת מנסים להטמיע בקיר קיים אם הקטע צמוד אליו
      const isOpening = draftingType === 'window_lobby' || draftingType === 'window_yard'
                     || draftingType === 'small_window' || draftingType === 'door';
      if (isOpening && drafting.length === 2) {
        const embed = tryEmbedSegment(classroom?.walls ?? [], draftingType, drafting);
        if (embed) {
          removeWall(embed.removeWallId);
          embed.newWalls.forEach((w) => addWall(w));
        } else {
          addWall({ type: draftingType, points: drafting });
        }
      } else {
        addWall({ type: draftingType, points: drafting });
      }
    }
    setDrafting(null);
    setDraftingType(null);
  };

  const smartUndo = () => {
    if (drafting && drafting.length > 1) {
      setDrafting(drafting.slice(0, -1));
      return;
    }
    if (drafting && drafting.length <= 1) {
      setDrafting(null);
      setDraftingType(null);
      return;
    }
    undo();
  };

  const deleteSelected = () => {
    selectedWallIds.forEach((id) => removeWall(id));
    selectedFixedIds.forEach((id) => removeFixedElement(id));
    clearSelection();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); smartUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (totalSelected > 0) deleteSelected();
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (drafting) finishDraft();
        else { clearSelection(); setRubberStart(null); setRubberEnd(null); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafting, draftingType, undo, redo, totalSelected, selectedWallIds, selectedFixedIds]);

  const switchTool = (next: ToolMode) => {
    // לחיצה על סוג קיר (לא דלת) כשיש קיר נבחר — המר את הקיר במקום לפתוח כלי ציור
    // דלת תמיד מוצבת ידנית בתוך קיר קיים ולא ממירה קיר שלם
    if (isSelectTool && selectedWallIds.size === 1 && next !== 'door' && (Object.keys(WALL_STYLES) as string[]).includes(next as string)) {
      updateWall(Array.from(selectedWallIds)[0], { type: next as WallType });
      return;
    }
    if (drafting) finishDraft();
    setShapeStart(null);
    setDoorPreview(null);
    setRubberStart(null);
    setRubberEnd(null);
    setTool(next);
    if (next !== 'select') clearSelection();
  };

  const applyGenericTemplate = () => {
    if (!classroom) return;
    if (classroom.walls.length > 0 || classroom.desks.length > 0 || classroom.fixedElements.length > 0) {
      if (!confirm('יש כבר תוכן בכיתה — לדרוס ולהתחיל מתבנית?')) return;
      clearAll();
    }
    const tpl = buildGenericClassroom(tplRows, tplCols, classroom.width, classroom.height);
    tpl.walls.forEach((w) => addWall(w));
    tpl.fixedElements.forEach((el) => addFixedElement(el));
    tpl.desks.forEach((d) => addDesk(d.desk, d.seats));
    setShowTemplateDialog(false);
  };

  if (!classroom) return null;

  // ── טיפול בעכבר ──────────────────────────────────
  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const p: Point = { x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) };

    if (isShapeTool) {
      setShapeStart(p);
      return;
    }
    if (isSelectTool) {
      setRubberStart({ x: pos.x, y: pos.y });
      setRubberEnd({ x: pos.x, y: pos.y });
      if (!e.evt.shiftKey) clearSelection();
      return;
    }
  };

  const onStageMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;

    // צורות
    if (isShapeTool && shapeStart) {
      const stage = stageRef.current;
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          const p: Point = { x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) };
          const dx = Math.abs(p.x - shapeStart.x);
          const dy = Math.abs(p.y - shapeStart.y);
          let topLeft: Point, bottomRight: Point;
          if (dx < 20 || dy < 20) {
            const W = 800, H = 550;
            topLeft = { x: shapeStart.x - W / 2, y: shapeStart.y - H / 2 };
            bottomRight = { x: shapeStart.x + W / 2, y: shapeStart.y + H / 2 };
          } else {
            topLeft = { x: Math.min(shapeStart.x, p.x), y: Math.min(shapeStart.y, p.y) };
            bottomRight = { x: Math.max(shapeStart.x, p.x), y: Math.max(shapeStart.y, p.y) };
          }
          if (tool === 'shape_rect') {
            buildRectWalls(topLeft, bottomRight).forEach((w) => addWall(w));
          } else if (tool === 'shape_l') {
            const w = bottomRight.x - topLeft.x;
            const h = bottomRight.y - topLeft.y;
            buildLRoomWalls(topLeft, { w, h, notchW: Math.round(w * 0.28), notchH: Math.round(h * 0.28) })
              .forEach((wall) => addWall(wall));
          }
        }
      }
      setShapeStart(null);
      return;
    }

    // rubber band
    if (isSelectTool && rubberStart && rubberEnd) {
      const x1 = Math.min(rubberStart.x, rubberEnd.x);
      const y1 = Math.min(rubberStart.y, rubberEnd.y);
      const x2 = Math.max(rubberStart.x, rubberEnd.x);
      const y2 = Math.max(rubberStart.y, rubberEnd.y);
      if (x2 - x1 > 6 || y2 - y1 > 6) {
        const rect = { x1, y1, x2, y2 };
        const wallsIn = classroom.walls.filter((w) => wallIntersectsRect(w, rect));
        const fixedIn = classroom.fixedElements.filter((el) =>
          el.position.x >= x1 && el.position.x <= x2 && el.position.y >= y1 && el.position.y <= y2
        );
        const nextW = e.evt.shiftKey ? new Set(selectedWallIds) : new Set<string>();
        const nextF = e.evt.shiftKey ? new Set(selectedFixedIds) : new Set<string>();
        wallsIn.forEach((w) => nextW.add(w.id));
        fixedIn.forEach((el) => nextF.add(el.id));
        setSelectedWallIds(nextW);
        setSelectedFixedIds(nextF);
      }
      setRubberStart(null);
      setRubberEnd(null);
      return;
    }
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;
    if (isShapeTool || isSelectTool) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    let p: Point = { x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) };

    if (isDoorTool) {
      // אם לחצנו על קיר קיים — נטמיע את הדלת בתוכו (ניהפך אותו לדלת בקטע הזה)
      const embed = tryEmbedDoor(classroom.walls, p);
      if (embed) {
        removeWall(embed.removeWallId);
        embed.newWalls.forEach((w) => addWall(w));
      } else {
        addWall({ type: 'door', points: [{ x: p.x - 30, y: p.y }, { x: p.x + 30, y: p.y }] });
      }
      return;
    }

    if (isManualWallTool) {
      if (drafting && straightOn) {
        const prev = drafting[drafting.length - 1];
        p = snapToAxis(prev, p);
      }
      if (!drafting) {
        setDrafting([p]);
        setDraftingType(tool as WallType);
      } else {
        setDrafting([...drafting, p]);
      }
    } else if (isFixedTool) {
      const isGamma = tool === 'teacher_desk_gamma';
      addFixedElement({
        type: tool as FixedElementType,
        position: p, rotation: 0,
        width: isGamma ? 140 : 110, height: 60,
        gammaArmLength: isGamma ? 80 : undefined,
      });
    }
  };

  const onStageDblClick = () => { if (drafting) finishDraft(); };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    if (isSelectTool && rubberStart) {
      setRubberEnd({ x: pos.x, y: pos.y });
    } else {
      setMousePos({ x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) });
    }
    if (isDoorTool) {
      computeDoorPreview({ x: pos.x, y: pos.y });
    } else if (doorPreview) {
      setDoorPreview(null);
    }
  };

  const computeDoorPreview = (clickPoint: Point) => {
    const DOOR_LEN = 50;
    const TOLERANCE = 30;
    let bestWall: Wall | null = null;
    let bestProj: { distance: number; segIdx: number; t: number; point: Point } | null = null;
    for (const wall of classroom.walls) {
      if (wall.type === 'door') continue;
      const proj = projectOntoWall(clickPoint, wall);
      if (proj.distance > TOLERANCE) continue;
      if (!bestProj || proj.distance < bestProj.distance) {
        bestWall = wall; bestProj = proj;
      }
    }
    if (!bestWall || !bestProj) { setDoorPreview(null); return; }
    const segStart = bestWall.points[bestProj.segIdx];
    const segEnd = bestWall.points[bestProj.segIdx + 1];
    const segLen = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
    if (segLen < DOOR_LEN + 6) { setDoorPreview(null); return; }
    const half = (DOOR_LEN / 2) / segLen;
    let t1 = bestProj.t - half;
    let t2 = bestProj.t + half;
    if (t1 < 0) { t2 -= t1; t1 = 0; }
    if (t2 > 1) { t1 -= (t2 - 1); t2 = 1; }
    if (t1 < 0) t1 = 0;
    const lerp = (a: Point, b: Point, t: number): Point => ({
      x: Math.round(a.x + t * (b.x - a.x)),
      y: Math.round(a.y + t * (b.y - a.y)),
    });
    setDoorPreview({ p1: lerp(segStart, segEnd, t1), p2: lerp(segStart, segEnd, t2) });
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
    const style = WALL_STYLES[w.type];
    const isSelected = selectedWallIds.has(w.id);
    const flat: number[] = [];
    w.points.forEach((p) => { flat.push(p.x, p.y); });

    const clickHandlers = {
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        if (e.evt.shiftKey) {
          const next = new Set(selectedWallIds);
          if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
          setSelectedWallIds(next);
        } else {
          setSelectedWallIds(new Set([w.id]));
          setSelectedFixedIds(new Set());
        }
      },
      onTap: (e: Konva.KonvaEventObject<Event>) => {
        e.cancelBubble = true;
        setSelectedWallIds(new Set([w.id]));
        setSelectedFixedIds(new Set());
      },
    };

    const handles = isSelected && selectedWallIds.size === 1 ? w.points.map((p, i) => (
      <Circle
        key={`h${i}`}
        x={p.x} y={p.y} radius={6}
        fill="#fff" stroke="#ea580c" strokeWidth={2}
        draggable
        onDragMove={(e) => {
          const newPoints = w.points.map((pp, j) =>
            j === i ? { x: snap(e.target.x(), gridOn), y: snap(e.target.y(), gridOn) } : pp
          );
          updateWall(w.id, { points: newPoints });
        }}
      />
    )) : null;

    if (w.type === 'door') {
      // חריץ: קו לבן למחיקת הקיר + סימוני קצה + תווית "דלת"
      const p0 = w.points[0];
      const p1 = w.points[w.points.length - 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len, perpY = dx / len;
      const tickLen = 10;
      const isHoriz = Math.abs(dx) > Math.abs(dy);
      const labelX = isHoriz ? midX - 20 : (midX < classroom.width / 2 ? midX + 12 : midX - 52);
      const labelY = isHoriz ? (midY < classroom.height / 2 ? midY + 12 : midY - 24) : midY - 10;
      return (
        <Group key={w.id}>
          {/* חריץ לבן */}
          <Line points={flat} stroke="#ffffff" strokeWidth={style.width + 4} lineCap="butt" listening={false} />
          {/* סימוני קצה */}
          <Line points={[p0.x + perpX * tickLen, p0.y + perpY * tickLen, p0.x - perpX * tickLen, p0.y - perpY * tickLen]}
                stroke={style.color} strokeWidth={isSelected ? 4 : 2.5} lineCap="round" listening={false} />
          <Line points={[p1.x + perpX * tickLen, p1.y + perpY * tickLen, p1.x - perpX * tickLen, p1.y - perpY * tickLen]}
                stroke={style.color} strokeWidth={isSelected ? 4 : 2.5} lineCap="round" listening={false} />
          {/* תווית דלת */}
          <Text x={labelX} y={labelY} width={50} align="center"
                text="דלת" fontSize={13} fontFamily="Heebo" fill={style.color} fontStyle="bold" listening={false} />
          {/* אזור לחיצה בלתי נראה */}
          <Line points={flat} stroke="transparent" strokeWidth={1}
                hitStrokeWidth={Math.max(28, style.width + 20)} lineCap="round"
                {...clickHandlers} />
          {handles}
        </Group>
      );
    }

    return (
      <Group key={w.id}>
        {/* קו אחד עם hitStrokeWidth רחב לקליטת לחיצות בצורה אמינה */}
        <Line
          points={flat}
          stroke={style.color}
          strokeWidth={style.width + (isSelected ? 3 : 0)}
          hitStrokeWidth={Math.max(24, style.width + 18)}
          dash={style.dash}
          lineCap="round" lineJoin="round"
          {...clickHandlers}
        />
        {handles}
      </Group>
    );
  };

  const renderFixedElement = (el: FixedElement) => {
    const isSelected = selectedFixedIds.has(el.id);
    const isGamma = el.type === 'teacher_desk_gamma';
    return (
      <Group
        key={el.id}
        x={el.position.x}
        y={el.position.y}
        rotation={el.rotation}
        draggable
        onClick={(e) => {
          e.cancelBubble = true;
          if (e.evt.shiftKey) {
            const next = new Set(selectedFixedIds);
            if (next.has(el.id)) next.delete(el.id); else next.add(el.id);
            setSelectedFixedIds(next);
          } else {
            setSelectedFixedIds(new Set([el.id]));
            setSelectedWallIds(new Set());
          }
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          setSelectedFixedIds(new Set([el.id]));
          setSelectedWallIds(new Set());
        }}
        onDragEnd={(e) => {
          updateFixedElement(el.id, { position: { x: snap(e.target.x(), gridOn), y: snap(e.target.y(), gridOn) } });
        }}
      >
        <Rect x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height}
              fill="#fef3c7" stroke={isSelected ? '#ea580c' : '#92400e'}
              strokeWidth={isSelected ? 3 : 2} cornerRadius={4} />
        {isGamma && el.gammaArmLength && (
          <Rect x={-el.width / 2} y={el.height / 2} width={el.gammaArmLength} height={el.height * 0.7}
                fill="#fef3c7" stroke={isSelected ? '#ea580c' : '#92400e'}
                strokeWidth={isSelected ? 3 : 2} cornerRadius={4} />
        )}
        <Text x={-el.width / 2} y={-8} width={el.width} align="center"
              text={isGamma ? 'שולחן מורה Γ' : 'שולחן מורה'}
              fontSize={11} fontFamily="Heebo" fill="#92400e" fontStyle="bold" />
      </Group>
    );
  };

  const renderDeskReadOnly = (desk: Desk) => {
    const w = desk.seatCount === 2 ? 130 : 80;
    const h = 70;
    const seats = classroom.seats.filter((s) => s.deskId === desk.id);
    return (
      <Group key={desk.id} x={desk.position.x} y={desk.position.y}
             rotation={desk.rotation} listening={false} opacity={0.5}>
        <Rect x={-w / 2} y={-h / 2} width={w} height={h}
              fill="#e7e5e4" stroke="#a8a29e" strokeWidth={1.5} cornerRadius={6} />
        {seats.map((seat) => {
          const dx = seat.side === 'solo' ? 0 : (seat.side === 'left' ? -32 : 32);
          return <Circle key={seat.id} x={dx} y={0} radius={18}
                         fill="#fff" stroke="#16a34a" strokeWidth={2} />;
        })}
      </Group>
    );
  };

  const renderDraft = () => {
    if (!drafting || !draftingType) return null;
    const style = WALL_STYLES[draftingType];
    const lastPoint = drafting[drafting.length - 1];
    const cursor = straightOn ? snapToAxis(lastPoint, mousePos) : mousePos;
    return (
      <Group listening={false}>
        {drafting.length >= 2 && (() => {
          const fixedFlat: number[] = [];
          drafting.forEach((p) => { fixedFlat.push(p.x, p.y); });
          return <Line points={fixedFlat} stroke={style.color} strokeWidth={style.width} dash={style.dash} lineCap="round" lineJoin="round" />;
        })()}
        <Line points={[lastPoint.x, lastPoint.y, cursor.x, cursor.y]} stroke={style.color} strokeWidth={style.width}
              dash={style.dash ?? [4, 4]} opacity={0.5} lineCap="round" />
        {drafting.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={4} fill="#ea580c" />)}
      </Group>
    );
  };

  const renderShapePreview = () => {
    if (!isShapeTool || !shapeStart) return null;
    const x1 = Math.min(shapeStart.x, mousePos.x);
    const y1 = Math.min(shapeStart.y, mousePos.y);
    const x2 = Math.max(shapeStart.x, mousePos.x);
    const y2 = Math.max(shapeStart.y, mousePos.y);
    if (tool === 'shape_rect') {
      return <Rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} stroke="#ea580c" strokeWidth={3} dash={[8, 6]} listening={false} />;
    }
    if (tool === 'shape_l') {
      const w = x2 - x1, h = y2 - y1;
      const nW = Math.round(w * 0.28), nH = Math.round(h * 0.28);
      const pts = [
        x1, y1, x2, y1, x2, y1 + h - nH, x2 - nW, y1 + h - nH,
        x2 - nW, y2, x1, y2, x1, y1,
      ];
      return <Line points={pts} stroke="#ea580c" strokeWidth={3} dash={[8, 6]} closed={false} listening={false} />;
    }
    return null;
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

  // ── UI components ──
  const ToolButton = ({ id, label, emoji, color }: { id: ToolMode; label: string; emoji: string; color?: string }) => {
    const active = tool === id;
    return (
      <button onClick={() => switchTool(id)}
        style={{
          background: active ? (color ?? 'var(--ac)') : 'var(--bg2)',
          color: active ? '#fff' : 'var(--ink)',
          border: `1.5px solid ${active ? (color ?? 'var(--ac)') : 'var(--bd2)'}`,
          borderRadius: 'var(--rs)', padding: '8px 12px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }} title={label}>
        <span style={{ fontSize: 16 }}>{emoji}</span><span>{label}</span>
      </button>
    );
  };

  const ActionButton = ({ onClick, disabled, emoji, label, danger, active }: {
    onClick: () => void; disabled?: boolean; emoji: string; label: string; danger?: boolean; active?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: active ? 'var(--ac)' : 'var(--bg2)',
        color: active ? '#fff' : (disabled ? 'var(--ink3)' : (danger ? 'var(--rd)' : 'var(--ink)')),
        border: `1.5px solid ${active ? 'var(--ac)' : (disabled ? 'var(--bd)' : (danger ? '#fecaca' : 'var(--bd2)'))}`,
        borderRadius: 'var(--rs)', padding: '8px 12px', fontSize: 13, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
      }}>
      <span style={{ fontSize: 16 }}>{emoji}</span><span>{label}</span>
    </button>
  );

  const selectedWall = selectedWallIds.size === 1
    ? classroom.walls.find((w) => w.id === Array.from(selectedWallIds)[0])
    : null;

  return (
    <div>
      {/* ── שורה 1: צורות + בחירה ── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 12, marginBottom: 8, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <ToolButton id="select" label="בחירה" emoji="↖" />
        <div style={{ width: 1, height: 28, background: 'var(--bd2)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginLeft: 4 }}>צורת חדר:</span>
        <ToolButton id="shape_rect" label="מלבן" emoji="▭" />
        <ToolButton id="shape_l"    label="L (ז&apos;7)" emoji="⌐" />
        <button onClick={() => setShowTemplateDialog(true)}
          style={{
            background: 'var(--bg2)', color: 'var(--ink)',
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            padding: '8px 12px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <span style={{ fontSize: 16 }}>🏫</span><span>כיתה גנרית</span>
        </button>
        <div style={{ width: 1, height: 28, background: 'var(--bd2)' }} />
        <ToolButton id="teacher_desk_single" label="שולחן מורה" emoji="🪑" />
        <ToolButton id="teacher_desk_gamma"  label="שולחן מורה Γ" emoji="🪑" />
      </div>

      {/* ── שורה 2: כלי קיר ── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 12, marginBottom: 8, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginLeft: 4 }}>צייר קיר:</span>
        <ToolButton id="blank"        label={WALL_STYLES.blank.label}        emoji={WALL_STYLES.blank.emoji}        color={WALL_STYLES.blank.color} />
        <ToolButton id="board"        label={WALL_STYLES.board.label}        emoji={WALL_STYLES.board.emoji}        color={WALL_STYLES.board.color} />
        <ToolButton id="door"         label={WALL_STYLES.door.label}         emoji={WALL_STYLES.door.emoji}         color={WALL_STYLES.door.color} />
        <ToolButton id="window_lobby" label={WALL_STYLES.window_lobby.label} emoji={WALL_STYLES.window_lobby.emoji} color={WALL_STYLES.window_lobby.color} />
        <ToolButton id="window_yard"  label={WALL_STYLES.window_yard.label}  emoji={WALL_STYLES.window_yard.emoji}  color={WALL_STYLES.window_yard.color} />
        <ToolButton id="small_window" label={WALL_STYLES.small_window.label} emoji={WALL_STYLES.small_window.emoji} color={WALL_STYLES.small_window.color} />
      </div>

      {/* ── שורה 3: פעולות + הגדרות ── */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 10, marginBottom: 12, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <ActionButton onClick={smartUndo}
          disabled={historyDepth === 0 && !drafting}
          emoji="↶"
          label={drafting && drafting.length > 1 ? `ביטול נקודה (${drafting.length})` : `ביטול${historyDepth ? ` (${historyDepth})` : ''}`} />
        <ActionButton onClick={redo} disabled={futureDepth === 0}  emoji="↷" label={`הבא${futureDepth ? ` (${futureDepth})` : ''}`} />
        <ActionButton onClick={deleteSelected} disabled={totalSelected === 0}
          emoji="🗑" danger
          label={totalSelected > 1 ? `מחק ${totalSelected} נבחרים` : 'מחק נבחר'} />
        <ActionButton
          onClick={() => {
            if (classroom.walls.length === 0 && classroom.fixedElements.length === 0 && classroom.desks.length === 0) return;
            if (confirm('למחוק את כל הקירות, השולחנות והאלמנטים? אפשר לבטל ב-↶.')) {
              clearAll();
              clearSelection();
            }
          }}
          emoji="🧨" danger label="מחק הכל" />
        {drafting && <ActionButton onClick={finishDraft} emoji="✓" label="סיים קיר" />}
        <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {totalSelected > 1 && (
            <span style={{ fontSize: 13, color: 'var(--ac)', fontWeight: 700 }}>
              {totalSelected} נבחרו (Shift = הוסף)
            </span>
          )}
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={straightOn} onChange={(e) => setStraightOn(e.target.checked)} />
            קווים ישרים
          </label>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showDesks} onChange={(e) => setShowDesks(e.target.checked)} />
            הצג שולחנות
          </label>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={gridOn} onChange={(e) => setGridOn(e.target.checked)} />
            רשת snap
          </label>
        </div>
      </div>

      {/* ── עריכת קיר נבחר (יחיד) ── */}
      {selectedWall && (
        <div style={{
          background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 'var(--r)',
          padding: 12, marginBottom: 12, boxShadow: 'var(--sh)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9a3412', marginBottom: 8 }}>
            ✏ עריכת קיר נבחר ({WALL_STYLES[selectedWall.type].label})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink2)', alignSelf: 'center', marginLeft: 6 }}>המר ל:</span>
            {(Object.keys(WALL_STYLES) as WallType[]).map((wt) => (
              <button key={wt}
                onClick={() => updateWall(selectedWall.id, { type: wt })}
                disabled={selectedWall.type === wt}
                style={{
                  background: selectedWall.type === wt ? WALL_STYLES[wt].color : 'var(--bg2)',
                  color: selectedWall.type === wt ? '#fff' : 'var(--ink)',
                  border: `1.5px solid ${WALL_STYLES[wt].color}`,
                  borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 12, fontWeight: 700,
                  cursor: selectedWall.type === wt ? 'default' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                  opacity: selectedWall.type === wt ? 0.65 : 1,
                }}>
                <span>{WALL_STYLES[wt].emoji}</span><span>{WALL_STYLES[wt].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* הוראות */}
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
        {isSelectTool && '↖ לחץ על אלמנט לבחירה. גרור באזור ריק = ריבוע בחירה. Shift = הוסף לבחירה.'}
        {isShapeTool && (shapeStart ? '✏ שחרר כדי ליצור את הצורה.' : '✏ גרור על הקנבס ליצירת הצורה.')}
        {isManualWallTool && (drafting
          ? `✏ ${drafting.length} נקודות. סיום: Enter / Esc / לחיצה כפולה. ביטול = ביטול נקודה.`
          : '✏ לחץ נקודה ראשונה. לחיצות נוספות יוסיפו נקודות לאותו קיר.')}
        {isDoorTool && '🚪 הזזת עכבר מעל קיר מציגה תצוגה מקדימה של הדלת. לחיצה מציבה את הדלת.'}
        {isFixedTool && '🪑 לחץ על מיקום הצבת השולחן.'}
      </div>

      {/* Stage */}
      <div style={{
        background: 'var(--bg2)', border: '1.5px solid var(--bd)', borderRadius: 'var(--r)',
        overflow: 'hidden', boxShadow: 'var(--sh)', position: 'relative',
      }}>
        <Stage ref={stageRef}
          width={classroom.width} height={classroom.height}
          onMouseDown={onStageMouseDown} onMouseUp={onStageMouseUp}
          onClick={onStageClick} onTap={onStageClick}
          onDblClick={onStageDblClick}
          onMouseMove={onStageMouseMove}
          style={{ cursor: isSelectTool ? 'default' : 'crosshair', background: '#fff' }}>
          <Layer listening={false}>{renderGrid()}</Layer>
          <Layer>
            {showDesks && classroom.desks.map(renderDeskReadOnly)}
            {classroom.walls.map(renderWall)}
            {classroom.fixedElements.map(renderFixedElement)}
            {renderDraft()}
            {renderShapePreview()}
            {renderRubberBand()}
            {isDoorTool && doorPreview && (
              <Group listening={false}>
                <Line points={[doorPreview.p1.x, doorPreview.p1.y, doorPreview.p2.x, doorPreview.p2.y]}
                      stroke="#ffffff" strokeWidth={10} lineCap="butt" />
                <Line points={[doorPreview.p1.x, doorPreview.p1.y, doorPreview.p2.x, doorPreview.p2.y]}
                      stroke="#ea580c" strokeWidth={4} lineCap="butt" dash={[6, 4]} opacity={0.9} />
              </Group>
            )}
          </Layer>
        </Stage>
        <div style={{
          position: 'absolute', bottom: 6, left: 12, fontSize: 11, color: 'var(--ink3)',
          background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: 4,
        }}>
          {mousePos.x},{mousePos.y}
          {totalSelected > 0 && ` · ${totalSelected} נבחרו`}
          {drafting && ` · בציור: ${drafting.length} נק׳`}
        </div>
      </div>

      {/* ── מודאל כיתה גנרית ── */}
      {showTemplateDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowTemplateDialog(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: 'var(--r)', padding: 28,
            maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>🏫 כיתה גנרית</h2>
            <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 20px' }}>
              חדר מלבני עם לוח בתחתית, שולחן מורה ליד הלוח, וגריד שולחנות זוגיים.
            </p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>שורות (מלמעלה למטה)</div>
                <input type="number" min={1} max={10} value={tplRows}
                  onChange={(e) => setTplRows(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 16, fontWeight: 700,
                    border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                    fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
                  }} />
              </label>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>טורים (מימין לשמאל)</div>
                <input type="number" min={1} max={10} value={tplCols}
                  onChange={(e) => setTplCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 16, fontWeight: 700,
                    border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                    fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
                  }} />
              </label>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 16 }}>
              סך הכל: <strong style={{ color: 'var(--ac)' }}>{tplRows * tplCols}</strong> שולחנות
              ({tplRows * tplCols * 2} מקומות)
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTemplateDialog(false)}
                style={{
                  background: 'transparent', color: 'var(--ink2)',
                  border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                  padding: '10px 20px', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>ביטול</button>
              <button onClick={applyGenericTemplate}
                style={{
                  background: 'var(--ac)', color: '#fff', border: 'none',
                  borderRadius: 'var(--rs)', padding: '10px 22px', fontWeight: 800, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>צור כיתה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
