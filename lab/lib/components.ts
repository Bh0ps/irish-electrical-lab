import type { ComponentDefinition, ComponentInstance, TerminalDefinition, TerminalRole, Parameters, Vec3 } from './types';
import { getComponentTerminals } from './terminal-layout.ts';

const purpose: Record<string, string> = {
  L: 'Line brings power to the fitting. Its usual marking is L.',
  N: 'Neutral carries current back to the supply while the load is on.',
  PE: 'PE means protective earth. It gives fault current a path back to the supply if a live wire touches exposed metal.',
  L1: 'First phase of a three-phase supply.', L2: 'Second phase of a three-phase supply.', L3: 'Third phase of a three-phase supply.',
  'DC+': 'Positive side of the DC supply. Look for the + mark.',
  'DC-': 'Negative side of the DC supply. On an isolated output this is separate from mains neutral.',
  control: 'This terminal carries a switch or control signal.',
  output: 'The fitting sends power or a signal out through this terminal.',
};
function ports(ids: string[], roles?: TerminalRole[]): TerminalDefinition[] {
  return ids.map((id, i) => {
    const role: TerminalRole = roles?.[i] ?? (id === 'PE' || id === 'PE2' || id === 'PEOUT' ? 'PE' : id.startsWith('N') ? 'N' : id.startsWith('L3') ? 'L3' : id.startsWith('L2') ? 'L2' : id.startsWith('L1') ? 'L1' : id.startsWith('L') ? 'L' : id === '+' ? 'DC+' : id === '-' ? 'DC-' : 'control');
    const row = Math.floor(i / 4), cols = Math.min(4, ids.length - row * 4);
    return { id, label: id, role, purpose: purpose[role], anchor: [(i % 4 - (cols - 1) / 2) * .25, .26 + row * .27, -.3] };
  });
}
const partText: Record<string, [string,string]> = {
  test: ['Test button · T', 'With the device on and supplied, press T. A small test current trips it.'],
  body: ['Housing', 'The case holds the working parts in place and keeps them apart.'],
  cover: ['Removable cover', 'Lift the cover on the bench to see the connections underneath.'],
  terminals: ['Terminal clamps', 'A clamp holds the bare end of a wire against the metal terminal.'],
  mounting: ['Mounting and fixings', 'These keep the fitting in place. Look for the screws or clips that hold it.'],
  door: ['Outer door', 'Open the door to reach the breaker handles. The front panel still covers the wiring.'],
  shield: ['Removable front panel', 'The openings leave the breaker handles within reach while the panel covers the wires.'],
  rail: ['Device rail', 'Breakers clip onto this metal rail. The wires and bars carry the current.'],
  contacts: ['Contacts', 'These metal faces touch to carry current. Moving them apart opens the switch.'],
  actuator: ['Operating mechanism', 'This part moves the contacts when you use the control.'],
  coil: ['Coil', 'A coil is a length of wound wire. In a relay or contactor, current in the coil pulls the contacts into position.'],
  sensing: ['Sensor', 'This part detects a change, such as a rise in temperature or current.'],
  toroid: ['Current-sensing ring', 'Line and neutral pass through this ring. If some current returns by another route, the device senses the difference and can trip.'],
  thermal: ['Thermal protection', 'A sustained overload heats this part until the protection trips. Trip times in the lab are approximate.'],
  magnetic: ['Magnetic release', 'A large fault current makes this release open the breaker quickly.'],
  rotor: ['Rotor and shaft', 'The rotor is the part that turns. The shaft carries that movement to the machine.'],
  winding: ['Windings', 'These coils of wire create a magnetic field when current flows.'],
  electronics: ['Control board', 'The board takes signals in and controls the outputs. The bench shows what the board does at its terminals.'],
  battery: ['Backup battery', 'The battery can keep the equipment running when the mains supply goes off.'],
  element: ['Heating element', 'Current heats the element. With the same resistance, doubling the voltage gives four times the heating power.'],
  emitter: ['Light source', 'This is the part that gives off light. On the bench it gets brighter as it receives more power.'],
  fuse: ['Fuse and carrier', 'Too much current melts the fuse element and breaks the circuit. The carrier holds the fuse.'],
  isolation: ['Isolated output', 'Measure between the two output terminals. If neither is tied to earth, a reading from one terminal to earth may be unknown.'],
  display: ['Display', 'Read the value or operating state here.'],
  pins: ['Plug and socket contacts', 'The plug pins meet these contacts when the plug goes in. Each has its own job.'],
  probes: ['Test probes', 'Touch the red and black tips to the two points you want to compare. Switch off all simulated supplies before checking resistance or continuity.'],
  sheath: ['Cable sheath and cores', 'The sheath is the outer covering. Inside are separate wires, called cores. Trace each core to see where it goes.'],
};
const handToolParts: Record<string,Record<string,[string,string]>> = {
  forktester:{
    body:['Insulated grip and finger guard','The raised guard separates the hand grip from the open fork.'],
    sensing:['Open fork','Seat one insulated core at the bottom of the fork to measure its AC current or its earth-referenced AC voltage.'],
    display:['Single reading display','The display shows the chosen reading and its unit. HOLD freezes the displayed reading.'],
    actuator:['Function dial','Turn between Off, FieldSense, two-probe voltage, and resistance with continuity.'],
    mode:['Yellow function button','In FieldSense, press to switch the display between amps and volts.'],
    hold:['HOLD button','Freeze the current reading on screen. Release HOLD to record a new observation.'],
    ground:['Rear reference contact','With the black probe docked, the bench can model an earth reference through this contact. A black lead on a bonded earth point is the other reference.'],
    probes:['Attached probes and storage dock','The red and black probes compare two electrical points. The black lead also supplies an explicit earth reference in fork-voltage mode.'],
  },
  stripper:{body:['Insulated handles','The paired handles move the cutting jaws.'],actuator:['Stripping jaws','The cutting edge removes the marked length of insulation.'],mechanism:['Pivot and return spring','The pivot guides the blades and the spring opens the handles after a cut.']},
  crimper:{body:['Crimper grips','Closing the grips drives the crimping die.'],actuator:['Crimping dies','The dies compress the metal sleeve around the prepared conductor.'],mechanism:['Ratchet and pivot','A ratcheting mechanism controls the crimp stroke. The sample checks ferrule size.']},
  torquedriver:{body:['Insulated handle','The driver transmits torque from the grip to the bit.'],actuator:['Torque adjustment','Set the torque specified for the selected terminal before using the driver.'],mechanism:['Insulated shaft and steel tip','The tip engages the terminal screw. The tool releases at its selected torque.']},
};
const defs: ComponentDefinition[] = [];
/** Terminal explanations describe this model's actual branch/contact map.
 * Device IDs stay stable; numbered labels are not a universal manufacturer map. */
function explainTerminal(type:string,t:TerminalDefinition):void {
  const id=t.id;
  const set=(text:string)=>{t.purpose=text;};
  if(type==='shaveroutlet')return set('This is one end of the isolated shaver load. Measure across the two secondary contacts to read the outlet voltage.');
  if(type==='rose') {
    if(id.startsWith('LOOP'))return set('Permanent line loop. Its three entries share one brass terminal. This loop is separate from the two switched lamp-line entries.');
    if(id.startsWith('N'))return set('One of the three joined neutral entries. This block remains separate from the two line groups and the earth block.');
    if(id.startsWith('PE'))return set('Conductor entry at the common protective earth block. Both entries share one clamping screw.');
    return set('One of two joined lamp-line entries, normally carrying the switched line to the pendant.');
  }
  if((type==='socket'||type==='fcu') && (id==='PE'||id==='PE2')) return set('The metal strap joins both earth terminals. Either terminal connects to the same earth path.');
  if(type==='fcu') {
    if(id==='LIN'||id==='NIN') return set((id==='LIN'?'Line':'Neutral')+' coming in from the supply. Look for IN on the back.');
    if(id==='LOUT'||id==='NOUT') return set((id==='LOUT'?'Fused line':'Neutral')+' going to the appliance. Look for LOAD on the back.');
  }
  if(type==='switch')return set(id==='COM'?'Common terminal. The feed comes in here in the lighting lesson. The rocker joins COM to L1.':'In the lighting lesson this wire goes to the lamp. Switching off breaks its connection to COM.');
  if(type==='dimmer')return set(id==='COM'?'Common supply contact. The dimmer changes the effective resistance between COM and OUT in this study model.':'Switched, adjustable output to the lamp. Turn the dial to change the equivalent resistance between COM and OUT.');
  if(type==='switch2')return set(id==='COM'?'Common contact. The rocker connects COM to either L1 or L2.':`Strapper terminal marked ${id==='T1'?'L1':'L2'}. The drawing calls this wire ${id}. Follow it to the other switch.`);
  if((type==='meter'||type==='source'||type==='source3')&&(id==='PE'||id==='PEOUT'))return set('Supply earth. The earth connection runs alongside the meter.');
  if(id==='PE'||id==='PEOUT')return set(`${id==='PEOUT'?'Outgoing earth connection':'Earth connection'} for the fitting. The earth path stays connected when the switch opens.`);
  if(['transformer','driver','dcsupply'].includes(type)&&['+','-'].includes(id)){
    if(type==='transformer'){t.role='output';set(`AC secondary ${id==='+'?'first':'second'} winding end. The ${id} mark identifies a winding end, not fixed DC polarity. Put one probe on each end of the secondary to read its AC voltage.`);}
    else set(`${id==='+'?'Positive output':'Negative output return'} of the isolated DC supply. Measure between + and −. Keep the DC return separate from mains neutral.`);
    return;
  }
  if(type==='led'&&['L','N'].includes(id))return set(`${id==='L'?'Positive LED input':'Negative LED return'} on this low-voltage light. It takes power from the DC driver.`);
  if(type==='chime'&&['L','N'].includes(id))return set(`${id==='L'?'First':'Second'} low-voltage sounder connection. The bell exercises specify an isolated AC winding. The door annunciator uses a DC sounder. Check the device rating before comparing its two terminals.`);
  if(type==='motor3'&&/^[UVW][12]$/.test(id))return set(`${id[0]} winding ${id.endsWith('1')?'start':'end'}, paired with ${id[0]}${id.endsWith('1')?'2':'1'}. Measure between these ends to see what voltage this winding receives with the links in star or delta.`);
  if(['contactor','relay'].includes(type)&&['A1','A2'].includes(id))return set(`Coil ${id==='A1'?'first connection':'return connection'}, paired with ${id==='A1'?'A2':'A1'}. Measure across A1–A2 to see what voltage reaches the coil. The load current flows through separate contacts.`);
  if(type==='contactor'&&['1','2','3','4','5','6'].includes(id)){const odd=Number(id)%2===1,pair=odd?Number(id)+1:Number(id)-1;return set(`${odd?'Incoming':'Outgoing'} side of power-contact pair ${odd?id:pair}–${odd?pair:id}. This pair closes when the contactor operates and opens when it releases. It is separate from the coil and auxiliary contacts.`);}
  if(type==='contactor'&&['13','14'].includes(id))return set(`Normally open auxiliary contacts. When the contactor pulls in, 13 joins 14. Wired across Start, this pair can keep the coil on after you let go.`);
  if(type==='contactor'&&['21','22'].includes(id))return set('Normally closed auxiliary contacts. When the contactor pulls in, 21 separates from 22. In a reversing starter this can keep the other contactor off.');
  if(type==='overload'&&['1','2','3','4','5','6'].includes(id)){const odd=Number(id)%2===1,pair=odd?Number(id)+1:Number(id)-1;return set(`${odd?'Incoming':'Outgoing'} side of motor-current sensing path ${odd?id:pair}–${odd?pair:id}. The overload checks the current through this pair. A trip opens the control contacts 95–96, allowing the contactor to cut the motor supply.`);}
  if(type==='overload'&&['95','96'].includes(id))return set('Normally closed contacts 95–96. An overload trip opens them. When they are wired in series with the coil, the contactor drops out and the motor stops.');
  if(['relay','pushbutton'].includes(type)&&['COM','NO','NC'].includes(id))return set(id==='COM'?'Common connection of the separate changeover contact. This is a supplied contact circuit, not the coil or a neutral reference.':id==='NO'?`Normally open path from COM: closes when ${type==='relay'?'the coil operates':'the button is held pressed'} and opens on release.`:`Normally closed path from COM: opens when ${type==='relay'?'the coil operates':'the button is held pressed'} and closes on release. It can interrupt a maintained request if wired in that request path.`);
  if(type==='selector'&&['COM','A','B'].includes(id))return set(id==='COM'?'Common fed contact selecting A in the first position or B in the second. The two selected paths remain alternative connections.':`Selected contact ${id}: connected to COM in the ${id==='A'?'first':'second'} position. The selector does not energize this path without a real feed to COM.`);
  if(type==='changeover')return set(({A:'First supply active input, selected with AN in position zero.',B:'Alternative supply active input, selected with BN in position one.',AN:'First supply return, paired with input A.',BN:'Alternative supply return, paired with input B.',OUT:'Selected active output, joined to A or B through the interlocked model.',NOUT:'Selected return output, joined to AN or BN with its matching active input.'} as Record<string,string>)[id]+' The unselected pair remains separated; coordinated neutral/earthing design is equipment dependent.');
  if(['timer','sensor','smartrelay'].includes(type)&&['IN','OUT'].includes(id))return set(id==='IN'?'Wired permission input, sensed relative to N. A connected IN path must carry sufficient input voltage before the declared condition/timer can request the output. It is not a dry-contact output.':'Powered switched output from L. Its contact closes only when the controller is supplied and the wired permission, environmental condition and declared delay permit operation. OUT is not isolated from this controller supply.');
  if(['thermostat','cutout'].includes(type)&&['COM','OUT'].includes(id))return set(`${id==='COM'?'Common fed contact':'Controlled output contact'}, paired with ${id==='COM'?'OUT':'COM'}. ${type==='thermostat'?'The ordinary temperature demand opens this pair when the declared setpoint is reached.':'The independent thermal limit latches the pair open after its declared limit is exceeded; reset after restoring an acceptable temperature.'} This contact does not produce its own supply.`);
  if(['valve','valve3'].includes(type)&&['CALL','CH','HW','END'].includes(id))return set(id==='END'?'End-position output: a conceptual auxiliary contact connects permanent L to END after the represented valve reaches the requested operating position. A demand alone does not prove this output is available.':`${id==='CALL'?'Actuator demand':id==='CH'?'Heating demand':'Hot-water demand'} input, sensed relative to N. This requests conceptual valve travel; permanent L/N power and the end-position output are separate functions. Actual manufacturer wire colours and terminal schemes vary.`);
  if(type==='plc'){
    if(['I1','I2'].includes(id))return set(`${id} permissive input sensed relative to N at half the declared control voltage. The selected AND/OR/independent/latch teaching logic combines actual wired input states; it is not a free-floating software checkbox.`);
    if(['COM','Q1','Q2'].includes(id))return set(id==='COM'?'Common supply for both conceptual PLC output contacts. A powered PLC does not supply this terminal automatically; wire the intended output voltage here.':`${id} switched contact from COM. ${id==='Q1'?'Q1 follows the selected logic mode.':'Q2 follows input I2 independently.'} This is a declared contact-output abstraction, not a universal PLC transistor-output wiring scheme.`);
  }
  if(type==='safetyRelay'){
    const map:Record<string,string>={S1:'First wired safety-channel input, sensed relative to N.',S2:'Second wired safety-channel input, independently sensed relative to N.',RESET:'Manual reset request. The model looks for a rising request edge with both channels and pre-start feedback present; reset does not directly start a motor.',FB:'Pre-start contactor feedback input. The represented NC contact must be present before initial arming; it can open normally after the contactor operates.',COM:'Common feed for the represented safety output contact. It needs a real supplied permission path.',OUT:'Switched safety permission from COM, available only while the teaching state machine is armed and both channel conditions remain satisfied.'};
    if(map[id])return set(map[id]+' This conceptual interface does not establish a machinery safety category or performance level.');
  }
  if(type==='vfd'){
    if(['U','V','W'].includes(id)){t.role='output';return set(`${id} variable-frequency motor output of the fundamental three-phase RMS abstraction. Measure between output phases or across the connected winding. It is separate from L1/L2/L3; PWM pulses and motor torque are excluded.`);}
    if(['COM','RUN'].includes(id))return set(id==='COM'?'Return reference for the internally biased conceptual 24 V RUN loop. A dry contact between RUN and COM requests operation. It is not mains neutral or protective earth.':'Internally biased conceptual RUN input. Closing the actual dry-contact path to COM requests output; opening it removes that request. Real drive input polarity and parameter assignments depend on its manufacturer.');
  }
  if(type==='alarm'&&id==='LINK')return set('Conceptual interlink signal terminal. A request propagates only through actual closed conductor/contact paths to other alarm LINK terminals. Its manufacturer-dependent voltage and waveform are excluded; a numeric LINK voltage is not a verified alarm protocol reading.');
  if(type==='emergency'&&id==='SL')return set('Switched normal-illumination request sensed relative to N in maintained mode. Permanent L/N still monitor mains and charging; loss of SL alone does not initiate integral battery operation.');
  if(type==='battery'&&['BL','BN'].includes(id))return set(`${id==='BL'?'Backup active output':'Backup return output'} of the declared isolated AC backup pair. Measure BL–BN; its common-mode voltage to the grid is undetermined without a reference. The external grid switch does not remove this available source.`);
  if(['pv','battery'].includes(type)&&['+','-'].includes(id))return set(`${id==='+'?'Positive':'Negative return'} of the declared isolated DC energy-interface pair. Its availability and limits follow the conceptual energy model; it is not a model of physical PV string design or battery-cell wiring. Grid L/N and backup BL/BN, where present, have different functions.`);
  if(['terminal','junction','neutralbar','earthbar'].includes(type))return set(`Terminal ${id} of this one internally joined ${type==='neutralbar'?'neutral':type==='earthbar'?'protective':'connector'} group. All four numbered terminals share a conductive link; use separate component groups when conductors must remain isolated.`);
  if(type==='proximity')return set(({'+':'Brown lead. Positive DC powers the sensing electronics.','-':'Blue lead. Return to the negative DC supply terminal.','OUT':'Black PNP output. With power and a target present it supplies the load from positive.'} as Record<string,string>)[id]);
  if(type==='pwmcontrol'||type==='cctstrip')return set(id==='+'?'Shared positive DC connection.':id==='-'?'DC supply return for the pulse controller.':(id==='W'?'Warm / single-channel':'Cool channel')+' switched negative connection. Channel power depends on its conducting time.');
  if(type==='floatvalve')return set(id==='COM'?'Common return for both direction inputs.':'Apply the declared supply between '+id+' and COM to request travel in this direction.');
  if(type==='callchime')return set(id.startsWith('AC')?'One side of the continuously supplied AC winding; compare AC1 with AC2.':'Switched call input from the corresponding push, referenced to AC2.');
  if(id==='IN'||id==='OUT')return set(`${id==='IN'?'First':'Second'} end of the modelled ${type==='cable'?'single cable conductor':'series protected path'}, paired with ${id==='IN'?'OUT':'IN'}. ${type==='cable'?'The other visible cutaway cores are explanatory geometry; add independent graph wires for their electrical connections.':'Opening or tripping the device separates this pair.'}`);
  if(/^(L[123]?|N)(IN|OUT)$/.test(id))return set(`${id.endsWith('IN')?'Incoming':'Outgoing'} ${id.replace(/IN|OUT/g,'')} terminal of its separately modelled linked contact path. Pair it with ${id.endsWith('IN')?id.replace(/IN$/,'OUT'):id.replace(/OUT$/,'IN')}. Matching phase/neutral identities matter; mechanical linkage does not join the poles electrically.`);
  if(['L','N'].includes(id)&&['plc','safetyRelay'].includes(type))return set(`${id==='L'?'Declared control-supply input':'Control-supply return reference'} for this powered electronics block. The lesson uses its stated nominal control voltage; the L/N identifiers do not prescribe a 240 V connection.`);
}
function add(type: string, name: string, group: string, model: string, description: string, ids: string[], defaults: Parameters = {}, parts: string[] = [], size: Vec3 = [1.1,1.35,.8], roles?: TerminalRole[], abstraction?: string) {
  const terminals=ports(ids,roles);
  if(['switch','switch2','intermediate','dimmer'].includes(type))terminals.forEach(t=>{t.role='L';t.purpose=t.id==='COM'?'Common line-contact connection. The switch links this terminal to the selected output; it is not a neutral connection.':type==='switch2'?'Traveller connection selected by the common contact. T1/T2 are alternative switch paths, not separate supply phases.':type==='intermediate'?'Strapper connection. The switch either joins the two pairs straight through or crosses them over.':'Controlled line output. Its potential follows the actual contact or dimmer state.';});
  terminals.forEach(t=>explainTerminal(type,t));
  const definition:ComponentDefinition={ type,name,group,model,description,terminals,defaults,parts:['body','cover','terminals','mounting',...parts,...(['rcbo','rcd','rcd3'].includes(type)?['test']:[])].map(id=>({id,name:partText[id]?.[0]??id,purpose:partText[id]?.[1]??'Selectable functional part.'})),size,abstraction };
  if(handToolParts[type])definition.parts=Object.entries(handToolParts[type]).map(([id,[name,purpose]])=>({id,name,purpose}));
  definition.terminals=getComponentTerminals({type,label:name,params:defaults},definition);
  defs.push(definition);
}
const load=['L','N','PE'], pass=['L','N','PE','LOUT','NOUT','PEOUT'];
const poles3=['L1IN','L2IN','L3IN','NIN','L1OUT','L2OUT','L3OUT','NOUT'];
add('source','Single-phase supply','Distribution','supply','Virtual customer supply with explicitly modelled source impedance. The service equipment is a contextual boundary.',load,{sourceResistance:.12},['display']);
add('source3','Three-phase supply','Distribution','supply','Three sinusoidal RMS phases with 120-degree separation; line voltage is the selected industrial supply value.',['L1','L2','L3','N','PE'],{sourceResistance:.12},['display']);
add('meter','Energy meter','Distribution','meter','A supply meter records energy in kilowatt-hours. Its practice display shows the power passing through its own line connection right now, in kilowatts (kW).',pass,{closed:true},['display','electronics']);
add('panel','Distribution enclosure','Distribution','panel','Openable cabinet with DIN rails, conductor bars, circuit labels and a customer-side supply path.',pass,{closed:true},[],[2,1.8,.8]);
add('gammaboard','Two-row domestic consumer unit','Distribution','modular-board','An insulated surface-mounted enclosure with two rows of thirteen module positions. Open the door to operate installed devices. Remove the front to inspect their wiring.',[],{doorOpen:true,frontOff:false},['rail','door','shield'],[5,7.5,2.06]);
add('invictaboard','Three-phase distribution board','Distribution','modular-board','A steel four-way TP&N enclosure with a separate incomer position and two facing banks of outgoing protection. Its removable front shields the wiring. The PE stud is the enclosure bond.',['PE'],{doorOpen:true,frontOff:false},['rail','door','shield'],[9.30,10,2.65],['PE']);
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
add('socket','Domestic socket outlet','Accessories','socket','A double socket with an appliance plugged into the circuit. Both earth terminals share one metal strap.',['L','N','PE','PE2'],{watts:100,closed:true},['pins'],[1.465,.92,.4]);
add('socket3','Industrial five-pole socket','Accessories','socket','Separate phase, neutral and protective contacts for industrial equipment.',['L1','L2','L3','N','PE'],{watts:900},['pins'],[1.2,1.2,1]);
add('plug','Fused domestic plug','Accessories','plug','Three-pin plug with a separate line fuse and cord grip.',pass,{closed:true,currentRating:13},['pins','fuse','sheath']);
add('plug3','Industrial plug','Accessories','plug','Five-pin industrial plug with separately identified contacts.',['L1IN','L2IN','L3IN','NIN','PE','L1OUT','L2OUT','L3OUT','NOUT','PEOUT'],{closed:true},['pins','sheath']);
add('junction','Junction box','Accessories','junction','A four-way connector group. Each instance is one joined electrical group.',['1','2','3','4'],{},[],[1,.7,.8]);
add('rose','Ceiling rose connector','Accessories','junction','A spin-on pendant rose groups the neutral, permanent line loop, switched lamp line and protective conductors separately.',[...pass,'N3','LOOP1','LOOP2','LOOP3'],{closed:true},[],[1,.90,.8]);
add('shaveroutlet','Shaver outlet · isolated 230 V side','Accessories','socket','A two-pin shaver outlet with a small shaver load connected. The transformer inside the supply unit is shown separately on the workbench.',['L','N'],{watts:15,ratedVoltage:230,doubleInsulated:true,classII:true},['pins'],[.86,1.52,.40],['output','output'],'The lesson uses the 230 V pair. The second plug position and its interlock are shown for recognition. The two secondary connections are exposed for study.');
add('fcu','Switched fused connection unit','Accessories','socket','A switch and fuse for a fixed appliance. IN is the supply side. LOAD goes to the appliance.',['LIN','NIN','LOUT','NOUT','PE','PE2'],{closed:true,currentRating:13,resetToken:0},['actuator','contacts','fuse'],[.86,.92,.4]);
add('switch','One-way switch','Lighting','switch','A maintained contact makes or breaks the line path.',['COM','OUT'],{closed:true},['actuator','contacts']);
add('switch2','Two-way switch','Lighting','switch','The common terminal selects one of two travellers.',['COM','T1','T2'],{position:0,closed:true},['actuator','contacts']);
add('intermediate','Intermediate switch','Lighting','switch','Selects straight-through or crossed traveller connections.',['A','B','C','D'],{position:0,closed:true},['actuator','contacts']);
add('dimmer','Lighting dimmer','Lighting','switch','Changes an equivalent series resistance in the line path; the actual load and connections determine lamp voltage and brightness.',['COM','OUT'],{closed:true,level:.65,referenceOhms:960},['actuator','electronics'],undefined,undefined,'Educational series resistance: R = referenceOhms × (1/level − 1) + 0.001 Ω. Zero or switched-off settings open the path. The 960 Ω reference corresponds to 240 V / 60 W. Real electronic dimmers control waveforms; equivalent resistor losses are not their hardware heating or a compatibility prediction.');
add('lamp','Luminaire','Lighting','lamp','An illustrative resistive lamp load with animated illumination.',load,{watts:60,nominalVoltage:240},['emitter','contacts','pins','electronics'],[1,1.3,1]);
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
add('fan','Fan','Machinery','fan','Motor-driven ventilation with operating animation.',load,{watts:30,nominalVoltage:240},['rotor','winding','electronics'],[1.2,1.3,1]);
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
add('chime','Doorbell chime','Safety','alarm','A low-voltage sounder controlled by a separate pushbutton.',['L','N'],{watts:3,nominalVoltage:12},['coil','actuator'],[1,.9,.8],['output','output']);
add('emergency','Emergency luminaire','Safety','lamp','Monitors a mains supply, charges a battery and changes operation on supply loss.',['L','N','PE','SL'],{watts:8,nominalVoltage:240,battery:true,maintained:false},['emitter','battery','electronics'],[1.6,.9,.7]);
add('ev','EV charging equipment','Energy','charger','Packaged charging load with an external permission abstraction.',load,{watts:1800,nominalVoltage:240,on:true},['electronics','display'],[1.3,1.8,.8],undefined,'EV protection and communication are equipment dependent; this does not model every charging protocol.');
add('pv','PV grid inverter','Energy','inverter','Controlled generation at the AC interface, limited by solar availability.', ['L','N','PE','+','-'],{generation:600,on:true,efficiency:.95,availability:1},['electronics','display'],[1.4,1.7,.8],undefined,'A grid-presence teaching rule prevents arbitrary stand-alone operation; inverter certification is not simulated.');
add('battery','Battery / backup inverter','Energy','inverter','Stored energy can supply an isolated backup output through coordinated control.',['L','N','PE','+','-','BL','BN'],{generation:0,on:true,soc:80,capacityWh:2000,outputVoltage:240,efficiency:.9},['battery','electronics','display'],[1.4,1.9,1]);
add('cable','Cable section','Accessories','cable','A selectable cable cutaway showing the sheath and insulated cores.',['IN','OUT'],{closed:true},['sheath'],[1.5,.5,.7],undefined,'The IN–OUT pair models one conductor only. The other visible cores are explanatory geometry; add separate terminal connections for each conductor in a circuit.');
add('conduit','Conduit / gland assembly','Accessories','conduit','Containment and strain relief; it is not itself an electrical conductor.',[],{},['sheath'],[1.5,.5,.7]);
add('multimeter','Virtual multimeter','Instruments','instrument','Voltage and resistance probes read the solver rather than recorded values.',[],{mode:'voltage'},['display','actuator','probes'],[1,1.6,.6]);
add('clamp','Virtual current clamp','Instruments','instrument','The clamp reads a selected conductor current.',[],{mode:'current'},['display','sensing','actuator'],[1,1.7,.6]);
add('forktester','Open-fork tester · T6-600 study model','Instruments','instrument','Compare two probe points or put the open fork around one insulated AC conductor.',[],{},['display','sensing','actuator','mode','hold','ground','probes'],[.51,2,.46]);
add('stripper','Wire stripper','Instruments','instrument','Remove insulation to the strip length marked for the chosen termination.',[],{},['actuator','mechanism'],[.62,1.21,.22]);
add('crimper','Ferrule crimper','Instruments','instrument','Compress a correctly sized ferrule around a prepared stranded conductor.',[],{},['actuator','mechanism'],[.62,1.21,.22]);
add('torquedriver','Adjustable torque screwdriver','Instruments','instrument','Tighten a screw terminal to the value specified for the selected product.',[],{},['actuator','mechanism'],[.24,1.24,.24]);
add('pwmcontrol','Low-voltage pulse controller','Lighting','controller','Changes strip brightness by switching a DC return for a fraction of each cycle.',['+','-','W','C'],{level:.5,mix:.5,on:true},['actuator','electronics'],[1.15,.6,.55],['DC+','DC-','control','control'],'Duty-weighted steady states model average power and current. Switching frequency, edge shape and EMC are outside the model.');
add('cctstrip','Warm / cool tape','Lighting','lamp','Two independently switched LED channels share one positive pad.',['+','W','C'],{ratedVoltage:24,channelWatts:12},['emitter','electronics'],[2.1,.9,.32],['DC+','control','control'],'The resistive operating-point model estimates channel power and relative brightness. It does not predict colour temperature or photometry.');
add('callchime','Two-input AC door chime','Safety','alarm','Separate front and rear inputs select a distinct call indication when the AC supply is available.',['AC1','AC2','FRONT','REAR'],{ratedVoltage:12},['electronics','actuator'],[1.1,.95,.6],['output','output','control','control']);
add('floatvalve','Three-point valve actuator','Heating','valve','Apply a command to OPEN or CLOSE against COM. Removing both commands holds the valve position.',['COM','OPEN','CLOSE'],{ratedVoltage:24,travel:4},['actuator','mechanism'],[1.15,1.25,.8],['DC-','control','control'],'Travel time is shortened for practice. Conflicting commands inhibit movement.');
add('proximity','Three-wire PNP proximity sensor','Controls','sensor','A powered DC sensor sources current on its output when the target is near.',['+','OUT','-'],{ratedVoltage:24,minVoltage:10,maxVoltage:30,active:false},['sensing','electronics'],[.74,1.65,.74],['DC+','control','DC-'],'Normally open PNP operating model. Detection distance and switching transients are outside the model.');
// Physical forms share stable electrical terminals and differ only in presentation.
const physicalForms:Record<string,{id:string;name:string}[]>={
  pwmcontrol:[{id:'single-channel',name:'Single-channel PWM'},{id:'tunable-white',name:'Warm / cool controller'}],
  led:[{id:'strip',name:'Constant-voltage strip'},{id:'series-module',name:'Series downlight module'}],
  switch:[{id:'door-contact',name:'Door-operated contact'}],selector:[{id:'float-changeover',name:'Changeover float switch'}],
  pushbutton:[{id:'bell-push',name:'Doorbell push'}], driver:[{id:'constant-current',name:'350 mA driver'}],
  terminal:[{id:'lever-connector',name:'Lever connector'},{id:'comb-busbar',name:'Insulated single-phase comb'}], fuse:[{id:'dc-fuse',name:'DC branch carrier'}],
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

/** Changing the actual material also selects its declared electrical specification.
 * Geometry-only variants never alter saved settings or terminal endpoints. */
export function applyEquipmentVariant(item:ComponentInstance,variant:string|undefined):ComponentInstance{
  if(item.variant===variant)return item;
  let params=item.params;
  if(item.type==='driver'&&(variant==='constant-current'||item.variant==='constant-current')){
    params=variant==='constant-current'
      ?{...params,mode:'constant-current',outputCurrent:.35,outputVoltage:30,maxPower:15}
      :{...params,mode:'constant-voltage',outputVoltage:24,maxPower:120};
  }else if(item.type==='led'&&(variant==='strip'||variant==='series-module'||item.variant==='series-module')){
    const series=variant==='series-module';
    params={...params,ratedVoltage:series?9:24,watts:series?3.15:12};
  }
  return {...item,variant,params};
}
