import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import type { Wall, FixedElement, Point, Desk, Seat, ZoneTag } from '../../types';
import { computeAllAutoZones } from '../../services/zoneCalculator';

const WALL_STYLES: Record<string, { color: string; width: number; dash?: number[] }> = {
  blank:        { color: '#1c1917', width: 6 },
  window_lobby: { color: '#0284c7', width: 5, dash: [10, 6] },
  window_yard:  { color: '#16a34a', width: 5, dash: [10, 6] },
  small_window: { color: '#0ea5e9', width: 3, dash: [4, 4] },
  door:         { color: '#ea580c', width: 6 },
  board:        { color: '#7c3aed', width: 8 },
};

const ZONE_LABELS: Record<ZoneTag, { label: string; color: string }> = {
  front_row:   { label: 'קדמי', color: '#7c3aed' },
  back_row:    { label: 'אחורי', color: '#1e40af' },
  side_column: { label: 'צד', color: '#92400e' },
  center:      { label: 'מרכז', color: '#475569' },
  near_window: { label: 'חלון', color: '#0284c7' },
  near_door:   { label: 'דלת', color: '#ea580c' },
  near_wall:   { label: 'קיר', color: '#525252' },
};

type TemplateType = 'single' | 'pair' | 'row5' | 'cluster' | 'het' | 'u';

interface Props {
  classroomId: string;
}

const snap = (v: number, gridOn: boolean) => (gridOn ? Math.round(v / 10) * 10 : v);

// יצירת תבנית שולחנות במיקום נתון. מחזיר רשימת desks + seats יחסית למרכז.
interface TemplateOutput {
  desk: Omit<Desk, 'id'>;
  seats: Omit<Seat, 'id' | 'deskId'>[];
}

function buildTemplate(type: TemplateType, center: Point): TemplateOutput[] {
  const result: TemplateOutput[] = [];
  const PAIR_GAP_X = 90; // מרווח בין שולחנות בטור
  const PAIR_GAP_Y = 90; // מרווח בין שורות

  const pairAt = (x: number, y: number, rotation = 0): TemplateOutput => ({
    desk: { position: { x, y }, rotation, seatCount: 2 },
    seats: [
      { side: 'left',  autoZones: [] },
      { side: 'right', autoZones: [] },
    ],
  });

  const singleAt = (x: number, y: number, rotation = 0): TemplateOutput => ({
    desk: { position: { x, y }, rotation, seatCount: 1 },
    seats: [{ side: 'solo', autoZones: [] }],
  });

  switch (type) {
    case 'single':
      result.push(singleAt(center.x, center.y));
      break;

    case 'pair':
      result.push(pairAt(center.x, center.y));
      break;

    case 'row5':
      // 5 שולחנות זוגיים בשורה אופקית
      for (let i = 0; i < 5; i++) {
        const x = center.x - 2 * PAIR_GAP_X + i * PAIR_GAP_X;
        result.push(pairAt(x, center.y));
      }
      break;

    case 'cluster': {
      // 2x2 cluster של זוגיים (8 מושבים, 4 שולחנות)
      const offX = PAIR_GAP_X / 2;
      const offY = PAIR_GAP_Y / 2;
      result.push(pairAt(center.x - offX, center.y - offY));
      result.push(pairAt(center.x + offX, center.y - offY));
      result.push(pairAt(center.x - offX, center.y + offY));
      result.push(pairAt(center.x + offX, center.y + offY));
      break;
    }

    case 'het': {
      // ח: שתי עמודות בצדדים + שורה תחתונה
      // עמודה ימנית (3 זוגיים, מסובבים 90°)
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x + 2 * PAIR_GAP_X, center.y - PAIR_GAP_Y + i * PAIR_GAP_Y, 90));
      }
      // עמודה שמאלית
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x - 2 * PAIR_GAP_X, center.y - PAIR_GAP_Y + i * PAIR_GAP_Y, 90));
      }
      // שורה תחתונה (3 זוגיים)
      for (let i = -1; i <= 1; i++) {
        result.push(pairAt(center.x + i * PAIR_GAP_X, center.y + 2 * PAIR_GAP_Y));
      }
      break;
    }

    case 'u': {
      // U: שתי עמודות + שורה עליונה
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x + 2 * PAIR_GAP_X, center.y - PAIR_GAP_Y + i * PAIR_GAP_Y, 90));
      }
      for (let i = 0; i < 3; i++) {
        result.push(pairAt(center.x - 2 * PAIR_GAP_X, center.y - PAIR_GAP_Y + i * PAIR_GAP_Y, 90));
      }
      for (let i = -1; i <= 1; i++) {
        result.push(pairAt(center.x + i * PAIR_GAP_X, center.y - 2 * PAIR_GAP_Y));
      }
      break;
    }
  }

  // הקצה layoutGroup לכולם (אם יש יותר מ-1)
  if (result.length > 1) {
    const groupId = Math.random().toString(36).slice(2, 8);
    result.forEach((r) => { r.desk.layoutGroup = groupId; });
  }
  return result;
}

const TEMPLATE_INFO: Record<TemplateType, { label: string; emoji: string; desc: string }> = {
  single:  { label: 'יחיד',  emoji: '🪑', desc: 'שולחן עם מקום אחד' },
  pair:    { label: 'זוגי',  emoji: '👥', desc: 'שולחן עם 2 מקומות' },
  row5:    { label: 'טור',   emoji: '➡',  desc: '5 שולחנות זוגיים בשורה' },
  cluster: { label: 'גוש',   emoji: '⊞',  desc: '4 זוגיים בריבוע' },
  het:     { label: 'ח',     emoji: 'ח',  desc: 'צורת ח (3 צדדים)' },
  u:       { label: 'U',     emoji: 'U',  desc: 'צורת U (3 צדדים)' },
};

export default function DeskLayoutEditor({ classroomId }: Props) {
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addDesk = useClassroomStore((s) => s.addDesk);
  const updateDesk = useClassroomStore((s) => s.updateDesk);
  const removeDesk = useClassroomStore((s) => s.removeDesk);
  const updateSeat = useClassroomStore((s) => s.updateSeat);
  const undo = useClassroomStore((s) => s.undo);
  const redo = useClassroomStore((s) => s.redo);
  const historyDepth = useClassroomStore((s) => (s.currentId ? s._history[s.currentId]?.length ?? 0 : 0));
  const futureDepth  = useClassroomStore((s) => (s.currentId ? s._future[s.currentId]?.length ?? 0 : 0));

  const [template, setTemplate] = useState<TemplateType>('pair');
  const [gridOn, setGridOn] = useState(true);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);

  const stageRef = useRef<Konva.Stage>(null);

  // חישוב מחדש של אזורים אוטומטיים אחרי כל שינוי
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); redo(); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDeskId) {
        removeDesk(selectedDeskId);
        setSelectedDeskId(null);
      }
      if (e.key === 'Escape') setSelectedDeskId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDeskId, undo, redo, removeDesk]);

  if (!classroom) return null;

  // לחיצה על הקנבס = הצבת תבנית (רק אם לא לחצו על שולחן קיים)
  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const center = { x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) };

    const items = buildTemplate(template, center);
    items.forEach((item) => addDesk(item.desk, item.seats));
    setSelectedDeskId(null);
  };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setMousePos({ x: snap(pos.x, gridOn), y: snap(pos.y, gridOn) });
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
      <Line
        key={w.id}
        points={flat}
        stroke={style.color}
        strokeWidth={style.width}
        dash={style.dash}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
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
    const isSelected = selectedDeskId === desk.id;
    const w = desk.seatCount === 2 ? 70 : 45;
    const h = 45;

    // תווית של אזורים — ניקח מהמושב הראשון (כרגע משותף)
    const zones = seats[0]?.autoZones ?? [];

    return (
      <Group
        key={desk.id}
        x={desk.position.x}
        y={desk.position.y}
        rotation={desk.rotation}
        draggable
        onClick={() => setSelectedDeskId(desk.id)}
        onTap={() => setSelectedDeskId(desk.id)}
        onDragEnd={(e) => {
          updateDesk(desk.id, {
            position: { x: snap(e.target.x(), gridOn), y: snap(e.target.y(), gridOn) },
          });
        }}
      >
        {/* גוף השולחן */}
        <Rect
          x={-w / 2} y={-h / 2} width={w} height={h}
          fill="#e7e5e4"
          stroke={isSelected ? '#ea580c' : '#78716c'}
          strokeWidth={isSelected ? 3 : 1.5}
          cornerRadius={6}
        />
        {/* מושבים — עיגולים */}
        {seats.map((seat) => {
          const dx = seat.side === 'solo' ? 0 : (seat.side === 'left' ? -16 : 16);
          return (
            <Circle
              key={seat.id}
              x={dx}
              y={0}
              radius={11}
              fill="#fff"
              stroke="#16a34a"
              strokeWidth={2}
            />
          );
        })}
        {/* תוויות אזורים (ב-canvas — מתחת לשולחן) */}
        {showZones && zones.length > 0 && (
          <Text
            x={-w / 2}
            y={h / 2 + 4}
            width={w}
            align="center"
            text={zones.map((z) => ZONE_LABELS[z]?.label ?? z).join(' · ')}
            fontSize={9}
            fontFamily="Heebo"
            fill={ZONE_LABELS[zones[0]]?.color ?? 'var(--ink3)'}
            fontStyle="bold"
          />
        )}
      </Group>
    );
  };

  // תצוגה מקדימה של התבנית בעת ריחוף
  const renderPreview = () => {
    if (!mousePos) return null;
    const items = buildTemplate(template, mousePos);
    return (
      <Group listening={false} opacity={0.4}>
        {items.map((item, i) => {
          const w = item.desk.seatCount === 2 ? 70 : 45;
          const h = 45;
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

  const TemplateButton = ({ type }: { type: TemplateType }) => {
    const info = TEMPLATE_INFO[type];
    const active = template === type;
    return (
      <button
        onClick={() => setTemplate(type)}
        title={info.desc}
        style={{
          background: active ? 'var(--ac)' : 'var(--bg2)',
          color: active ? '#fff' : 'var(--ink)',
          border: `1.5px solid ${active ? 'var(--ac)' : 'var(--bd2)'}`,
          borderRadius: 'var(--rs)',
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
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
    >
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );

  // סטטיסטיקה
  const totalSeats = classroom.seats.length;

  return (
    <div>
      {/* תבניות */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 12, marginBottom: 8, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginLeft: 4 }}>תבניות:</span>
        {(Object.keys(TEMPLATE_INFO) as TemplateType[]).map((t) => <TemplateButton key={t} type={t} />)}
      </div>

      {/* פעולות */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 10, marginBottom: 12, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <ActionButton onClick={undo} disabled={historyDepth === 0} emoji="↶" label={`ביטול${historyDepth ? ` (${historyDepth})` : ''}`} />
        <ActionButton onClick={redo} disabled={futureDepth === 0}  emoji="↷" label={`הבא${futureDepth ? ` (${futureDepth})` : ''}`} />
        <ActionButton
          onClick={() => { if (selectedDeskId) { removeDesk(selectedDeskId); setSelectedDeskId(null); } }}
          disabled={!selectedDeskId}
          emoji="🗑"
          label="מחק שולחן"
          danger
        />
        <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
            <strong>{classroom.desks.length}</strong> שולחנות · <strong>{totalSeats}</strong> מושבים
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
        💡 בחר תבנית ולחץ על המקום בקנבס. גרור שולחן להזיז. בחר שולחן + Delete למחוק.
      </div>

      <div style={{
        background: 'var(--bg2)', border: '1.5px solid var(--bd)', borderRadius: 'var(--r)',
        overflow: 'hidden', boxShadow: 'var(--sh)', position: 'relative',
      }}>
        <Stage
          ref={stageRef}
          width={classroom.width}
          height={classroom.height}
          onClick={onStageClick}
          onTap={onStageClick}
          onMouseMove={onStageMouseMove}
          style={{ cursor: 'crosshair', background: '#fff' }}
        >
          <Layer listening={false}>{renderGrid()}</Layer>
          <Layer>
            {classroom.walls.map(renderWall)}
            {classroom.fixedElements.map(renderTeacherDesk)}
            {classroom.desks.map(renderDesk)}
            {renderPreview()}
          </Layer>
        </Stage>

        <div style={{
          position: 'absolute', bottom: 6, left: 12, fontSize: 11, color: 'var(--ink3)',
          background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: 4,
        }}>
          {mousePos.x},{mousePos.y}
          {selectedDeskId && ' · נבחר שולחן'}
        </div>
      </div>
    </div>
  );
}
