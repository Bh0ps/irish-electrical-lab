import type { ComponentDefinition, TerminalDefinition, TerminalRole, Parameters, Vec3 } from './types';
import { getComponentTerminals } from './terminal-layout.ts';

const purpose: Record<string, string> = {
  L: 'Line conductor: the alternating supply relative to neutral.', N: 'Neutral: the normal return path. It is not a protective conductor.',
  PE: 'Protective conductor: connects exposed conductive parts to the protective network; not a normal load return.',
  L1: 'First phase of the three-phase supply.', L2: 'Second phase, displaced by 120 degrees.', L3: 'Third phase, displaced by 240 degrees.',
  'DC+': 'Positive extra-low-voltage or DC output; keep separate from mains conductors.', 'DC-': 'DC return, electrically separate from mains neutral in an isolated supply.',
  control: 'Control connection. Its function depends on the contact map and operating state.', output: 'Controlled output. Its potential follows the actual connected circuit.',
};
function ports(ids: string[], roles?: TerminalRole[]): TerminalDefinition[] {
  return ids.map((id, i) => {
    const role: TerminalRole = roles?.[i] ?? (id === 'PE' || id === 'PEOUT' ? 'PE' : id.startsWith('N') ? 'N' : id.startsWith('L3') ? 'L3' : id.startsWith('L2') ? 'L2' : id.startsWith('L1') ? 'L1' : id.startsWith('L') ? 'L' : id === '+' ? 'DC+' : id === '-' ? 'DC-' : 'control');
    const rows = Math.ceil(ids.length / 4), row = Math.floor(i / 4), cols = Math.min(4, ids.length - row * 4);
    return { id, label: id, role, purpose: purpose[role], anchor: [(i % 4 - (cols - 1) / 2) * .25, .26 + row * .27, -.3] };
  });
}
const partText: Record<string, [string,string]> = {
  body: ['Housing', 'The enclosure supports and separates functional parts. This original teaching model is representative equipment, not a manufacturer drawing.'],
  cover: ['Removable cover', 'The cover limits access to internal connections. Opening it here is a virtual inspection operation.'],
  terminals: ['Terminal clamps', 'Metal clamps establish connections to individual conductors. The circuit engine connects terminal IDs, not the apparent proximity of 3D wires.'],
  mounting: ['Mounting and fixings', 'Mounting hardware supports the equipment. Screws, rail clips and glands are modelled separately from electrical connections.'],
  contacts: ['Switching contacts', 'Contacts either connect or separate their terminal pairs. Their position is linked to the simulation state, including normally open and normally closed functions.'],
  actuator: ['Operating mechanism', 'The mechanism translates a handle, button, coil or control demand into an operating state.'],
  coil: ['Electromagnetic coil', 'Voltage across the coil produces a magnetic operating force. This simulation models coil demand and pickup, rather than magnetic field saturation or inrush.'],
  sensing: ['Sensing element', 'The sensor converts an environmental condition or measured current into a control decision. Setpoints and input values can be changed in the inspector.'],
  toroid: ['Residual-current sensing core', 'All monitored active conductors pass through the sensing core. An imbalance indicates current returning outside those conductors. The protective conductor is not a monitored active conductor.'],
  thermal: ['Thermal protection', 'A thermal element responds to heating or sustained excess current. Timing is illustrative here; it is not a manufacturer trip curve.'],
  magnetic: ['Magnetic release', 'The magnetic mechanism illustrates rapid response to high current. The displayed fault current depends on the source and circuit resistance assumptions.'],
  rotor: ['Rotor and shaft', 'The rotating assembly performs mechanical work. Rotation animation indicates simulated operation; its speed is not a torque or inertia calculation.'],
  winding: ['Windings', 'Conductive windings couple electrical and magnetic behaviour. Motor and transformer windings use documented steady-state educational models.'],
  electronics: ['Electronic control board', 'This conceptual board represents an electronic interface. The model follows stated input, output and power limits rather than reconstructing proprietary firmware.'],
  battery: ['Backup energy store', 'Stored energy can supply an output after a monitored mains supply disappears. Isolation of one source does not remove every energy source.'],
  element: ['Heating element', 'Electrical resistance converts power to heat. For a fixed resistance, power changes with the square of voltage.'],
  emitter: ['Light source', 'The bulb, LED module or emergency-light emitter converts electrical power into illumination. The visible glow follows its actual simulated operating state; heat, optical output and colour rendering are outside the electrical model.'],
  fuse: ['Fuse carrier and element', 'A fuse interrupts its protected path when the illustrative protection model trips. It is distinct from a switch or residual-current device.'],
  isolation: ['Isolation boundary', 'The model separates the mains circuit from the output circuit. Voltage within a floating output can be meaningful while its voltage to earth is undetermined.'],
  display: ['Display and indicators', 'The display reports the model operating state. Meter readings come from the connected circuit, not a pre-recorded picture.'],
  pins: ['Contact pins', 'Pins and socket contacts have distinct identities. Matching physical equipment alone does not verify conductor assignment.'],
  sheath: ['Cable sheath and individual cores', 'The sheath provides mechanical protection around individual insulated conductors. Identification helps reading a circuit but does not prove that a conductor has been connected correctly.'],
};
const defs: ComponentDefinition[] = [];
function add(type: string, name: string, group: string, model: string, description: string, ids: string[], defaults: Parameters = {}, parts: string[] = [], size: Vec3 = [1.1,1.35,.8], roles?: TerminalRole[], abstraction?: string) {
  const terminals=ports(ids,roles);
  if(['switch','switch2','intermediate','dimmer'].includes(type))terminals.forEach(t=>{t.role='L';t.purpose=t.id==='COM'?'Common line-contact connection. The switch links this terminal to the selected output; it is not a neutral connection.':type==='switch2'?'Traveller connection selected by the common contact. T1/T2 are alternative switch paths, not separate supply phases.':type==='intermediate'?'Traveller connection. This mechanism pairs the two traveller paths straight through or crossed.':'Controlled line output. Its potential follows the actual contact or dimmer state.';});
  const definition:ComponentDefinition={ type,name,group,model,description,terminals,defaults,parts:['body','cover','terminals','mounting',...parts].map(id=>({id,name:partText[id]?.[0]??id,purpose:partText[id]?.[1]??'Selectable functional part.'})),size,abstraction };
  definition.terminals=getComponentTerminals({type,label:name,params:defaults},definition);
  defs.push(definition);
}
const load=['L','N','PE'], pass=['L','N','PE','LOUT','NOUT','PEOUT'];
const poles3=['L1IN','L2IN','L3IN','NIN','L1OUT','L2OUT','L3OUT','NOUT'];
add('source','Single-phase supply','Distribution','supply','Virtual customer supply with explicitly modelled source impedance. The service equipment is a contextual boundary.',load,{sourceResistance:.12},['display']);
add('source3','Three-phase supply','Distribution','supply','Three sinusoidal RMS phases with 120-degree separation; line voltage is the selected industrial supply value.',['L1','L2','L3','N','PE'],{sourceResistance:.12},['display']);
add('meter','Energy meter','Distribution','meter','Measures the supply path and represents metering on the customer boundary.',pass,{closed:true},['display','electronics']);
add('panel','Distribution enclosure','Distribution','panel','Openable cabinet with DIN rails, conductor bars, circuit labels and a customer-side supply path.',pass,{closed:true},[],[2,1.8,.8]);
add('terminal','Terminal block','Distribution','bar','A set of explicitly joined terminals used to organise a circuit.',['1','2','3','4'],{},[],[1,.5,.7]);
add('neutralbar','Neutral bar','Distribution','bar','Normal neutral connections share a metal bar. They remain separate from protective earth.',['1','2','3','4'],{},[],[1,.5,.7],['N','N','N','N']);
add('earthbar','Protective-earth bar','Distribution','bar','A protective connection point for exposed conductive parts, separate from load neutral.',['1','2','3','4'],{},[],[1,.5,.7],['PE','PE','PE','PE']);
add('mcb','Miniature circuit breaker','Protection','protection','Overcurrent protection with a thermal and magnetic conceptual mechanism.',['IN','OUT'],{closed:true,currentRating:16,resetToken:0},['actuator','contacts','thermal','magnetic'],[.7,1.3,.8],['L','L']);
add('mcb3','Linked three-pole breaker','Protection','protection','Linked three-phase overcurrent interruption. A trip on one monitored pole opens the linked device.',['L1IN','L2IN','L3IN','L1OUT','L2OUT','L3OUT'],{closed:true,currentRating:16,resetToken:0},['actuator','contacts','thermal','magnetic'],[1.4,1.3,.8]);
add('fuse','Fuse holder','Protection','protection','Overcurrent interruption within a removable fuse carrier.',['IN','OUT'],{closed:true,currentRating:13,resetToken:0},['fuse'],[.7,1.3,.8],['L','L']);
add('rcd','Residual-current circuit breaker','Protection','protection','Monitors current imbalance through live and neutral; it does not provide overload protection.',['LIN','NIN','LOUT','NOUT'],{closed:true,tripMa:30,resetToken:0},['actuator','contacts','toroid'],[1.2,1.3,.8]);
add('rcbo','Combined RCBO','Protection','protection','Combines overcurrent interruption and residual-current monitoring for an individual circuit.',['LIN','NIN','LOUT','NOUT'],{closed:true,currentRating:16,tripMa:30,resetToken:0},['actuator','contacts','toroid','thermal'],[1.2,1.3,.8]);
add('rcd3','Four-pole RCD','Protection','protection','Monitors the vector sum through three phases and neutral.',poles3,{closed:true,tripMa:30,resetToken:0},['contacts','toroid'],[1.4,1.3,.8]);
add('spd','Surge-protection device','Protection','protection','Parallel protective branch illustrating surge diversion. Normal steady-state operation draws negligible current.',load,{healthy:true},['electronics'],[.8,1.3,.8],undefined,'Transient surge waveforms are outside the steady-state solver. Connection and device condition can be inspected.');
add('isolator','Double-pole isolator','Protection','switch','Linked line and neutral contacts provide local isolation.',['LIN','NIN','LOUT','NOUT'],{closed:true},['actuator','contacts']);
add('isolator3','Four-pole isolator','Protection','switch','Linked three-phase and neutral isolation contacts.',poles3,{closed:true},['actuator','contacts'],[1.5,1.2,.8]);
add('changeover','Interlocked changeover','Protection','switch','Selects one supply path while separating the alternative.',['A','B','OUT','AN','BN','NOUT'],{position:0,closed:true},['actuator','contacts']);
add('socket','Domestic socket outlet','Accessories','socket','An outlet supplies the connected illustrative appliance load.',load,{watts:100,closed:true},['pins','actuator']);
add('socket3','Industrial five-pole socket','Accessories','socket','Separate phase, neutral and protective contacts for industrial equipment.',['L1','L2','L3','N','PE'],{watts:900},['pins'],[1.2,1.2,1]);
add('plug','Fused domestic plug','Accessories','plug','Three-pin plug with a separate line fuse and cord grip.',pass,{closed:true,currentRating:13},['pins','fuse','sheath']);
add('plug3','Industrial plug','Accessories','plug','Five-pin industrial plug with separately identified contacts.',['L1IN','L2IN','L3IN','NIN','PE','L1OUT','L2OUT','L3OUT','NOUT','PEOUT'],{closed:true},['pins','sheath']);
add('junction','Junction box','Accessories','junction','A four-way connector group. Each instance is one joined electrical group.',['1','2','3','4'],{},[],[1,.7,.8]);
add('rose','Ceiling rose connector','Accessories','junction','Visible connection groups for a luminaire; line, neutral and protective groups are separate.',pass,{closed:true},[],[1,.7,.8]);
add('fcu','Switched fused connection unit','Accessories','socket','Linked local switching with a protected line branch for a fixed appliance.',['LIN','NIN','LOUT','NOUT','PE'],{closed:true,currentRating:13,resetToken:0},['actuator','contacts','fuse']);
add('switch','One-way switch','Lighting','switch','A maintained contact makes or breaks the line path.',['COM','OUT'],{closed:true},['actuator','contacts']);
add('switch2','Two-way switch','Lighting','switch','The common terminal selects one of two travellers.',['COM','T1','T2'],{position:0,closed:true},['actuator','contacts']);
add('intermediate','Intermediate switch','Lighting','switch','Selects straight-through or crossed traveller connections.',['A','B','C','D'],{position:0,closed:true},['actuator','contacts']);
add('dimmer','Lighting dimmer','Lighting','switch','Adjusts the equivalent RMS supply to a compatible illustrative lighting load.',['COM','OUT'],{closed:true,level:.65},['actuator','electronics'],undefined,undefined,'Brightness control is an RMS teaching abstraction, not a chopped-waveform simulation.');
add('lamp','Luminaire','Lighting','lamp','An illustrative resistive lamp load with animated illumination.',load,{watts:60,nominalVoltage:240},['emitter'],[1,1.3,1]);
add('led','Low-voltage LED light','Lighting','lamp','A low-voltage lighting load supplied by its driver.',['L','N'],{watts:12,nominalVoltage:24},['emitter','electronics'],[1,1,1],['DC+','DC-']);
add('transformer','Isolating transformer','Conversion','transformer','Separates input and output circuits with a declared transformation ratio.',['L','N','PE','+','-'],{outputVoltage:12,efficiency:.95},['winding','isolation']);
add('driver','LED driver','Conversion','transformer','Regulated isolated extra-low-voltage output with power and current limits.',['L','N','PE','+','-'],{outputVoltage:24,efficiency:.9,maxPower:120},['electronics','isolation']);
add('dcsupply','24 V control supply','Conversion','transformer','An isolated DC control supply with a documented voltage and power limit.',['L','N','PE','+','-'],{outputVoltage:24,efficiency:.9,maxPower:120},['electronics','isolation']);
add('sensor','Environmental sensor','Controls','sensor','A powered sensor supplies a switched live output when its condition is met.',['L','N','IN','OUT'],{active:true,demand:true,sensorValue:1,setpoint:.5,mode:'PIR'},['sensing','electronics']);
add('timer','Timeclock / timed controller','Controls','controller','A powered controller provides a timed live output.',['L','N','IN','OUT'],{on:true,demand:true,delay:3,mode:'timer'},['display','electronics','contacts']);
add('smartrelay','Smart / priority controller','Controls','controller','Powered logic switches an output from a manual input or permission state.',['L','N','IN','OUT'],{on:true,demand:true,mode:'smart'},['electronics','contacts']);
add('thermostat','Thermostat','Heating','controller','A temperature-dependent contact controls demand; it is separate from independent safety protection.',['COM','OUT'],{closed:true,temperature:18,setpoint:21},['actuator','sensing','contacts']);
add('cutout','Independent thermal cut-out','Heating','controller','A separate safety contact opens when the illustrative limit is exceeded.',['COM','OUT'],{closed:true,temperature:20,setpoint:85,resetToken:0},['thermal','contacts']);
add('heater','Heating assembly','Heating','heater','A resistance heater; variants show immersion, mat, storage and staged heater forms.',load,{watts:1000,nominalVoltage:240},['element','thermal'],[1.4,1.3,1]);
add('cooker','Cooker','Appliances','appliance','Fixed cooking load with local isolation context and accessible supply terminals.',load,{watts:2400,nominalVoltage:240},['element','actuator'],[1.5,1.8,1.1]);
add('shower','Electric shower','Appliances','appliance','Illustrative high-demand fixed water-heating load, with equipment-dependent safety functions.',load,{watts:3000,nominalVoltage:240},['element','sensing'],[1.1,1.7,.8]);
add('boiler','Packaged boiler','Heating','appliance','A packaged heating appliance accepting an external demand supply.',load,{watts:120,nominalVoltage:240},['electronics','display'],[1.4,1.8,.9],undefined,'Manufacturer terminal schemes vary; this is a documented external demand abstraction.');
add('heatpump','Packaged heat pump','Heating','appliance','A representative heat-source package with simplified electrical demand.',load,{watts:1200,nominalVoltage:240},['rotor','electronics'],[1.8,1.4,1.2],undefined,'Refrigeration, inverter internals and thermal output are outside this electrical model.');
add('valve','Motorised valve / manifold actuator','Heating','valve','Electrical demand moves an actuator; position changes its auxiliary end contact.',['L','N','CALL','END','PE'],{delay:2,watts:6,mode:'two-port'},['actuator','contacts'],[1.2,1.3,1]);
add('valve3','Mid-position three-port valve','Heating','valve','Separate heating and hot-water demand inputs select a conceptual mid-position valve state.',['L','N','CH','HW','END','PE'],{delay:2,watts:6,mode:'three-port'},['actuator','contacts'],[1.2,1.3,1],undefined,'A representative demand state chart, not a universal manufacturer terminal wiring scheme.');
add('pump','Pump','Machinery','pump','A motor-driven pump represented by a steady-state electrical load.',load,{watts:180,nominalVoltage:240},['rotor','winding'],[1.5,1.2,1.1]);
add('fan','Fan','Machinery','fan','Motor-driven ventilation with operating animation.',load,{watts:30,nominalVoltage:240},['rotor','winding'],[1.2,1.3,1]);
add('motor','Single-phase motor','Machinery','motor','Single-phase machine drive with an illustrative impedance and mechanical operating state.',load,{watts:500,nominalVoltage:240,powerFactor:.8},['rotor','winding'],[1.7,1.2,1.2]);
add('motor3','Six-terminal three-phase motor','Machinery','motor','Three separate winding pairs allow actual external star and delta connections.',['U1','V1','W1','U2','V2','W2','PE'],{watts:1500,nominalVoltage:400,powerFactor:.8},['rotor','winding'],[1.8,1.3,1.3]);
add('contactor','Three-pole contactor','Machinery','contactor','A coil operates linked power contacts and separate auxiliary contacts.',['A1','A2','1','2','3','4','5','6','13','14','21','22'],{nominalVoltage:240,coilWatts:5,mechanicallyInterlockedWith:''},['coil','contacts','actuator'],[1.5,1.6,1]);
add('relay','Control relay','Controls','contactor','A coil operates normally open and normally closed contacts.',['A1','A2','COM','NO','NC'],{nominalVoltage:240,coilWatts:3},['coil','contacts']);
add('overload','Motor overload relay','Machinery','overload','Motor current trips an auxiliary control contact. It only stops the motor if the control circuit uses that contact correctly.',['1','2','3','4','5','6','95','96'],{currentRating:8,closed:true,resetToken:0},['thermal','contacts','actuator']);
add('pushbutton','Momentary control button','Controls','switch','Separate normally open and normally closed contacts follow a pressed state.',['COM','NO','NC'],{pressed:false},['actuator','contacts']);
add('selector','Maintained selector','Controls','switch','Selects one of two control paths.',['COM','A','B'],{position:0,closed:true},['actuator','contacts']);
add('indicator','Panel indicator','Controls','lamp','A low-power indicator shows the actual voltage across its terminals.',load,{watts:2,nominalVoltage:240},['display'],[.8,.8,.8]);
add('vfd','Variable-frequency drive','Industrial','vfd','A drive accepts three-phase power and a run request, providing an abstracted variable-frequency motor output.',['L1','L2','L3','PE','U','V','W','COM','RUN'],{frequency:50,efficiency:.95,on:true,maxPower:3000},['electronics','display'],[1.5,1.9,1],undefined,'PWM waveforms and motor torque are not simulated. Output measurements describe the fundamental RMS abstraction.');
add('plc','PLC and I/O module','Industrial','plc','A powered logic block maps wired permissive inputs to real output contacts.',['L','N','I1','I2','COM','Q1','Q2'],{mode:'and',on:true,nominalVoltage:24},['electronics','display'],[1.6,1.4,.9]);
add('safetyRelay','Safety relay','Industrial','plc','Conceptual dual input, reset and feedback checks operate an output contact.',['L','N','S1','S2','RESET','FB','COM','OUT'],{on:true,nominalVoltage:24},['electronics','contacts'],[1.4,1.4,.9],undefined,'This teaching state machine does not establish machinery safety compliance or performance level.');
add('alarm','Interlinked alarm','Safety','alarm','Mains operation, separate interlink and conceptual backup state.', ['L','N','PE','LINK'],{watts:2,nominalVoltage:240,battery:true,alarm:false},['sensing','battery','electronics'],[1.1,.7,1.1]);
add('chime','Doorbell chime','Safety','alarm','A low-voltage sounder controlled by a separate pushbutton.',['L','N'],{watts:3,nominalVoltage:12},['coil','actuator'],[1,.9,.8]);
add('emergency','Emergency luminaire','Safety','lamp','Monitors a mains supply, charges a battery and changes operation on supply loss.',['L','N','PE','SL'],{watts:8,nominalVoltage:240,battery:true,maintained:false},['emitter','battery','electronics'],[1.6,.9,.7]);
add('ev','EV charging equipment','Energy','charger','Packaged charging load with an external permission abstraction.',load,{watts:1800,nominalVoltage:240,on:true},['electronics','display'],[1.3,1.8,.8],undefined,'EV protection and communication are equipment dependent; this does not model every charging protocol.');
add('pv','PV grid inverter','Energy','inverter','Controlled generation at the AC interface, limited by solar availability.', ['L','N','PE','+','-'],{generation:600,on:true,efficiency:.95,availability:1},['electronics','display'],[1.4,1.7,.8],undefined,'A grid-presence teaching rule prevents arbitrary stand-alone operation; inverter certification is not simulated.');
add('battery','Battery / backup inverter','Energy','inverter','Stored energy can supply an isolated backup output through coordinated control.',['L','N','PE','+','-','BL','BN'],{generation:0,on:true,soc:80,capacityWh:2000,outputVoltage:240,efficiency:.9},['battery','electronics','display'],[1.4,1.9,1]);
add('cable','Cable section','Accessories','cable','A selectable cable cutaway showing the sheath and insulated cores.',['IN','OUT'],{closed:true},['sheath'],[1.5,.5,.7],undefined,'The IN–OUT pair models one conductor only. The other visible cores are explanatory geometry; add separate terminal connections for each conductor in a circuit.');
add('conduit','Conduit / gland assembly','Accessories','conduit','Containment and strain relief; it is not itself an electrical conductor.',[],{},['sheath'],[1.5,.5,.7]);
add('multimeter','Virtual multimeter','Instruments','instrument','Voltage and resistance probes read the solver rather than recorded values.',[],{mode:'voltage'},['display'],[1,1.6,.6]);
add('clamp','Virtual current clamp','Instruments','instrument','The clamp reads a selected conductor current.',[],{mode:'current'},['display','sensing'],[1,1.7,.6]);
// Physical forms share stable electrical terminals and differ only in presentation.
const physicalForms:Record<string,{id:string;name:string}[]>={
  panel:[{id:'domestic',name:'Domestic consumer unit'},{id:'industrial',name:'Industrial cabinet'}],
  lamp:[{id:'bulb',name:'B22 bulb and holder'},{id:'downlight',name:'Recessed downlight'},{id:'batten',name:'Linear batten'}],
  heater:[{id:'immersion',name:'Immersion assembly'},{id:'mat',name:'Underfloor heating mat'},{id:'storage',name:'Storage heater'}],
  conduit:[{id:'conduit',name:'Conduit and gland'},{id:'trunking',name:'Slotted trunking'}],
  cable:[{id:'three-core',name:'Three-core cutaway'},{id:'five-core',name:'Five-core cutaway'}],
};
for(const def of defs)if(physicalForms[def.type])def.variants=physicalForms[def.type];
export const COMPONENTS: Record<string,ComponentDefinition> = Object.fromEntries(defs.map(d=>[d.type,d]));
export const COMPONENT_LIST = defs;
export const getComponent = (type:string) => COMPONENTS[type];
