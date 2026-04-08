export interface TimeSegment {
  start: number;
  end: number;
}

/**
 * Merges overlapping time segments and returns the total duration in seconds.
 */
export function sumUniqueTimeSeconds(segments: TimeSegment[]): number {
  if (segments.length === 0) return 0;

  // Sort by start time
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: TimeSegment[] = [];
  
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= current.end) {
      // Overlap
      current.end = Math.max(current.end, next.end);
    } else {
      // Break
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged.reduce((total, seg) => total + Math.max(0, (seg.end - seg.start) / 1000), 0);
}
