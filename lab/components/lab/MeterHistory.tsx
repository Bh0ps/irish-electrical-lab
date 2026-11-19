import { describeEndpoint } from '../../lib/build-hints';
import type { MeasurementEvidence } from '../../lib/learning';
import type { CircuitDocument, Endpoint } from '../../lib/types';

function measurementPoints(circuit: CircuitDocument, reading: MeasurementEvidence, current: boolean) {
  const point = (endpoint?: Endpoint) => endpoint && (
    current && describeEndpoint(circuit, endpoint)?.label || endpoint.component + ' · ' + endpoint.terminal
  );
  if (reading.mode === 'current' || reading.instrument?.method === 'fork-voltage') {
    const wire = current && circuit.wires.find(w => w.id === reading.wire);
    const span = wire ? point(wire.from) + ' → ' + point(wire.to) : reading.wire;
    if (reading.instrument?.method === 'fork-voltage') {
      return [span, reading.instrument.reference === 'pad' ? 'Rear earth pad' : point(reading.b)].filter(Boolean).join(' · ');
    }
    return span;
  }
  return [point(reading.a), point(reading.b)].filter(Boolean).join(' → ');
}

export default function MeterHistory({ circuit, readings }: { circuit: CircuitDocument; readings: MeasurementEvidence[] }) {
  return <details className="measurement-history"><summary>Saved readings ({readings.length})</summary>
    {readings.slice(-8).reverse().map(reading => {
      const current = reading.revision === circuit.revision && reading.circuitId === circuit.id;
      const points = measurementPoints(circuit, reading, current);
      const number = reading.instrument?.displayed ?? reading.value?.toLocaleString('en-IE', { maximumFractionDigits: 3 });
      const value = reading.status === 'open' ? 'OL · open circuit' : number === undefined ? 'No reading' : number + ' ' + reading.unit;
      return <div key={reading.id}><b>{value}</b>
        <small>{current ? 'On this circuit' : 'Earlier reading'} · {new Date(reading.recordedAt).toLocaleString('en-IE')}</small>
        {current ? <small>{points}</small> : points && <details><summary>Where it was measured</summary><small>{points}</small></details>}
      </div>;
    })}
  </details>;
}
