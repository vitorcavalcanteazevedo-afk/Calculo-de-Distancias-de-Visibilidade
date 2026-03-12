
import { Point } from '../types';

/**
 * Calculates visibility distance from a specific point in a path.
 * @param path Array of points with elevation and cumulative distance
 * @param observerIndex Index of the observer in the path
 * @param eyeHeight Height of the observer's eyes (e.g., 1.20m)
 * @param objectHeight Height of the target object (e.g., 0.15m or 0.60m)
 * @param lateralOffset Maximum lateral distance from the axis to an obstacle (e.g., 3.0m)
 * @param direction 1 for increasing, -1 for decreasing
 */
export function calculateVisibility(
  path: Point[],
  observerIndex: number,
  eyeHeight: number,
  objectHeight: number,
  lateralOffset: number,
  direction: 1 | -1
): { distance: number; targetIndex: number; limitingFactor: 'vertical' | 'horizontal' | 'none' } {
  const observer = path[observerIndex];
  const hObs = observer.elevation + eyeHeight;
  const dObs = observer.distance;
  const pObs = { lat: observer.lat, lng: observer.lng };

  let maxVisibleDistance = 0;
  let targetIndex = observerIndex;
  let limitingFactor: 'vertical' | 'horizontal' | 'none' = 'none';

  // Iterate through points in the given direction
  for (let i = observerIndex + direction; i >= 0 && i < path.length; i += direction) {
    const target = path[i];
    const hTarget = target.elevation + objectHeight;
    const dTarget = target.distance;
    const pTarget = { lat: target.lat, lng: target.lng };
    
    const totalDist = Math.abs(dTarget - dObs);
    
    // Check if line of sight is blocked
    let blockedBy: 'vertical' | 'horizontal' | null = null;
    const start = Math.min(observerIndex, i);
    const end = Math.max(observerIndex, i);

    for (let k = start + 1; k < end; k++) {
      const intermediate = path[k];
      
      // 1. Vertical Check (Elevation)
      const dInter = intermediate.distance;
      const hLOS = hObs + (hTarget - hObs) * (dInter - dObs) / (dTarget - dObs);
      
      if (intermediate.elevation > hLOS) {
        blockedBy = 'vertical';
        break;
      }

      // 2. Horizontal Check (Lateral Offset)
      const distToChord = getPerpendicularDistance(
        intermediate.lat, intermediate.lng,
        pObs.lat, pObs.lng,
        pTarget.lat, pTarget.lng
      );

      if (distToChord > lateralOffset) {
        blockedBy = 'horizontal';
        break;
      }
    }

    if (!blockedBy) {
      maxVisibleDistance = totalDist;
      targetIndex = i;
    } else {
      limitingFactor = blockedBy;
      break;
    }
  }

  return { distance: maxVisibleDistance, targetIndex, limitingFactor };
}

/**
 * Calculates the perpendicular distance from a point to a line segment (lat/lng).
 * Simplified for small distances using equirectangular approximation.
 */
function getPerpendicularDistance(ptLat: number, ptLng: number, startLat: number, startLng: number, endLat: number, endLng: number): number {
  // Convert to a local Cartesian system (meters) relative to start point
  const R = 6371000;
  const latToM = Math.PI * R / 180;
  const lngToM = latToM * Math.cos(startLat * Math.PI / 180);

  const x = (ptLng - startLng) * lngToM;
  const y = (ptLat - startLat) * latToM;
  const x2 = (endLng - startLng) * lngToM;
  const y2 = (endLat - startLat) * latToM;

  // Distance from point (x,y) to line (0,0)-(x2,y2)
  const numerator = Math.abs(y2 * x - x2 * y);
  const denominator = Math.sqrt(x2 * x2 + y2 * y2);
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}
