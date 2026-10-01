import { CylinderGeometry, LatheGeometry, type PerspectiveCamera, Vector2 } from "three";
import { beadShape } from "./preview-3d-data.js";
import { setLocalOcclusionUV } from "./preview-3d-occlusion.js";

export const beadSegments = [6, 8, 12, 20, 32];
export const pegSegments = [4, 6, 8, 12];
export const previewTriangleBudget = 10_000_000;
const pixelError = 0.35;

export interface PreviewDetail {
  bead: number;
  peg: number;
}

const error = (radius: number, segments: number) => radius * (1 - Math.cos(Math.PI / segments));

/** Hysteresis applies to the projected silhouette, not the document dimensions. */
function segmentsFor(radiusPixels: number, tiers: number[], previous?: number) {
  let index = previous === undefined ? -1 : tiers.indexOf(previous);
  if (index < 0)
    return tiers.find((segments) => error(radiusPixels, segments) <= pixelError) ?? tiers.at(-1)!;
  while (index < tiers.length - 1 && error(radiusPixels, tiers[index]) > pixelError * 1.2) index++;
  while (index > 0 && error(radiusPixels, tiers[index - 1]) < pixelError * 0.8) index--;
  return tiers[index];
}

export function detailTriangles(detail: PreviewDetail, beads: number, pegs: number, fixed: number) {
  return detail.bead * 14 * beads + detail.peg * 4 * pegs + fixed;
}

/** A complete maximum board fits even the lowest pair; quality never removes instances. */
export function selectPreviewDetail(
  pixelsPerPitch: number,
  beads: number,
  pegs: number,
  fixed: number,
  previous?: PreviewDetail,
): PreviewDetail {
  const pixels = Math.max(0, Number.isFinite(pixelsPerPitch) ? pixelsPerPitch : 0);
  const desired = {
    bead: segmentsFor(pixels * beadShape.radius, beadSegments, previous?.bead),
    peg: segmentsFor(pixels * beadShape.pegRadius, pegSegments, previous?.peg),
  };
  if (detailTriangles(desired, beads, pegs, fixed) <= previewTriangleBudget) return desired;
  let best = { bead: beadSegments[0], peg: pegSegments[0] };
  let bestError = Infinity;
  for (const bead of beadSegments) {
    if (bead > desired.bead) break;
    for (const peg of pegSegments) {
      if (peg > desired.peg) break;
      const candidate = { bead, peg };
      if (detailTriangles(candidate, beads, pegs, fixed) > previewTriangleBudget) continue;
      const shapeError =
        (beads ? error(beadShape.radius, bead) ** 2 : 0) + error(beadShape.pegRadius, peg) ** 2;
      if (shapeError < bestError) {
        best = candidate;
        bestError = shapeError;
      }
    }
  }
  return best;
}

/** Nearest envelope depth is conservative at oblique angles and when panned off center. */
export function projectedPitch(
  camera: PerspectiveCamera,
  width: number,
  depth: number,
  bufferHeight: number,
) {
  camera.updateMatrixWorld();
  const e = camera.matrixWorldInverse.elements;
  const nearest =
    -e[14] -
    (Math.abs(e[2]) * width) / 2 -
    (Math.abs(e[10]) * depth) / 2 -
    Math.max(0, e[6] * beadShape.height);
  return (
    (bufferHeight * camera.projectionMatrix.elements[5]) / (2 * Math.max(camera.near, nearest))
  );
}

/** Finite CPU variants; Three.js uploads each only on its first render. */
export function createPreviewGeometries() {
  const { radius, hole, height, pegRadius, pegHeight } = beadShape;
  const profile = [
    [hole, 0],
    [radius - 0.02, 0],
    [radius, 0.02],
    [radius, height - 0.02],
    [radius - 0.02, height],
    [hole + 0.02, height],
    [hole, height - 0.02],
    [hole, 0],
  ].map(([x, y]) => new Vector2(x, y));
  const beads = new Map(
    beadSegments.map((segments) => {
      const geometry = new LatheGeometry(profile, segments);
      setLocalOcclusionUV(geometry, "bead");
      return [segments, geometry] as const;
    }),
  );
  const pegs = new Map(
    pegSegments.map((segments) => {
      const geometry = new CylinderGeometry(pegRadius * 0.75, pegRadius, pegHeight, segments);
      setLocalOcclusionUV(geometry, "peg");
      return [segments, geometry] as const;
    }),
  );
  return {
    beads,
    pegs,
    dispose() {
      for (const geometry of beads.values()) geometry.dispose();
      for (const geometry of pegs.values()) geometry.dispose();
    },
  };
}
