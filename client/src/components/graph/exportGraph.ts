import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import type { RFNode } from './graphAdapter';

// Extra room around the tightest node bounding box so edge labels/handles at
// the very edge of the map don't get clipped in the export.
const EXPORT_PADDING_FRACTION = 0.1;
// Raster exports (PDF) are captured at this multiple of CSS pixels so text
// and icons stay crisp instead of blurring when the PDF is zoomed in.
const RASTER_QUALITY_SCALE = 2.5;

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'mindflow-map';
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function getCanvasBackground(container: HTMLElement): string {
  return getComputedStyle(container).getPropertyValue('--canvas').trim() || '#ffffff';
}

interface ExportLayout {
  viewportEl: HTMLElement;
  width: number;
  height: number;
  style: { width: string; height: string; transform: string };
  backgroundColor: string;
}

function prepareExportLayout(container: HTMLElement, nodes: RFNode[], scale: number): ExportLayout {
  const viewportEl = container.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewportEl || nodes.length === 0) {
    throw new Error('Nothing to export yet - add a node first.');
  }

  const bounds = getNodesBounds(nodes);
  const width = Math.max(bounds.width, 100) * scale;
  const height = Math.max(bounds.height, 100) * scale;
  const { x, y, zoom } = getViewportForBounds(bounds, width, height, 0.1, 2, EXPORT_PADDING_FRACTION);

  return {
    viewportEl,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`
    },
    backgroundColor: getCanvasBackground(container)
  };
}

/** Exports the whole map (not just what's currently in view) as an SVG file.
 * Nodes/edges are HTML+CSS, not native SVG shapes, so this wraps the live DOM
 * in a <foreignObject> - it opens correctly in browsers and most vector
 * editors, but isn't a shape-level vector (text stays selectable/crisp, but
 * isn't individually editable path data). */
export async function exportGraphAsSvg(container: HTMLElement, nodes: RFNode[], mapName: string) {
  const layout = prepareExportLayout(container, nodes, 1);
  const dataUrl = await toSvg(layout.viewportEl, {
    backgroundColor: layout.backgroundColor,
    width: layout.width,
    height: layout.height,
    style: layout.style
  });
  downloadDataUrl(dataUrl, `${slugify(mapName)}.svg`);
}

/** Exports the whole map as a single-page PDF sized to the map's own aspect
 * ratio, at RASTER_QUALITY_SCALE so it stays sharp when zoomed/printed. */
export async function exportGraphAsPdf(container: HTMLElement, nodes: RFNode[], mapName: string) {
  // Lazy-loaded: jsPDF (plus its optional html2canvas plugin) is ~250KB gzipped
  // and only ever needed once someone actually exports a PDF.
  const { jsPDF } = await import('jspdf');
  const layout = prepareExportLayout(container, nodes, RASTER_QUALITY_SCALE);
  const dataUrl = await toPng(layout.viewportEl, {
    backgroundColor: layout.backgroundColor,
    width: layout.width,
    height: layout.height,
    pixelRatio: 1,
    style: layout.style
  });

  const pdf = new jsPDF({
    orientation: layout.width >= layout.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [layout.width, layout.height],
    compress: true
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, layout.width, layout.height, undefined, 'FAST');
  pdf.save(`${slugify(mapName)}.pdf`);
}
