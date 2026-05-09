import jsPDF from 'jspdf';
import type Konva from 'konva';
import type { Wall } from '../types';

export interface PdfOptions {
  classroomName: string;
  teacherName?: string;
  title?: string;
  walls?: Wall[];
  classroomWidth?: number;
  classroomHeight?: number;
}

const WALL_LABELS: Record<string, string> = {
  board:        'לוח',
  door:         'דלת',
  window_lobby: 'חלון ללובי',
  window_yard:  'חלון לחצר',
  small_window: 'חלון',
  blank:        '',
};

// מחזיר את הצד הדומיננטי של הקיר בתוך הכיתה
function getWallSide(
  wall: Wall,
  stageW: number,
  stageH: number,
): 'top' | 'bottom' | 'left' | 'right' | null {
  const xs = wall.points.map((p) => p.x);
  const ys = wall.points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const wallW = maxX - minX;
  const wallH = maxY - minY;
  const isHoriz = wallW > wallH;
  if (isHoriz) return midY < stageH / 2 ? 'top' : 'bottom';
  return midX < stageW / 2 ? 'left' : 'right';
}

// מחזיר מיקום הדלת לאורך הקיר (0..1) לצורך ציון מדויק בשוליים
function getDoorFrac(wall: Wall, side: 'top' | 'bottom' | 'left' | 'right'): number {
  const xs = wall.points.map((p) => p.x);
  const ys = wall.points.map((p) => p.y);
  const mid = (side === 'top' || side === 'bottom')
    ? (Math.min(...xs) + Math.max(...xs)) / 2
    : (Math.min(...ys) + Math.max(...ys)) / 2;
  return mid;
}

function drawWallLabels(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  stageW: number,
  stageH: number,
  stageOffX: number,
  stageOffY: number,
  labelMargin: number,
): void {
  // אוסף תוויות לפי צד
  const sideLabels: Record<string, Set<string>> = { top: new Set(), bottom: new Set(), left: new Set(), right: new Set() };
  const doorPositions: { side: string; px: number }[] = [];

  for (const w of walls) {
    const label = WALL_LABELS[w.type];
    if (!label) continue;
    const side = getWallSide(w, stageW, stageH);
    if (!side) continue;
    if (w.type !== 'door') {
      sideLabels[side].add(label);
    } else {
      // דלת — מציג בנפרד עם מיקום
      const frac = getDoorFrac(w, side);
      doorPositions.push({ side, px: frac });
    }
  }

  ctx.save();
  ctx.font = 'bold 18px Arial, Heebo, sans-serif';
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // תוויות צדדים
  if (sideLabels.top.size > 0) {
    ctx.direction = 'rtl';
    ctx.fillText([...sideLabels.top].join(' · '), stageOffX + stageW / 2, stageOffY - labelMargin / 2);
  }
  if (sideLabels.bottom.size > 0) {
    ctx.direction = 'rtl';
    ctx.fillText([...sideLabels.bottom].join(' · '), stageOffX + stageW / 2, stageOffY + stageH + labelMargin / 2);
  }
  if (sideLabels.left.size > 0) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.translate(stageOffX - labelMargin / 2, stageOffY + stageH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText([...sideLabels.left].join(' · '), 0, 0);
    ctx.restore();
  }
  if (sideLabels.right.size > 0) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.translate(stageOffX + stageW + labelMargin / 2, stageOffY + stageH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText([...sideLabels.right].join(' · '), 0, 0);
    ctx.restore();
  }

  // תוויות דלתות עם מיקום
  ctx.font = 'bold 15px Arial, Heebo, sans-serif';
  ctx.fillStyle = '#ea580c';
  for (const dp of doorPositions) {
    ctx.direction = 'rtl';
    if (dp.side === 'top') {
      ctx.fillText('דלת', stageOffX + dp.px, stageOffY - labelMargin / 2 + 2);
    } else if (dp.side === 'bottom') {
      ctx.fillText('דלת', stageOffX + dp.px, stageOffY + stageH + labelMargin / 2 - 2);
    } else if (dp.side === 'left') {
      ctx.save();
      ctx.translate(stageOffX - labelMargin / 2, stageOffY + dp.px);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('דלת', 0, 0);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(stageOffX + stageW + labelMargin / 2, stageOffY + dp.px);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('דלת', 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}

function buildSeatsCanvas(stage: Konva.Stage, opts: PdfOptions): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const PIXEL_RATIO = 2;
    const stageW = stage.width();
    const stageH = stage.height();

    const pinNodes = stage.find('.pin');
    pinNodes.forEach((n) => n.hide());
    const imgData = stage.toDataURL({ pixelRatio: PIXEL_RATIO });
    pinNodes.forEach((n) => n.show());

    const LABEL_MARGIN = 52;
    const HEADER_H = 72;
    const OUTER_MARGIN = 20;

    const totalW = stageW + 2 * (LABEL_MARGIN + OUTER_MARGIN);
    const totalH = stageH + 2 * (LABEL_MARGIN + OUTER_MARGIN) + HEADER_H;

    const stageOffX = OUTER_MARGIN + LABEL_MARGIN;
    const stageOffY = HEADER_H + OUTER_MARGIN + LABEL_MARGIN;

    const canvas = document.createElement('canvas');
    canvas.width  = totalW * PIXEL_RATIO;
    canvas.height = totalH * PIXEL_RATIO;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, stageOffX, stageOffY, stageW, stageH);

      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.strokeRect(stageOffX, stageOffY, stageW, stageH);

      const dateStr = new Date().toLocaleDateString('he-IL', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      const className = opts.classroomName || opts.title || '';

      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';

      ctx.font = 'bold 30px Arial, Heebo, sans-serif';
      ctx.fillStyle = '#1c1917';
      ctx.fillText(className, totalW - OUTER_MARGIN, HEADER_H / 2 + 4);

      ctx.font = '18px Arial, Heebo, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(dateStr, totalW - OUTER_MARGIN, HEADER_H / 2 + 30);

      if (opts.teacherName) {
        ctx.textAlign = 'left';
        ctx.font = '16px Arial, Heebo, sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(opts.teacherName, OUTER_MARGIN, HEADER_H / 2 + 30);
      }
      ctx.restore();

      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(OUTER_MARGIN, HEADER_H);
      ctx.lineTo(totalW - OUTER_MARGIN, HEADER_H);
      ctx.stroke();

      if (opts.walls && opts.walls.length > 0) {
        drawWallLabels(ctx, opts.walls, stageW, stageH, stageOffX, stageOffY, LABEL_MARGIN);
      }

      resolve(canvas);
    };
    img.src = imgData;
  });
}

export function exportSeatsPdf(stage: Konva.Stage, opts: PdfOptions): void {
  buildSeatsCanvas(stage, opts).then((canvas) => {
    const finalDataUrl = canvas.toDataURL('image/png');
    const totalW = canvas.width / 2;  // חזרה ל-1x
    const totalH = canvas.height / 2;
    const orientation = totalW >= totalH ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const ratio = totalW / totalH;
    let imgW = pageW, imgH = pageW / ratio;
    if (imgH > pageH) { imgH = pageH; imgW = pageH * ratio; }
    const marginX = (pageW - imgW) / 2;
    const marginY = (pageH - imgH) / 2;

    pdf.addImage(finalDataUrl, 'PNG', marginX, marginY, imgW, imgH);
    const safeName = (opts.classroomName || 'seating').replace(/\s+/g, '_');
    pdf.save(`seating-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}

export function exportSeatsImageBlob(stage: Konva.Stage, opts: PdfOptions): Promise<Blob> {
  return buildSeatsCanvas(stage, opts).then(
    (canvas) => new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    )
  );
}
