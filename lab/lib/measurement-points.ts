import {looseHeaterPoint} from './heater-flex-point';
import { describeEndpoint } from './endpoint-description';
import type { MeasurementEvidence } from './learning';
import type { CircuitDocument, Endpoint } from './types';

export function measurementPoints(circuit: CircuitDocument | undefined, reading: Pick<MeasurementEvidence, 'mode'|'a'|'b'|'wire'|'instrument'>) {
  const copper=circuit&&looseHeaterPoint(circuit);
  const point = (endpoint?: Endpoint) => endpoint && (
    copper&&endpoint.component===copper.component&&endpoint.terminal===copper.terminal?'Loose brown wire at the wall switch':circuit && describeEndpoint(circuit, endpoint)?.label || endpoint.component + ' · ' + endpoint.terminal
  );
  if (reading.mode === 'current' || reading.instrument?.method === 'fork-voltage') {
    const wire = circuit?.wires.find(w => w.id === reading.wire);
    const span = wire ? point(wire.from) + ' → ' + point(wire.to) : reading.wire;
    if (reading.instrument?.method === 'fork-voltage') {
      return [span, reading.instrument.reference === 'pad' ? 'Rear earth pad' : point(reading.b)].filter(Boolean).join(' · ');
    }
    return span;
  }
  return [point(reading.a), point(reading.b)].filter(Boolean).join(' → ');
}
