export type Vec3 = [number, number, number];
export type Parameters = Record<string, string | number | boolean>;
export type TerminalRole = 'L' | 'N' | 'PE' | 'L1' | 'L2' | 'L3' | 'control' | 'output' | 'DC+' | 'DC-';
export interface TerminalDefinition { id: string; label: string; role: TerminalRole; purpose: string; anchor: Vec3; group?: string; scale?: number }
export interface PartDefinition { id: string; name: string; purpose: string }
export interface ComponentDefinition {
  type: string; name: string; group: string; description: string; terminals: TerminalDefinition[];
  parts: PartDefinition[]; defaults: Parameters; size: Vec3; model: string; abstraction?: string; variants?: { id: string; name: string }[];
}
export interface ComponentInstance { id: string; type: string; label: string; position: Vec3; rotation: number; params: Parameters; variant?: string }
export interface Endpoint { component: string; terminal: string }
export interface Wire { id: string; from: Endpoint; to: Endpoint; role: TerminalRole; resistance: number; bends: Vec3[] }
export interface FaultSetting { type: string; component?: string; wire?: string; enabled: boolean }
export interface CircuitDocument {
  version: 1; id: string; name: string; revision: number;
  supply: { enabled: boolean; phase: 'single' | 'three'; voltage: number; frequency: number; sourceResistance: number };
  components: ComponentInstance[]; wires: Wire[]; faults: FaultSetting[]; lessonId?: number;
}
export interface Complex { re: number; im: number; reference?: string }
export interface DeviceState { energized: boolean; closed: boolean; tripped: boolean; level: number; direction: number; elapsed: number; resetToken: number; details: string; [key: string]: string | number | boolean }
export interface Diagnostic { id: string; severity: 'info' | 'warning' | 'error'; category: 'operation' | 'protection' | 'model'; title: string; explanation: string; component?: string; wire?: string }
export interface SimulationEvent { time: number; title: string; detail: string; component?: string }
export interface SimulationResult {
  revision: number; terminalVoltages: Record<string, Complex>; branchCurrents: Record<string, Complex>;
  wireCurrents: Record<string, Complex>; componentPower: Record<string, number>; deviceStates: Record<string, DeviceState>;
  diagnostics: Diagnostic[]; events: SimulationEvent[]; totalPower: number; totalCurrent: number;
  converged: boolean; elapsedMs: number; nodes: number; preTrip?: { totalCurrent: number; explanation: string };
}
export interface LessonSection { title: string; beginner: string; apprentice: string }
export interface ConfigurationLesson {
  id: number; title: string; category: string; level: 'Foundation' | 'Intermediate' | 'Advanced';
  context: string; tag: 'Routine' | 'Existing' | 'Equipment dependent' | 'Advanced';
  summary: string; sections: LessonSection[]; steps: string[]; objectives: string[];
  challenge: { title: string; briefing: string; fault: string; hint: string; answer: string; wire?: string; component?: string };
  references: { title: string; url: string }[]; circuit: CircuitDocument;
}
export const endpointKey = (e: Endpoint) => `${e.component}.${e.terminal}`;
