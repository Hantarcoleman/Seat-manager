import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import type { WallType, FixedElementType, Point, Wall, FixedElement } from '../../types';

// ── הגדרות ויזואליות לפי סוג קיר ─────────────────────────
const WALL_STYLES: Record<WallType, { color: string; width: number; dash?: number[]; label: string; emoji: string }> = {
  blank:        { color: '#1c1917', width: 6,                       label: 'קיר אטום',    emoji: '⬛' },
  window_lobby: { color: '#0284c7', width: 5, dash: [10, 6],        label: 'חלון ללובי',  emoji: '🪟' },
  window_yard:  { color: '#16a34a', width: 5, dash: [10, 6],        label: 'חלון לחצר',   emoji: '🌳' },
  small_window: { color: '#0ea5e9', width: 3, dash: [4, 4],         label: 'חלון קטן',    emoji: '🪟' },
  door:         { color: '#ea580c', width: 6,                        label: 'דלת',         emoji: '🚪' },
  board:        { color: '#7c3aed', width: 8,                        label: 'לוח',         emoji: '📋' },
};

type ToolMode = 'select' | WallType | FixedElementType;

interface Props {
  classroomId: string;
}

const snap = (v: number, gridOn: boolean) => (gridOn ? Math.round(v / 10) * 10 : v);

// יישור לקו ישר אופקי/אנכי לפי הציר עם המרחק הקטן יותר מהנקודה הקודמת
function snapToAxis(prev: Point, p: Point): Point {
  const dx = Math.abs(p.x - prev.x);
  const dy = Math.abs(p.y - prev.y);
  return dx > dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
}

export default function RoomEditor({ classroomId }: Props) {
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addWall = useClassroomStore((s) => s.addWall);
  const removeWall = useClassroomStore((s) => s.removeWall);
  const updateWall = useClassroomStore((s) => s.updateWall);
  const addFixedElement = useClassroomStore((s) => s.addFixedElement);
  const removeFixedElement = useClassroomStore((s) => s.removeFixedElement);
  const updateFixedElement = useClassroomStore((s) => s.updateFixedElement);
  const undo = useClassroomStore((s) => s.undo);
  const redo = useClassroomStore((s) => s.redo);
  // נקרא בכל render כדי לרענן enabled state של הכפתורים
  const historyDepth = useClassroomStore((s) => (s.currentId ? s._history[s.currentId]?.length ?? 0 : 0));
  const futureDepth  = useClassroomStore((s) => (s.currentId ? s._future[s.currentId]?.length ?? 0 : 0));

  const [tool, setTool] = useState<ToolMode>('blank');
  const [gridOn, setGridOn] = useState(true);
  const [straightOn, setStraightOn] = useState(true);
  // נקודות מצטברות של הקיר שנמצא כרגע בציור — null = אין קיר בציור
  const [drafting, setDrafting] = useState<Point[] | null>(null);
  const [draftingType, setDraftingType] = useState<WallType | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [selected, setSelected] = useState<{ kind: 'wall' | 'fixed'; id: string } | null>(null);

  const stageRef = useRef<Konva.Stage>(null);

  const isWallTool = tool !== 'select' && tool in WALL_STYLES;
  const isFixedTool = tool === 'teacher_desk_single' || tool === 'teacher_desk_gamma';

  // סיום קיר מצטבר ושמירתו אם יש 2 נקודות לפחות
  const finishDraft = () => {
    if (drafting && draftingType && drafting.length >= 2) {
      addWall({ type: draftingType, points: drafting });
    }
    setDrafting(null);
    setDraftingType(null);
  };

  // מקלדת
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Z / Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          if (selected.kind === 'wall') removeWall(selected.id);
          else removeFixedElement(selected.id);
          setSelected(null);
        }
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (drafting) finishDraft();
        else setSelected(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, drafting, draftingType, undo, redo]);

  // החלפת כלי בזמן ציור = סיום הקיר הנוכחי
  const switchTool = (next: ToolMode) => {
    if (drafting) finishDraft();
    setTool(next);
    setSelected(null);
  };

  if (!classroom) return null;

  // ── טיפול בלחיצה על הקנבס ─────────────────────────
  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    let p: Point = { x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) };

    if (isWallTool) {
      // יישור לציר אם המצב פעיל ויש נקודה קודמת
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
        position: p,
        rotation: 0,
        width: isGamma ? 140 : 110,
        height: 60,
        gammaArmLength: isGamma ? 80 : undefined,
      });
    } else {
      setSelected(null);
    }
  };

  const onStageDblClick = () => {
    if (drafting) finishDraft();
  };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setMousePos({ x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) });
  };

  // ── רינדור רשת רקע ─────────────────────────────────
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
    const isSelected = selected?.kind === 'wall' && selected.id === w.id;
    const flat: number[] = [];
    w.points.forEach((p) => { flat.push(p.x, p.y); });
    return (
      <Group key={w.id}>
        <Line
          points={flat}
          stroke={style.color}
          strokeWidth={style.width + (isSelected ? 3 : 0)}
          dash={style.dash}
          lineCap="round"
          lineJoin="round"
          onClick={() => setSelected({ kind: 'wall', id: w.id })}
          onTap={() => setSelected({ kind: 'wall', id: w.id })}
        />
        {isSelected && w.points.map((p, i) => (
          <Circle
            key={`h${i}`}
            x={p.x}
            y={p.y}
            radius={6}
            fill="#fff"
            stroke="#ea580c"
            strokeWidth={2}
            draggable
            onDragMove={(e) => {
              const newPoints = w.points.map((pp, j) =>
                j === i ? { x: snap(e.target.x(), gridOn), y: snap(e.target.y(), gridOn) } : pp
              );
              updateWall(w.id, { points: newPoints });
            }}
          />
        ))}
      </Group>
    );
  };

  const renderFixedElement = (el: FixedElement) => {
    const isSelected = selected?.kind === 'fixed' && selected.id === el.id;
    const isGamma = el.type === 'teacher_desk_gamma';
    return (
      <Group
        key={el.id}
        x={el.position.x}
        y={el.position.y}
        rotation={el.rotation}
        draggable
        onClick={() => setSelected({ kind: 'fixed', id: el.id })}
        onTap={() => setSelected({ kind: 'fixed', id: el.id })}
        onDragEnd={(e) => {
          updateFixedElement(el.id, {
            position: { x: snap(e.target.x(), gridOn), y: snap(e.target.y(), gridOn) },
          });
        }}
      >
        <Rect
          x={-el.width / 2}
          y={-el.height / 2}
          width={el.width}
          height={el.height}
          fill="#fef3c7"
          stroke={isSelected ? '#ea580c' : '#92400e'}
          strokeWidth={isSelected ? 3 : 2}
          cornerRadius={4}
        />
        {isGamma && el.gammaArmLength && (
          <Rect
            x={-el.width / 2}
            y={el.height / 2}
            width={el.gammaArmLength}
            height={el.height * 0.7}
            fill="#fef3c7"
            stroke={isSelected ? '#ea580c' : '#92400e'}
            strokeWidth={isSelected ? 3 : 2}
            cornerRadius={4}
          />
        )}
        <Text
          x={-el.width / 2}
          y={-8}
          width={el.width}
          align="center"
          text={isGamma ? 'שולחן מורה Γ' : 'שולחן מורה'}
          fontSize={11}
          fontFamily="Heebo"
          fill="#92400e"
          fontStyle="bold"
        />
      </Group>
    );
  };

  // ── רינדור הקיר שבציור (preview) ──────────────────
  const renderDraft = () => {
    if (!drafting || !draftingType) return null;
    const style = WALL_STYLES[draftingType];
    // נקודה אחרונה -> מיקום העכבר (עם snap לציר אם פעיל)
    const lastPoint = drafting[drafting.length - 1];
    const cursor = straightOn ? snapToAxis(lastPoint, mousePos) : mousePos;
    const flat: number[] = [];
    drafting.forEach((p) => { flat.push(p.x, p.y); });
    flat.push(cursor.x, cursor.y);
    return (
      <Group listening={false}>
        {/* קווים שכבר נקבעו — מלאים */}
        {drafting.length >= 2 && (() => {
          const fixedFlat: number[] = [];
          drafting.forEach((p) => { fixedFlat.push(p.x, p.y); });
          return (
            <Line
              points={fixedFlat}
              stroke={style.color}
              strokeWidth={style.width}
              dash={style.dash}
              lineCap="round"
              lineJoin="round"
            />
          );
        })()}
        {/* הקטע המתעדכן עם העכבר — שקוף */}
        <Line
          points={[lastPoint.x, lastPoint.y, cursor.x, cursor.y]}
          stroke={style.color}
          strokeWidth={style.width}
          dash={style.dash ?? [4, 4]}
          opacity={0.5}
          lineCap="round"
        />
        {/* נקודות שכבר נקבעו */}
        {drafting.map((p, i) => (
          <Circle key={i} x={p.x} y={p.y} radius={4} fill="#ea580c" />
        ))}
      </Group>
    );
  };

  // ── ToolButton ─────────────────────────────────────
  const ToolButton = ({ id, label, emoji, color }: { id: ToolMode; label: string; emoji: string; color?: string }) => {
    const active = tool === id;
    return (
      <button
        onClick={() => switchTool(id)}
        style={{
          background: active ? (color ?? 'var(--ac)') : 'var(--bg2)',
          color: active ? '#fff' : 'var(--ink)',
          border: `1.5px solid ${active ? (color ?? 'var(--ac)') : 'var(--bd2)'}`,
          borderRadius: 'var(--rs)',
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span>{label}</span>
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
        borderRadius: 'var(--rs)',
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      title={label}
    >
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div>
      {/* Toolbar — שורה 1: כלים */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r)',
        padding: 12,
        marginBottom: 8,
        boxShadow: 'var(--sh)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        <ToolButton id="select" label="בחירה" emoji="↖" />
        <div style={{ width: 1, height: 28, background: 'var(--bd2)' }} />
        <ToolButton id="blank"        label={WALL_STYLES.blank.label}        emoji={WALL_STYLES.blank.emoji}        color={WALL_STYLES.blank.color} />
        <ToolButton id="board"        label={WALL_STYLES.board.label}        emoji={WALL_STYLES.board.emoji}        color={WALL_STYLES.board.color} />
        <ToolButton id="door"         label={WALL_STYLES.door.label}         emoji={WALL_STYLES.door.emoji}         color={WALL_STYLES.door.color} />
        <ToolButton id="window_lobby" label={WALL_STYLES.window_lobby.label} emoji={WALL_STYLES.window_lobby.emoji} color={WALL_STYLES.window_lobby.color} />
        <ToolButton id="window_yard"  label={WALL_STYLES.window_yard.label}  emoji={WALL_STYLES.window_yard.emoji}  color={WALL_STYLES.window_yard.color} />
        <ToolButton id="small_window" label={WALL_STYLES.small_window.label} emoji={WALL_STYLES.small_window.emoji} color={WALL_STYLES.small_window.color} />
        <div style={{ width: 1, height: 28, background: 'var(--bd2)' }} />
        <ToolButton id="teacher_desk_single" label="שולחן מורה" emoji="🪑" />
        <ToolButton id="teacher_desk_gamma"  label="שולחן מורה Γ" emoji="🪑" />
      </div>

      {/* Toolbar — שורה 2: פעולות + הגדרות */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r)',
        padding: 10,
        marginBottom: 12,
        boxShadow: 'var(--sh)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        <ActionButton onClick={undo} disabled={historyDepth === 0} emoji="↶" label={`ביטול${historyDepth ? ` (${historyDepth})` : ''}`} />
        <ActionButton onClick={redo} disabled={futureDepth === 0}  emoji="↷" label={`הבא${futureDepth ? ` (${futureDepth})` : ''}`} />
        <ActionButton
          onClick={() => {
            if (!selected) return;
            if (selected.kind === 'wall') removeWall(selected.id);
            else removeFixedElement(selected.id);
            setSelected(null);
          }}
          disabled={!selected}
          emoji="🗑"
          label="מחק נבחר"
          danger
        />
        {drafting && (
          <ActionButton onClick={finishDraft} emoji="✓" label="סיים קיר" />
        )}
        <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={straightOn} onChange={(e) => setStraightOn(e.target.checked)} />
            קווים ישרים
          </label>
          <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={gridOn} onChange={(e) => setGridOn(e.target.checked)} />
            רשת snap
          </label>
        </div>
      </div>

      {/* הוראות שימוש */}
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
        {tool === 'select' && '💡 לחץ על אלמנט לבחירה. גרור נקודות כתומות לעריכה.'}
        {isWallTool && (drafting
          ? `✏ לחץ להוסיף נקודות לקיר. ${drafting.length} נקודות. סיום: Enter / Esc / לחיצה כפולה / החלפת כלי.`
          : '✏ לחץ נקודה ראשונה כדי להתחיל קיר. לחיצות נוספות יוסיפו נקודות.')}
        {isFixedTool && '🪑 לחץ על מיקום הצבת השולחן.'}
      </div>

      {/* Stage */}
      <div style={{
        background: 'var(--bg2)',
        border: '1.5px solid var(--bd)',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
        boxShadow: 'var(--sh)',
        position: 'relative',
      }}>
        <Stage
          ref={stageRef}
          width={classroom.width}
          height={classroom.height}
          onClick={onStageClick}
          onTap={onStageClick}
          onDblClick={onStageDblClick}
          onMouseMove={onStageMouseMove}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair', background: '#fff' }}
        >
          <Layer listening={false}>
            {renderGrid()}
          </Layer>

          <Layer>
            {classroom.walls.map(renderWall)}
            {classroom.fixedElements.map(renderFixedElement)}
            {renderDraft()}
          </Layer>
        </Stage>

        <div style={{
          position: 'absolute',
          bottom: 6,
          left: 12,
          fontSize: 11,
          color: 'var(--ink3)',
          background: 'rgba(255,255,255,.85)',
          padding: '2px 8px',
          borderRadius: 4,
        }}>
          {mousePos.x},{mousePos.y}
          {selected && ` · נבחר: ${selected.kind === 'wall' ? 'קיר' : 'אלמנט'}`}
          {drafting && ` · בציור: ${drafting.length} נק׳`}
        </div>
      </div>
    </div>
  );
}
