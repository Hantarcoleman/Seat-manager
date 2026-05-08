import jsPDF from 'jspdf';
import type Konva from 'konva';

export interface PdfOptions {
  classroomName: string;
  teacherName?: string;
  title?: string;
}

export function exportSeatsPdf(stage: Konva.Stage, opts: PdfOptions): void {
  const imgData = stage.toDataURL({ pixelRatio: 2 });
  const stageW = stage.width();
  const stageH = stage.height();

  const orientation = stageW >= stageH ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;

  const dateStr = new Date().toLocaleDateString('he-IL', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── כותרת ──
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  const title = opts.title ?? opts.classroomName;
  pdf.text(title, pageW - margin, margin + 8, { align: 'right' });

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(dateStr, pageW - margin, margin + 16, { align: 'right' });

  if (opts.teacherName) {
    pdf.text(opts.teacherName, margin, margin + 16);
  }

  // קו הפרדה
  pdf.setDrawColor(180);
  pdf.setLineWidth(0.4);
  pdf.line(margin, margin + 20, pageW - margin, margin + 20);

  // ── תמונת הכיתה ──
  const contentTop = margin + 25;
  const availW = pageW - 2 * margin;
  const availH = pageH - contentTop - margin;
  const ratio = stageW / stageH;
  let imgW = availW;
  let imgH = imgW / ratio;
  if (imgH > availH) { imgH = availH; imgW = imgH * ratio; }
  const imgX = margin + (availW - imgW) / 2;

  pdf.addImage(imgData, 'PNG', imgX, contentTop, imgW, imgH);

  // ── שמירה ──
  const safeName = opts.classroomName.replace(/\s+/g, '_');
  pdf.save(`seating-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
