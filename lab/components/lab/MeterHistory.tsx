import { measurementPoints } from '../../lib/measurement-points';
import type { MeasurementEvidence } from '../../lib/learning';
import type { CircuitDocument } from '../../lib/types';

export default function MeterHistory({ circuit, readings }: { circuit: CircuitDocument; readings: MeasurementEvidence[] }) {
  return <details className="measurement-history"><summary>Saved readings ({readings.length})</summary>
    {readings.slice(-8).reverse().map(reading => {
      const current = reading.revision === circuit.revision && reading.circuitId === circuit.id;
      const points = reading.measuredAt ?? measurementPoints(current ? circuit : undefined, reading);
      const number = reading.instrument?.displayed ?? reading.value?.toLocaleString('en-IE', { maximumFractionDigits: 3 });
      const value = reading.status === 'open' ? 'OL · open circuit' : number === undefined ? 'No reading' : number + ' ' + reading.unit;
      return <div key={reading.id}><b>{value}</b>
        <small>{current ? 'On this circuit' : 'Earlier reading'} · {new Date(reading.recordedAt).toLocaleString('en-IE')}</small>
        {current || reading.measuredAt ? <small>{points}</small> : points && <details><summary>Where it was measured</summary><small>{points}</small></details>}
      </div>;
    })}
  </details>;
}
