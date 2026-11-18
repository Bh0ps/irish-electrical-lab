import { Vector3, type Camera, type Intersection, type Vector2 } from 'three';

/** Wire and probe rings are drawn above housings. Deliver the pick to the
 * closest visible ring centre, even when a cover is nearer to the camera. */
export function prioritizeTerminalHit(
  hits: Intersection[], pointer: Vector2, camera: Camera, size: { width: number; height: number },
): Intersection[] {
  let best = -1;
  let nearest = Infinity;
  const center = new Vector3();
  for (let index = 0; index < hits.length; index++) {
    const { object } = hits[index];
    if (!object.userData.terminalMarker) continue;
    object.getWorldPosition(center).project(camera);
    const dx = (center.x - pointer.x) * size.width;
    const dy = (center.y - pointer.y) * size.height;
    const distance = dx * dx + dy * dy;
    // R3F already orders hits by depth, which breaks an exact pixel tie.
    if (distance < nearest) { best = index; nearest = distance; }
  }
  if (best < 1) return hits;
  return [hits[best], ...hits.slice(0, best), ...hits.slice(best + 1)];
}
