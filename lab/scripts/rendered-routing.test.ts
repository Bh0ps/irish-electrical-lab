import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from '../lib/components.ts';
import { createBoundedWireCurve, WIRE_CORNER_RADIUS } from '../lib/Equipment.tsx';
import { LESSONS } from '../lib/lessons.ts';
import { routeCircuit, WIRE_RADIUS } from '../lib/routing.ts';
import { getComponentTerminals } from '../lib/terminal-layout.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3, Wire } from '../lib/types.ts';

// This checks the exact ring centres used by TubeGeometry, independently of the
// planner's segment-distance, spatial index and auditRoutes implementation.
const EPSILON = 1e-5;
const MINIMUM_GAP = 2 * WIRE_RADIUS + EPSILON;
// Conductors intentionally converge in a common physical terminal bore. At
// 14 cm from that bore the planner's distinct exit directions must have split.
// This exemption applies only to a pair sharing the same component/terminal.
const COMMON_BORE_RADIUS = .14;
interface Segment { a: Vec3; b: Vec3 }
interface RenderedWire { wire: Wire; source: Vec3[]; points: Vec3[]; segments: Segment[] }
interface Issue { kind: string; wire: string; other?: string; distance?: number; position?: Vec3 }
const difference = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normSquared = (a: Vec3) => dot(a, a);
const distanceSquared = (a: Vec3, b: Vec3) => normSquared(difference(a, b));
const interpolate = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const segmentsFor = (points: Vec3[]): Segment[] => points.slice(1).map((b, index) => ({ a: points[index], b }));

function pointDistanceSquared(point: Vec3, a: Vec3, b: Vec3): number {
  const delta = difference(b, a), length = normSquared(delta);
  return distanceSquared(point, interpolate(a, b, length ? clamp(dot(difference(point, a), delta) / length) : 0));
}

/** Independent constrained minimum: interior solution plus all four edges. */
function segmentGap(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = difference(b, a), v = difference(d, c), w = difference(a, c);
  const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  const determinant = aa * cc - bb * bb;
  let minimum = Math.min(pointDistanceSquared(a, c, d), pointDistanceSquared(b, c, d), pointDistanceSquared(c, a, b), pointDistanceSquared(d, a, b));
  if (determinant > 1e-20) {
    const s = (bb * ee - cc * dd) / determinant, t = (aa * ee - bb * dd) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) minimum = Math.min(minimum, distanceSquared(interpolate(a, b, s), interpolate(c, d, t)));
  }
  return Math.sqrt(Math.max(0, minimum));
}

function boxesNear(a: Segment, b: Segment, gap = MINIMUM_GAP): boolean {
  let distance = 0;
  for (let axis = 0; axis < 3; axis++) {
    const delta = Math.max(0, Math.min(a.a[axis], a.b[axis]) - Math.max(b.a[axis], b.b[axis]), Math.min(b.a[axis], b.b[axis]) - Math.max(a.a[axis], a.b[axis]));
    distance += delta * delta;
  }
  return distance < gap * gap;
}

function outsideSphere(segment: Segment, center: Vec3, radius: number): Segment[] {
  const delta = difference(segment.b, segment.a), offset = difference(segment.a, center), aa = normSquared(delta);
  if (aa < 1e-24) return normSquared(offset) >= radius * radius ? [segment] : [];
  const bb = 2 * dot(offset, delta), cc = normSquared(offset) - radius * radius, discriminant = bb * bb - 4 * aa * cc;
  const fractions = [0, 1];
  if (discriminant > 0) {
    for (const root of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) if (root > 0 && root < 1) fractions.push(root);
  }
  fractions.sort((a, b) => a - b);
  const result: Segment[] = [];
  for (let index = 1; index < fractions.length; index++) {
    const start = fractions[index - 1], end = fractions[index];
    if (distanceSquared(interpolate(segment.a, segment.b, (start + end) / 2), center) >= radius * radius - 1e-12) result.push({ a: interpolate(segment.a, segment.b, start), b: interpolate(segment.a, segment.b, end) });
  }
  return result;
}

function physicalTerminal(document: CircuitDocument, endpoint: Endpoint): Vec3 {
  const component = document.components.find(c => c.id === endpoint.component);
  assert.ok(component, `Missing component ${endpoint.component}`);
  const terminal = getComponentTerminals(component, COMPONENTS[component.type]).find(t => t.id === endpoint.terminal);
  assert.ok(terminal, `Missing terminal ${endpoint.component}.${endpoint.terminal}`);
  const [x, y, z] = terminal.anchor, cosine = Math.cos(component.rotation), sine = Math.sin(component.rotation);
  return [component.position[0] + x * cosine + z * sine, component.position[1] + y, component.position[2] - x * sine + z * cosine];
}
function sharedBores(document: CircuitDocument, a: Wire, b: Wire): Vec3[] {
  const common = [a.from, a.to].filter(endpoint => [b.from, b.to].some(other => endpoint.component === other.component && endpoint.terminal === other.terminal));
  return common.map(endpoint => physicalTerminal(document, endpoint));
}
function clippedSegments(segments: Segment[], bores: Vec3[]): Segment[] {
  return bores.reduce((current, bore) => current.flatMap(segment => outsideSphere(segment, bore, COMMON_BORE_RADIUS)), segments);
}
function minimumWireGap(document: CircuitDocument, a: RenderedWire, b: RenderedWire): number {
  const bores = sharedBores(document, a.wire, b.wire);
  const left = bores.length ? clippedSegments(a.segments, bores) : a.segments;
  const right = bores.length ? clippedSegments(b.segments, bores) : b.segments;
  let minimum = Infinity;
  for (const one of left) for (const two of right) if (boxesNear(one, two)) minimum = Math.min(minimum, segmentGap(one.a, one.b, two.a, two.b));
  return minimum;
}

function inLocal(component: ComponentInstance, point: Vec3): Vec3 {
  const [x, y, z] = difference(point, component.position), cosine = Math.cos(component.rotation), sine = Math.sin(component.rotation);
  return [x * cosine - z * sine, y, x * sine + z * cosine];
}
function entersBox(a: Vec3, b: Vec3, low: Vec3, high: Vec3): boolean {
  let first = 0, last = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) { if (a[axis] < low[axis] || a[axis] > high[axis]) return false; }
    else {
      const one = (low[axis] - a[axis]) / delta, two = (high[axis] - a[axis]) / delta;
      first = Math.max(first, Math.min(one, two)); last = Math.min(last, Math.max(one, two));
      if (first > last) return false;
    }
  }
  return true;
}
function sameHousing(document: CircuitDocument, owner: string, component: ComponentInstance): boolean {
  if (owner === component.id) return true;
  const original = document.components.find(c => c.id === owner);
  if (!original || original.type !== 'switch' || component.type !== 'switch' || !original.params.gangGroup || original.params.gangGroup !== component.params.gangGroup) return false;
  const delta = inLocal(original, component.position);
  return ['left', 'right'].includes(String(original.params.gangModule)) && component.params.gangModule === (original.params.gangModule === 'left' ? 'right' : 'left') && Math.abs(delta[0] - (original.params.gangModule === 'left' ? .46 : -.46)) < 1e-6 && Math.abs(delta[1]) < 1e-6 && Math.abs(delta[2]) < 1e-6 && Math.abs(original.rotation - component.rotation) < 1e-6;
}
function isTerminalAccess(document: CircuitDocument, rendered: RenderedWire, segment: Segment, housing: ComponentInstance): boolean {
  const first = rendered.source[0], second = rendered.source[1], last = rendered.source[rendered.source.length - 1], beforeLast = rendered.source[rendered.source.length - 2];
  const closeTo = (a: Vec3, b: Vec3) => [segment.a, segment.b].every(p => pointDistanceSquared(p, a, b) <= (WIRE_CORNER_RADIUS + EPSILON) ** 2);
  return (sameHousing(document, rendered.wire.from.component, housing) && closeTo(first, second)) || (sameHousing(document, rendered.wire.to.component, housing) && closeTo(beforeLast, last));
}

function fixtureIssues(document: CircuitDocument, rendered: RenderedWire): Issue[] {
  const issues: Issue[] = [];
  for (const component of document.components) {
    const definition = COMPONENTS[component.type], terminals = getComponentTerminals(component, definition);
    // Housing bounds include its rear terminal carriers. Only that fixture's
    // own immediate entry segments can enter this radius-inflated envelope.
    const low: Vec3 = [-definition.size[0] / 2, -.015, Math.min(-definition.size[2] / 2, ...terminals.map(t => t.anchor[2] - .015))];
    const high: Vec3 = [definition.size[0] / 2, definition.size[1] * 1.05, definition.size[2] / 2];
    if (component.params.gangModule === 'left') { low[0] = Math.min(low[0], .23 - .565 * definition.size[0] / 1.3); high[0] = Math.max(high[0], .23 + .565 * definition.size[0] / 1.3); }
    const inflatedLow = low.map(value => value - WIRE_RADIUS - EPSILON) as Vec3, inflatedHigh = high.map(value => value + WIRE_RADIUS + EPSILON) as Vec3;
    const hit = rendered.segments.find(segment => !isTerminalAccess(document, rendered, segment, component) && entersBox(inLocal(component, segment.a), inLocal(component, segment.b), inflatedLow, inflatedHigh));
    if (hit) issues.push({ kind: 'rendered tube enters fixture clearance', wire: rendered.wire.id, other: component.id, position: hit.a });
  }
  return issues;
}

function renderedWire(wire: Wire, source: Vec3[]): RenderedWire {
  const curve = createBoundedWireCurve(source);
  const points = Array.from({ length: curve.tubularSegments + 1 }, (_, i) => curve.getPointAt(i / curve.tubularSegments).toArray() as Vec3);
  return { wire, source, points, segments: segmentsFor(points) };
}

test('independent rendered audit detects crossings, close parallel tubes and skew nearest points', () => {
  assert.equal(segmentGap([0, 0, 0], [1, 0, 0], [.5, -1, 0], [.5, 1, 0]), 0);
  assert.ok(Math.abs(segmentGap([0, 0, 0], [1, 0, 0], [.5, -1, .03], [.5, 1, .03]) - .03) < 1e-12);
  assert.ok(segmentGap([0, 0, 0], [1, 0, 0], [0, .035, 0], [1, .035, 0]) < MINIMUM_GAP);
  assert.ok(segmentGap([0, 0, 0], [1, 0, 0], [0, .04, 0], [1, .04, 0]) > MINIMUM_GAP);
  assert.equal(segmentGap([0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]), 1);
});

test('shared-bore clipping removes only the common joint neighbourhood', () => {
  const pieces = outsideSphere({ a: [-1, 0, 0], b: [1, 0, 0] }, [0, 0, 0], COMMON_BORE_RADIUS);
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0].b[0] + COMMON_BORE_RADIUS) < 1e-12);
  assert.ok(Math.abs(pieces[1].a[0] - COMMON_BORE_RADIUS) < 1e-12);
  assert.equal(outsideSphere({ a: [0, 0, 0], b: [.05, 0, 0] }, [0, 0, 0], COMMON_BORE_RADIUS).length, 0);
  assert.equal(outsideSphere({ a: [0, .2, 0], b: [.5, .2, 0] }, [0, 0, 0], COMMON_BORE_RADIUS).length, 1);
  const document = LESSONS[0].circuit, source = document.components[0];
  const [first, second] = getComponentTerminals(source, COMPONENTS[source.type]);
  const common = { component: source.id, terminal: first.id }, separate = { component: source.id, terminal: second.id };
  const anchor = physicalTerminal(document, common);
  const a: Wire = { id: 'a', from: common, to: { component: 'end-a', terminal: 'L' }, role: 'L', resistance: .01, bends: [] };
  const b: Wire = { ...a, id: 'b', to: { component: 'end-b', terminal: 'L' } };
  const one = renderedWire(a, [anchor, [anchor[0], anchor[1], anchor[2] - .5]]);
  const two = renderedWire(b, [anchor, [anchor[0] + .5, anchor[1], anchor[2] - .5]]);
  assert.ok(minimumWireGap(document, one, two) >= MINIMUM_GAP);
  // Coincident geometry is still a collision when the logical terminal differs.
  assert.equal(minimumWireGap(document, one, { ...two, wire: { ...b, from: separate } }), 0);
});

test('all 64 configurations have non-overlapping rendered tubes and clear fixture paths', () => {
  assert.equal(LESSONS.length, 64);
  const failures: { lesson: number; issues: Issue[] }[] = [];
  let wires = 0, meshSegments = 0;
  for (const lesson of LESSONS) {
    const document = lesson.circuit, plan = routeCircuit(document), issues: Issue[] = [];
    issues.push(...plan.issues.map(issue => ({ kind: issue.message, wire: issue.wire })));
    const rendered = document.wires.flatMap(wire => {
      const source = plan.routes.get(wire.id);
      if (!source || source.length < 2) { issues.push({ kind: 'missing route', wire: wire.id }); return []; }
      const model = renderedWire(wire, source);
      wires++; meshSegments += model.segments.length;
      assert.ok(distanceSquared(model.points[0], physicalTerminal(document, wire.from)) < 1e-20, `${lesson.id}/${wire.id}: starting bore moved`);
      assert.ok(distanceSquared(model.points[model.points.length - 1], physicalTerminal(document, wire.to)) < 1e-20, `${lesson.id}/${wire.id}: ending bore moved`);
      // The finite tube mesh, not just its ring centres, must stay inside the
      // chosen corner corridor. Distance to a source segment is convex, so
      // three samples also check each actual rendered linear mesh interval.
      for (const segment of model.segments) for (const point of [segment.a, interpolate(segment.a, segment.b, .5), segment.b]) {
        const nearest = Math.sqrt(Math.min(...segmentsFor(source).map(line => pointDistanceSquared(point, line.a, line.b))));
        if (nearest > WIRE_CORNER_RADIUS + EPSILON) issues.push({ kind: 'corner exceeds source corridor', wire: wire.id, distance: nearest, position: point });
      }
      issues.push(...fixtureIssues(document, model));
      return [model];
    });
    for (let left = 0; left < rendered.length; left++) for (let right = left + 1; right < rendered.length; right++) {
      const gap = minimumWireGap(document, rendered[left], rendered[right]);
      if (gap < MINIMUM_GAP) issues.push({ kind: 'rendered tubes overlap outside joint', wire: rendered[left].wire.id, other: rendered[right].wire.id, distance: gap });
    }
    if (issues.length) failures.push({ lesson: lesson.id, issues });
  }
  console.log(`Rendered routing audit: ${LESSONS.length} configurations, ${wires} wires, ${meshSegments} mesh intervals; minimum nonjoint gap ${(MINIMUM_GAP * 1000).toFixed(2)} mm; common-bore radius ${COMMON_BORE_RADIUS * 1000} mm.`);
  assert.equal(wires, LESSONS.reduce((count, lesson) => count + lesson.circuit.wires.length, 0), 'Every lesson wire must have rendered geometry');
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});
