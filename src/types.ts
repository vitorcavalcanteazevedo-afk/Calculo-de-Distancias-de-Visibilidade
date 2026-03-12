
export interface Point {
  lat: number;
  lng: number;
  elevation: number;
  distance: number; // cumulative distance from start of path in meters
}

export interface VisibilityResult {
  increasing: number; // distance in meters
  decreasing: number; // distance in meters
  observerIndex: number;
  increasingTargetIndex: number;
  decreasingTargetIndex: number;
  increasingLimitingFactor: 'vertical' | 'horizontal' | 'none';
  decreasingLimitingFactor: 'vertical' | 'horizontal' | 'none';
  path: Point[];
}
