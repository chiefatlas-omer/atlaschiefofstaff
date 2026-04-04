/**
 * OutputViewer — full-screen panel for reading, copying, and downloading
 * AI-generated deliverables. Renders markdown output with proper formatting.
 *
 * Opens as a slide-over from the right (like Linear detail panels).
 */

import { useEffect, useState, useCallback } from 'react';
import type { AgentModel } from '../../lib/team-types';

export interface OutputViewerData {
  title: string;
  output: string;
  employeeName?: string;
  employeeIcon?: string;
  employeeRole?: string;
  priority?: string;
  model?: string;
  tokensUsed?: number;
  durationMs?: number;
  completedAt?: string;
  taskId?: string;
}

interface OutputViewerProps {
  data: OutputViewerData | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Simple markdown renderer — handles headings, bold, italic, lists, code
// No external dependency needed for the subset Claude outputs.
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html.push('</code></pre>');
        inCodeBlock = false;
      } else {
        if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        html.push('<pre class="md-code-block"><code>');
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      html.push(escapeHtml(line));
      html.push('\n');
      continue;
    }

    // Empty line — close list, add spacing
    if (line.trim() === '') {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push('<div class="md-spacer"></div>');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const level = headingMatch[1].length;
      const classes = ['md-h1', 'md-h2', 'md-h3', 'md-h4'][level - 1] || 'md-h4';
      html.push(`<div class="${classes}">${inlineFormat(headingMatch[2])}</div>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push('<hr class="md-hr" />');
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
        html.push('<ul class="md-ul">');
        inList = true;
        listType = 'ul';
      }
      html.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
        html.push('<ol class="md-ol">');
        inList = true;
        listType = 'ol';
      }
      html.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    html.push(`<p class="md-p">${inlineFormat(line)}</p>`);
  }

  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inCodeBlock) html.push('</code></pre>');

  return html.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  let out = escapeHtml(text);
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/_(.+?)_/g, '<em>$1</em>');
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // Links
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>',
  );
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Helper: parse **bold** and *italic* into TextRun objects for docx
function parseInlineRuns(text: string, TextRun: any): any[] {
  const runs: any[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4] }));
    }
  }
  return runs.length ? runs : [new TextRun({ text })];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function OutputViewer({ data, onClose }: OutputViewerProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [data]);

  // Escape key closes
  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [data]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    if (!data?.output) return;
    try {
      await navigator.clipboard.writeText(data.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = data.output;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data?.output]);

  const getSlug = useCallback(() => {
    return (data?.title ?? 'output')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }, [data?.title]);

  const handleDownloadMd = useCallback(() => {
    if (!data?.output) return;
    downloadBlob(
      new Blob([data.output], { type: 'text/markdown;charset=utf-8' }),
      `${getSlug()}.md`,
    );
  }, [data?.output, getSlug]);

  // ── Document exports (lazy-loaded) ──────────────────────────────────

  const [exporting, setExporting] = useState<string | null>(null);

  const handleDownloadDocx = useCallback(async () => {
    if (!data?.output || exporting) return;
    setExporting('docx');
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');

      const children: any[] = [];
      for (const line of data.output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) { children.push(new Paragraph({ text: '' })); continue; }

        // Headings
        const h1 = trimmed.match(/^#\s+(.+)/);
        if (h1) { children.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 })); continue; }
        const h2 = trimmed.match(/^##\s+(.+)/);
        if (h2) { children.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 })); continue; }
        const h3 = trimmed.match(/^###\s+(.+)/);
        if (h3) { children.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 })); continue; }

        // Horizontal rule → empty paragraph with bottom border
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          children.push(new Paragraph({ text: '' }));
          continue;
        }

        // Bullet list
        const bullet = trimmed.match(/^[-*+]\s+(.+)/);
        if (bullet) {
          children.push(new Paragraph({
            text: '',
            bullet: { level: 0 },
            children: parseInlineRuns(bullet[1], TextRun),
          }));
          continue;
        }

        // Numbered list
        const numbered = trimmed.match(/^\d+[.)]\s+(.+)/);
        if (numbered) {
          children.push(new Paragraph({
            text: '',
            numbering: { reference: 'default-numbering', level: 0 },
            children: parseInlineRuns(numbered[1], TextRun),
          }));
          continue;
        }

        // Regular paragraph with inline formatting
        children.push(new Paragraph({
          children: parseInlineRuns(trimmed, TextRun),
        }));
      }

      const doc = new Document({
        numbering: {
          config: [{
            reference: 'default-numbering',
            levels: [{ level: 0, format: 'decimal' as any, text: '%1.', alignment: AlignmentType.START }],
          }],
        },
        sections: [{ children }],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${getSlug()}.docx`);
    } catch (err) {
      console.error('DOCX export failed:', err);
    } finally {
      setExporting(null);
    }
  }, [data?.output, getSlug, exporting]);

  const handleDownloadPdf = useCallback(async () => {
    if (!data?.output || exporting) return;
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;
      const lineHeight = 6;

      for (const line of data.output.split('\n')) {
        const trimmed = line.trim();

        // Check if we need a new page
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }

        if (!trimmed) { y += 4; continue; }

        // Headings
        const h1 = trimmed.match(/^#\s+(.+)/);
        if (h1) {
          y += 4;
          doc.setFontSize(18);
          doc.setFont('helvetica', 'bold');
          const lines = doc.splitTextToSize(h1[1], maxWidth);
          doc.text(lines, margin, y);
          y += lines.length * 8 + 2;
          continue;
        }
        const h2 = trimmed.match(/^##\s+(.+)/);
        if (h2) {
          y += 3;
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          const lines = doc.splitTextToSize(h2[1], maxWidth);
          doc.text(lines, margin, y);
          y += lines.length * 7 + 2;
          continue;
        }
        const h3 = trimmed.match(/^###\s+(.+)/);
        if (h3) {
          y += 2;
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          const lines = doc.splitTextToSize(h3[1], maxWidth);
          doc.text(lines, margin, y);
          y += lines.length * 6 + 1;
          continue;
        }

        // HR
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          y += 2;
          doc.setDrawColor(200);
          doc.line(margin, y, pageWidth - margin, y);
          y += 4;
          continue;
        }

        // Strip markdown inline formatting for PDF
        const clean = trimmed
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/__(.+?)__/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/^[-*+]\s+/, '  •  ')
          .replace(/^\d+[.)]\s+/, (m) => '  ' + m);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        // Check for bold prefix
        if (trimmed.startsWith('**') || trimmed.startsWith('__')) {
          doc.setFont('helvetica', 'bold');
        }
        const lines = doc.splitTextToSize(clean, maxWidth);
        // Page break check for multi-line text
        if (y + lines.length * lineHeight > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(lines, margin, y);
        y += lines.length * lineHeight;
      }

      doc.save(`${getSlug()}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(null);
    }
  }, [data?.output, getSlug, exporting]);

  const handleDownloadPptx = useCallback(async () => {
    if (!data?.output || exporting) return;
    setExporting('pptx');
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pres = new PptxGenJS();
      pres.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
      pres.layout = 'WIDE';

      // Title slide
      const titleSlide = pres.addSlide();
      titleSlide.addText(data.title, {
        x: 0.8, y: 1.5, w: 11.7, h: 1.5,
        fontSize: 32, bold: true, color: '4F3588',
      });
      if (data.employeeName) {
        titleSlide.addText(`Prepared by ${data.employeeName}${data.employeeRole ? ' · ' + data.employeeRole : ''}`, {
          x: 0.8, y: 3.2, w: 11.7, h: 0.5,
          fontSize: 14, color: '6B7280',
        });
      }
      if (data.completedAt) {
        titleSlide.addText(new Date(data.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), {
          x: 0.8, y: 3.8, w: 11.7, h: 0.4,
          fontSize: 12, color: '9CA3AF',
        });
      }

      // Content slides — split by H2s
      const sections = data.output.split(/(?=^## )/m).filter(Boolean);

      for (const section of sections) {
        const lines = section.split('\n').filter((l) => l.trim());
        if (lines.length === 0) continue;

        const slide = pres.addSlide();

        // First line as slide title (strip markdown heading markers)
        const heading = lines[0].replace(/^#{1,4}\s+/, '');
        slide.addText(heading, {
          x: 0.8, y: 0.4, w: 11.7, h: 0.8,
          fontSize: 24, bold: true, color: '111827',
        });

        // Rest as body — strip markdown formatting
        const body = lines
          .slice(1)
          .map((l) =>
            l.trim()
              .replace(/\*\*(.+?)\*\*/g, '$1')
              .replace(/__(.+?)__/g, '$1')
              .replace(/\*(.+?)\*/g, '$1')
              .replace(/_(.+?)_/g, '$1')
              .replace(/`([^`]+)`/g, '$1'),
          )
          .join('\n');

        if (body.trim()) {
          slide.addText(body, {
            x: 0.8, y: 1.5, w: 11.7, h: 5.3,
            fontSize: 14, color: '374151',
            valign: 'top',
            lineSpacingMultiple: 1.3,
            paraSpaceAfter: 6,
          });
        }
      }

      const arrayBuffer = await pres.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      downloadBlob(blob, `${getSlug()}.pptx`);
    } catch (err) {
      console.error('PPTX export failed:', err);
    } finally {
      setExporting(null);
    }
  }, [data, getSlug, exporting]);


  const handleCopyHtml = useCallback(async () => {
    if (!data?.output) return;
    const html = renderMarkdown(data.output);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([data.output], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fall back to plain text copy
      handleCopy();
    }
  }, [data?.output, handleCopy]);

  if (!data) return null;

  const formattedDuration = data.durationMs
    ? data.durationMs > 60000
      ? `${(data.durationMs / 60000).toFixed(1)}m`
      : `${(data.durationMs / 1000).toFixed(1)}s`
    : null;

  const formattedDate = data.completedAt
    ? new Date(data.completedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${visible ? 'bg-black/20' : 'bg-transparent pointer-events-none'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div className="min-w-0 flex-1 pr-4">
            {/* Employee badge */}
            {data.employeeName && (
              <div className="mb-1.5 flex items-center gap-2">
                {data.employeeIcon && (
                  <span className="text-base">{data.employeeIcon}</span>
                )}
                <span className="text-xs font-medium text-gray-500">
                  {data.employeeName}
                  {data.employeeRole && (
                    <span className="text-gray-400"> &middot; {data.employeeRole}</span>
                  )}
                </span>
              </div>
            )}

            <h2 className="text-lg font-semibold leading-tight text-gray-900">
              {data.title}
            </h2>

            {/* Meta row */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {formattedDate && (
                <span className="text-xs text-gray-400">{formattedDate}</span>
              )}
              {data.priority && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color: data.priority === 'urgent' ? '#EF4444' : data.priority === 'high' ? '#F59E0B' : '#6B7280',
                    backgroundColor: data.priority === 'urgent' ? '#FEE2E2' : data.priority === 'high' ? '#FEF3C7' : '#F3F4F6',
                  }}
                >
                  {data.priority}
                </span>
              )}
              {data.model && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: data.model.includes('opus') ? '#4F3588' : '#3B82F6',
                    backgroundColor: data.model.includes('opus') ? '#F3F1FC' : '#DBEAFE',
                  }}
                >
                  {data.model.includes('opus') ? 'Opus' : 'Sonnet'}
                </span>
              )}
              {formattedDuration && (
                <span className="text-[10px] text-gray-400">
                  {formattedDuration}
                </span>
              )}
              {data.tokensUsed ? (
                <span className="text-[10px] text-gray-400">
                  {data.tokensUsed.toLocaleString()} tokens
                </span>
              ) : null}
            </div>
          </div>

          {/* Close */}
          <button
            onClick={handleClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-50 px-6 py-2.5">
          {/* Copy actions */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 7.5l3 3 6-6" />
                </svg>
                <span className="text-[#22C55E]">Copied!</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
                  <path d="M9.5 4.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v5A1.5 1.5 0 003 9.5h1.5" />
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            onClick={handleCopyHtml}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5L1.5 7 4 9" />
              <path d="M10 5l2.5 2-2.5 2" />
              <path d="M8.5 2.5l-3 9" />
            </svg>
            Formatted
          </button>

          {/* Separator */}
          <div className="mx-1 h-4 w-px bg-gray-200" />

          {/* Download actions */}
          <button
            onClick={handleDownloadMd}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1.5v8M3.5 6.5L7 10l3.5-3.5" />
              <path d="M1.5 10.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
            </svg>
            .md
          </button>

          <button
            onClick={handleDownloadDocx}
            disabled={exporting === 'docx'}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'docx' ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="1" width="10" height="12" rx="1.5" />
                <path d="M5 5h4M5 7.5h4M5 10h2" />
              </svg>
            )}
            .docx
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={exporting === 'pdf'}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'pdf' ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="1" width="10" height="12" rx="1.5" />
                <path d="M5 4h1.5a1.5 1.5 0 010 3H5V4z" />
              </svg>
            )}
            .pdf
          </button>

          <button
            onClick={handleDownloadPptx}
            disabled={exporting === 'pptx'}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'pptx' ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="12" height="8" rx="1" />
                <path d="M4 6h6M4 8.5h3" />
              </svg>
            )}
            .pptx
          </button>

          {/* Word count */}
          <span className="ml-auto text-[10px] text-gray-400">
            {data.output.split(/\s+/).filter(Boolean).length.toLocaleString()} words
          </span>
        </div>

        {/* Content — rendered markdown */}
        <div className="flex-1 overflow-y-auto">
          <div
            className="output-viewer-content px-8 py-6"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(data.output) }}
          />
        </div>
      </div>

      {/* Scoped styles for rendered markdown */}
      <style>{`
        .output-viewer-content {
          font-size: 14px;
          line-height: 1.7;
          color: #1f2937;
        }
        .output-viewer-content .md-h1 {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          margin-top: 24px;
          margin-bottom: 8px;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }
        .output-viewer-content .md-h2 {
          font-size: 17px;
          font-weight: 650;
          color: #111827;
          margin-top: 20px;
          margin-bottom: 6px;
          line-height: 1.35;
        }
        .output-viewer-content .md-h3 {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-top: 16px;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .output-viewer-content .md-h4 {
          font-size: 14px;
          font-weight: 600;
          color: #4B5563;
          margin-top: 12px;
          margin-bottom: 4px;
        }
        .output-viewer-content .md-p {
          margin-bottom: 4px;
        }
        .output-viewer-content .md-spacer {
          height: 8px;
        }
        .output-viewer-content .md-ul,
        .output-viewer-content .md-ol {
          padding-left: 20px;
          margin-bottom: 4px;
        }
        .output-viewer-content .md-ul {
          list-style-type: disc;
        }
        .output-viewer-content .md-ol {
          list-style-type: decimal;
        }
        .output-viewer-content li {
          margin-bottom: 3px;
          padding-left: 4px;
        }
        .output-viewer-content .md-code-block {
          background-color: #f8f9fa;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 14px 16px;
          font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
          font-size: 12.5px;
          line-height: 1.6;
          overflow-x: auto;
          margin: 8px 0;
        }
        .output-viewer-content .md-inline-code {
          background-color: #f3f4f6;
          border-radius: 4px;
          padding: 1px 5px;
          font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
          font-size: 12px;
          color: #4F3588;
        }
        .output-viewer-content .md-link {
          color: #4F3588;
          text-decoration: underline;
          text-decoration-color: #4F358840;
          text-underline-offset: 2px;
          transition: text-decoration-color 0.15s;
        }
        .output-viewer-content .md-link:hover {
          text-decoration-color: #4F3588;
        }
        .output-viewer-content .md-hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 16px 0;
        }
        .output-viewer-content strong {
          font-weight: 600;
          color: #111827;
        }
        .output-viewer-content em {
          font-style: italic;
        }
      `}</style>
    </>
  );
}
