export type PlotViewport = { zoom: number; centerX: number; centerY: number };
export const initialViewport: PlotViewport = {
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
};
export const maxPlotZoom = 12;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function limitViewport(view: PlotViewport): PlotViewport {
  const zoom = clamp(view.zoom, 1, maxPlotZoom);
  const half = 0.5 / zoom;
  return {
    zoom,
    centerX: clamp(view.centerX, half, 1 - half),
    centerY: clamp(view.centerY, half, 1 - half),
  };
}
export function plotWindow(view: PlotViewport) {
  const span = 1 / view.zoom;
  return { minX: view.centerX - span / 2, minY: view.centerY - span / 2, span };
}
// Anchor fractions run left-to-right and bottom-to-top within the plot.
export function zoomPlot(
  view: PlotViewport,
  zoom: number,
  anchor = { x: 0.5, y: 0.5 },
): PlotViewport {
  const nextZoom = clamp(zoom, 1, maxPlotZoom);
  const { minX, minY, span } = plotWindow(view);
  return limitViewport({
    zoom: nextZoom,
    centerX: minX + anchor.x * span + (0.5 - anchor.x) / nextZoom,
    centerY: minY + anchor.y * span + (0.5 - anchor.y) / nextZoom,
  });
}
// Drag distances are fractions of the visible plot width/height.
export function panPlot(view: PlotViewport, dx: number, dy: number) {
  return limitViewport({
    ...view,
    centerX: view.centerX - dx / view.zoom,
    centerY: view.centerY + dy / view.zoom,
  });
}

type LabelPoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  intelligence: number;
  priority: boolean;
  emphasized: boolean;
};
export type PlotLabel = {
  id: string;
  name: string;
  fullName: string;
  x: number;
  y: number;
  width: number;
  priority: boolean;
  pointX: number;
  pointY: number;
};
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export function layoutPlotLabels(
  points: LabelPoint[],
  bounds: Box,
  zoom: number,
): PlotLabel[] {
  const boxes: Box[] = [];
  const labels: PlotLabel[] = [];
  const ordinaryLimit = Math.floor(6 + 10 * Math.log2(zoom));
  let ordinaryCount = 0;
  const ordered = [...points].sort(
    (a, b) =>
      Number(b.priority) - Number(a.priority) ||
      Number(b.emphasized) - Number(a.emphasized) ||
      b.intelligence - a.intelligence ||
      a.id.localeCompare(b.id),
  );
  for (const point of ordered) {
    if (!point.priority && ordinaryCount >= ordinaryLimit) continue;
    const maxCharacters = Math.max(1, Math.floor((bounds.width - 16) / 5.6));
    const name =
      point.name.length > maxCharacters
        ? `${point.name.slice(0, maxCharacters - 1)}…`
        : point.name;
    const textWidth = name.length * 5.6;
    const r = point.radius;
    const offsets = [
      [r + 8, -8],
      [-textWidth - r - 8, -8],
      [-textWidth / 2, -r - 22],
      [-textWidth / 2, r + 8],
      [r + 8, -r - 22],
      [-textWidth - r - 8, r + 8],
    ];
    // The top three get reserved space even in a dense cluster or at an edge.
    if (point.priority)
      for (let step = 1; step <= 15; step++)
        for (const sign of [-1, 1]) offsets.push([r + 8, sign * step * 20 - 8]);
    const candidates = offsets
      .map(([dx, dy]) => ({
        x: point.priority
          ? clamp(
              point.x + dx - 4,
              bounds.x + 2,
              bounds.x + bounds.width - textWidth - 10,
            )
          : point.x + dx - 4,
        y: point.priority
          ? clamp(point.y + dy - 2, bounds.y + 2, bounds.y + bounds.height - 20)
          : point.y + dy - 2,
        width: textWidth + 8,
        height: 18,
      }))
      .filter(
        (box) =>
          box.x >= bounds.x &&
          box.x + box.width <= bounds.x + bounds.width &&
          box.y >= bounds.y &&
          box.y + box.height <= bounds.y + bounds.height &&
          !boxes.some((other) => overlaps(box, other)),
      );
    const box =
      candidates.find(
        (candidate) =>
          !points.some(
            (other) =>
              other.id !== point.id &&
              overlaps(candidate, {
                x: other.x - other.radius - 3,
                y: other.y - other.radius - 3,
                width: 2 * (other.radius + 3),
                height: 2 * (other.radius + 3),
              }),
          ),
      ) ?? (point.priority ? candidates[0] : undefined);
    if (!box) continue;
    boxes.push(box);
    labels.push({
      id: point.id,
      name,
      fullName: point.name,
      x: box.x + 4,
      y: box.y + 13,
      width: textWidth,
      priority: point.priority,
      pointX: point.x,
      pointY: point.y,
    });
    if (!point.priority) ordinaryCount++;
  }
  // Priority names are painted last, above every ordinary label.
  return labels.sort((a, b) => Number(a.priority) - Number(b.priority));
}
