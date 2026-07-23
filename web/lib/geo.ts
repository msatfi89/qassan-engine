import geo from "./tunisia-governorates.json";
import del from "./tunisia-delegations.json";

/**
 * Tunisia governorate boundaries, from geoBoundaries (gbOpen, TUN ADM1),
 * derived from OpenStreetMap and licensed ODbL 1.0.
 *
 * Simplified to ~1.1km precision: sub-pixel at the size a country renders on
 * a phone, and 98KB instead of 288KB. Properties reduced to the ISO code and
 * the Arabic name the registry uses. Features were matched to Arabic names by
 * ISO code, never by Latin spelling — the source says "El Kef" where places
 * says "Le Kef", so name matching would have quietly dropped governorates.
 *
 * Bundled rather than fetched: an outage tracker should not depend on a third
 * party being up, and the artifact CSP forbids external requests anyway.
 */

type Ring = [number, number][];
export type GovFeature = {
  type: "Feature";
  properties: { iso: string; name_ar: string };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
};

export const GOVERNORATES = (geo as unknown as { features: GovFeature[] }).features;

export type DelegationFeature = {
  type: "Feature";
  properties: {
    name_ar: string;
    // Registry place id, or null when this shape did not match the registry.
    // A null shape is drawn neutral grey and NEVER coloured by a cut — an
    // unmatched boundary must never claim an outage. ~94% carry an id.
    place_id: number | null;
    gov_iso: string | null;
    gov_ar: string | null;
  };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
};

export const DELEGATIONS = (del as unknown as { features: DelegationFeature[] }).features;

/** Delegations of one governorate, by its ISO code. */
export function delegationsOf(govIso: string): DelegationFeature[] {
  return DELEGATIONS.filter((d) => d.properties.gov_iso === govIso);
}

/** Polygons of a feature, normalised so callers need not branch on the type. */
function polygonsOf(f: { geometry: GovFeature["geometry"] | DelegationFeature["geometry"] }): Ring[][] {
  return f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/* ---------- projection ---------- */

export type Projection = {
  width: number;
  height: number;
  project: (lon: number, lat: number) => [number, number];
};

/**
 * Equirectangular with a cosine correction for latitude.
 *
 * Not a real map projection, and it does not need to be: Tunisia spans about
 * 6 degrees, where the distortion is invisible, and this avoids pulling in
 * d3-geo for one country outline.
 */
export function makeProjection(width = 300): Projection {
  return makeProjectionFor(GOVERNORATES, width);
}

/**
 * Fit a projection to any set of features — the whole country for the national
 * view, or one governorate's delegations when zoomed in, so they fill the
 * frame instead of sitting tiny in a corner.
 */
export function makeProjectionFor(
  features: { geometry: GovFeature["geometry"] | DelegationFeature["geometry"] }[],
  width = 300,
  pad = 0.05
): Projection {
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const f of features) {
    for (const poly of polygonsOf(f)) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }
  // A little padding so strokes at the edge are not clipped.
  const dLon = (maxLon - minLon) * pad, dLat = (maxLat - minLat) * pad;
  minLon -= dLon; maxLon += dLon; minLat -= dLat; maxLat += dLat;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLat);
  const spanX = (maxLon - minLon) * lonScale;
  const spanY = maxLat - minLat;
  const scale = width / spanX;
  const height = spanY * scale;

  return {
    width,
    height,
    project(lon, lat) {
      return [
        (lon - minLon) * lonScale * scale,
        // SVG y grows downward; latitude grows upward.
        (maxLat - lat) * scale,
      ];
    },
  };
}

/**
 * Centroid and pixel size of a feature under a projection, for label placement.
 * cx/cy is the area-weighted-ish centroid (mean of the largest ring's points);
 * w/h is the projected bounding box, used to decide whether a label fits inside.
 */
export function projectedBounds(
  f: { geometry: GovFeature["geometry"] | DelegationFeature["geometry"] },
  p: Projection
): { cx: number; cy: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // Use the largest ring for the centroid so a small enclave does not pull it.
  let best: Ring | null = null, bestLen = -1;
  for (const poly of polygonsOf(f)) {
    const ring = poly[0];
    if (ring && ring.length > bestLen) { bestLen = ring.length; best = ring; }
    for (const r of poly) for (const [lon, lat] of r) {
      const [x, y] = p.project(lon, lat);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  let sx = 0, sy = 0, n = 0;
  for (const [lon, lat] of best ?? []) { const [x, y] = p.project(lon, lat); sx += x; sy += y; n++; }
  return { cx: n ? sx / n : (minX + maxX) / 2, cy: n ? sy / n : (minY + maxY) / 2,
           w: maxX - minX, h: maxY - minY };
}

/** SVG path data for one feature (governorate or delegation) under a projection. */
export function pathFor(f: { geometry: GovFeature["geometry"] | DelegationFeature["geometry"] }, p: Projection): string {
  const parts: string[] = [];
  for (const poly of polygonsOf(f)) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = p.project(lon, lat);
        parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
      });
      parts.push("Z");
    }
  }
  return parts.join("");
}

/* ---------- point in polygon ---------- */

function inRing(lon: number, lat: number, ring: Ring): boolean {
  // Ray casting. Counts crossings of a horizontal ray to the east.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Which governorate contains this point, or null if none does.
 *
 * Runs in the browser on bundled data. THE COORDINATES NEVER LEAVE THE DEVICE
 * — that is the whole reason the boundaries are shipped to the client instead
 * of asking a server "where am I". Holes are respected, so a point inside an
 * enclave is not falsely attributed.
 */
export function governorateAt(lon: number, lat: number): GovFeature | null {
  for (const f of GOVERNORATES) {
    for (const poly of polygonsOf(f)) {
      const [outer, ...holes] = poly;
      if (!outer || !inRing(lon, lat, outer)) continue;
      if (holes.some((h) => inRing(lon, lat, h))) continue;
      return f;
    }
  }
  return null;
}
