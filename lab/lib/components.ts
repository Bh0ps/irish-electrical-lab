import { dinDimensions, dinForm } from './din-devices.ts';
import type { CircuitDocument, ComponentDefinition, ComponentInstance, TerminalDefinition, TerminalRole, Parameters, Vec3 } from './types';
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
    body:['Grip and finger guard','The raised rim below the fork marks the top of the hand grip.'],
    sensing:['Open fork','Rest one insulated wire at the bottom of the fork. The fork reads AC.'],
    display:['Display','The screen shows one reading at a time. V means volts, A means amps and Ω means ohms.'],
    actuator:['Rotary dial','Turn the dial to V for the probes, the fork symbol for one AC wire, or Ω for resistance.'],
    mode:['Yellow button','With the dial on the fork symbol, press here to switch between amps and volts.'],
    hold:['HOLD','Press once to keep the number on screen. Press again to see the live reading.'],
    backlight:['Display light','Press to light the screen. Press again to turn the light off.'],
    ground:['Rear contact pad','In the lab, touching this pad gives the fork an earth reference with the black probe in its holder.'],
    probes:['Test probes','The tips point up in their holders. Put one probe on each point to read the voltage between them.'],
  },
  stripper:{body:['Insulated handles','Squeeze the handles to close the jaws around the wire.'],actuator:['Stripping jaws','The jaws cut the insulation so you can pull the end off and leave the copper bare.'],mechanism:['Pivot and return spring','Let go and the spring opens the jaws again.']},
  crimper:{body:['Crimper grips','Squeeze the handles to close the jaws around the sleeve.'],actuator:['Crimping dies','The shaped jaws squeeze the metal sleeve onto the strands of wire.'],mechanism:['Ratchet and pivot','The ratchet holds the handles as you squeeze. In this exercise, choose a sleeve that fits the wire.']},
  torquedriver:{body:['Insulated handle','Turn the handle to tighten the screw.'],actuator:['Torque adjustment','Set the driver to the torque marked for this terminal. Torque tells you how much turning force to use.'],mechanism:['Insulated shaft and steel tip','The tip fits the terminal screw. When you reach the setting, the driver releases.']},
};
const equipmentParts: Record<string,Record<string,[string,string]>> = {
  chime: {
    coil: ['Chime coil','Current in the coil pulls a small metal striker towards one of the bars.'],
    actuator: ['Striker and spring','The striker taps the bar. The spring brings it back when the button is released.'],
  },
  transformer: {
    winding: ['Primary and secondary windings','The mains feeds the first coil, called the primary. The second coil supplies the bell or shaver circuit. The two coils have no wire joining them.'],
  },
  dimmer: {
    actuator: ['Dimmer knob','Turn the knob down and watch the lamp. You can check how much its power drops in watts.'],
  },
  multimeter: {
    actuator: ['Meter dial','Choose volts to compare two terminals. Choose ohms to check resistance with the simulated supplies off.'],
  },
  clamp: {
    sensing: ['Clamp jaws','The jaws sense the magnetic field around a wire. With the supply and return together, their fields can cancel.'],
    actuator: ['Jaw trigger','Squeeze the trigger to open the jaws. The current reading is for the wire inside them.'],
  },
  floatvalve: {
    mechanism: ['Valve drive','The drive moves the valve towards open or closed. With both direction wires off, the valve stays where it is.'],
  },
};
const defs: ComponentDefinition[] = [];
/** Terminal explanations describe this model's actual branch/contact map.
 * Device IDs stay stable; numbered labels are not a universal manufacturer map. */
function explainTerminal(type:string,t:TerminalDefinition):void {
  const id=t.id;
  const set=(text:string)=>{t.purpose=text;};
  const breaker=dinForm(type);
  if(breaker){
    const top=breaker.upper.includes(id);
    const index=(top?breaker.upper:breaker.lower).indexOf(id);
    if(index>=0){
      const mark=(top?breaker.upperMark:breaker.lowerMark)[index];
      const other=(top?breaker.lowerMark:breaker.upperMark)[index];
      const conductor=id.startsWith('N')?'neutral':/^L[123]/.test(id)?'phase '+id[1]:'line';
      return set(top
        ? 'Top '+mark+' takes the '+conductor+' feed in this circuit. With the handle on, it connects to the bottom terminal marked '+other+'.'
        : 'Bottom '+mark+' carries '+conductor+' out to the circuit. Switching off breaks its connection to the top terminal marked '+other+'.');
    }
  }
  if(type==='shaveroutlet')return set('This is one end of the isolated shaver load. Measure across the two secondary contacts to read the outlet voltage.');
  if(type==='rose') {
    if(id.startsWith('LOOP'))return set('These three LOOP holes share one brass block. The feed stays on here when you switch the lamp off.');
    if(id.startsWith('N'))return set('All three N holes share one block. This is where the neutral wires meet.');
    if(id.startsWith('PE'))return set('The two earth wires go into the same block. One screw clamps both entries.');
    return set('These two holes are joined. In this circuit the wire from the switch meets the wire to the lamp here.');
  }
  if((type==='socket'||type==='fcu') && (id==='PE'||id==='PE2')) return set('The metal strap joins both earth terminals. Either terminal connects to the same earth path.');
  if(type==='fcu') {
    if(id==='LIN'||id==='NIN') return set((id==='LIN'?'Line':'Neutral')+' coming in from the supply. Look for IN on the back.');
    if(id==='LOUT'||id==='NOUT') return set((id==='LOUT'?'Fused line':'Neutral')+' going to the appliance. Look for LOAD on the back.');
  }
  if(type==='switch')return set(id==='COM'?'Common terminal. The feed comes in here in the lighting lesson. The rocker joins COM to L1.':'In the lighting lesson this wire goes to the lamp. Switching off breaks its connection to COM.');
  if(type==='dimmer')return set(id==='COM'?'COM is the bench name for this hole. In this lesson the feed comes in here. Either hole can take the feed on this dimmer.':'OUT is the bench name for the hole used for the lamp wire. Turn the knob down and watch the lamp.');
  if(type==='switch2')return set(id==='COM'?'Common contact. The rocker connects COM to either L1 or L2.':`Strapper terminal marked ${id==='T1'?'L1':'L2'}. The drawing calls this wire ${id}. Follow it to the other switch.`);
  if(type==='intermediate'){
    const straight:Record<string,string>={A:'C',B:'D',C:'A',D:'B'};
    const crossed:Record<string,string>={A:'D',B:'C',C:'B',D:'A'};
    return set('Follow '+id+' through this switch. In the straight position it joins '+straight[id]+'. Flick the rocker and it joins '+crossed[id]+'. The letters tell the four holes apart on the bench.');
  }
  if((type==='meter'||type==='source'||type==='source3')&&(id==='PE'||id==='PEOUT'))return set('Supply earth. The earth connection runs alongside the meter.');
  if(id==='PE'||id==='PEOUT')return set(`${id==='PEOUT'?'Outgoing earth connection':'Earth connection'} for the fitting. The earth path stays connected when the switch opens.`);
  if(['transformer','driver','dcsupply'].includes(type)&&['+','-'].includes(id)){
    if(type==='transformer'){t.role='output';set(`AC secondary, marked SEC ${id==='+'?'1':'2'}. These are the two ends of the output winding. Use AC volts and put one probe on SEC 1 and one on SEC 2.`);}
    else set(`${id==='+'?'Positive output':'Negative output return'} of the isolated DC supply. Measure between + and −. Keep the DC return separate from mains neutral.`);
    return;
  }
  if(type==='led'&&['L','N'].includes(id))return set(`${id==='L'?'Positive LED input':'Negative LED return'} on this low-voltage light. It takes power from the DC driver.`);
  if(type==='chime'&&['L','N'].includes(id))return set(`${id==='L'?'First':'Second'} connection on the sounder. The bell lessons use AC from a transformer. The door alarm uses DC. Look at the supply marking before choosing a meter setting.`);
  if(type==='motor3'&&/^[UVW][12]$/.test(id))return set(`${id[0]} winding ${id.endsWith('1')?'start':'end'}, paired with ${id[0]}${id.endsWith('1')?'2':'1'}. Measure between these ends to see what voltage this winding receives with the links in star or delta.`);
  if(['contactor','relay'].includes(type)&&['A1','A2'].includes(id))return set(`One end of the coil. Measure across A1–A2 to see what voltage reaches it. The load has its own contacts.`);
  if(type==='contactor'&&['1','2','3','4','5','6'].includes(id)){const odd=Number(id)%2===1,pair=odd?Number(id)+1:Number(id)-1;return set(`${odd?'Incoming':'Outgoing'} side of the main contacts ${odd?id:pair}–${odd?pair:id}. When the coil pulls in, these two terminals join and can carry the load current.`);}
  if(type==='contactor'&&['13','14'].includes(id))return set(`Normally open auxiliary contacts. When the contactor pulls in, 13 joins 14. Wired across Start, this pair can keep the coil on after you let go.`);
  if(type==='contactor'&&['21','22'].includes(id))return set('Normally closed auxiliary contacts. When the contactor pulls in, 21 separates from 22. In a reversing starter this can keep the other contactor off.');
  if(type==='overload'&&['1','2','3','4','5','6'].includes(id)){const odd=Number(id)%2===1,pair=odd?Number(id)+1:Number(id)-1;return set(`${odd?'Incoming':'Outgoing'} side of ${odd?id:pair}–${odd?pair:id}. The overload checks motor current here. If it trips, 95–96 open. In the starter lesson that cuts power to the coil.`);}
  if(type==='overload'&&['95','96'].includes(id))return set('Normally closed contacts 95–96. An overload trip opens them. When they are wired in series with the coil, the contactor drops out and the motor stops.');
  if (['relay','pushbutton'].includes(type) && ['COM','NO','NC'].includes(id)) {
    const operated = type === 'relay' ? 'the coil is on' : 'you hold the button down';
    if (id === 'COM') return set('Common terminal. Moving the contact joins COM to either NC or NO.');
    return set(id === 'NO' ? 'Normally open. NO joins COM while ' + operated + '.'
      : 'Normally closed. NC joins COM at rest. It opens while ' + operated + '.');
  }
  if (type==='selector' && ['COM','A','B'].includes(id)) return set(id==='COM' ? 'The feed comes into COM. The selector sends it to A or B.' : id+' joins COM in the '+(id==='A'?'first':'second')+' position.');
  if (type==='changeover') {
    const names: Record<string,string> = {A:'Line from the first supply. The switch selects A and AN together.',B:'Line from the second supply. The switch selects B and BN together.',AN:'Return for the first supply, paired with A.',BN:'Return for the second supply, paired with B.',OUT:'Line out to the load. It comes from the supply you select.',NOUT:'Return from the load. The switch joins it to the return of the selected supply.'};
    if (names[id]) return set(names[id]);
  }
  if (['timer','sensor','smartrelay'].includes(type) && ['IN','OUT'].includes(id)) return set(id==='IN' ? 'Control input. Measure from IN to N to see whether the control signal reaches this fitting.' : 'Switched output. When the control operates, it connects L to OUT. This output uses the same supply as the fitting.');
  if (['thermostat','cutout'].includes(type) && ['COM','OUT'].includes(id)) return set((id==='COM'?'Feed into the switch. ':'Switched feed out. ')+(type==='thermostat'?'When the thermostat calls for heat, COM joins OUT.':'If the temperature limit is reached, the cut-out opens and stays open until reset.'));
  if (['valve','valve3'].includes(type) && ['END','CALL','CH','HW'].includes(id)) return set(id==='END'?'End switch. It passes L to END once the valve reaches the position needed for the call.':(id==='CALL'?'Valve':id==='CH'?'Heating':'Hot-water')+' call. Measure from this terminal to N to check the signal. The motor also needs its supply.');
  if (type==='plc') {
    if (['I1','I2'].includes(id)) return set('Wired input. Measure '+id+' to N to check the signal. This controller reads it as on above half its control voltage.');
    if (id==='COM') return set('Feed for the output contacts. The controller has its own power supply. COM needs a feed of its own.');
    if (['Q1','Q2'].includes(id)) return set(id+' passes the feed from COM when the contact closes. '+(id==='Q1'?'The program decides when Q1 closes.':'Q2 follows input I2.'));
  }
  if (type==='safetyRelay') {
    const contacts: Record<string,string> = {S1:'First safety input. The relay checks S1 and S2 separately against N.',S2:'Second safety input. Opening either input drops the output.',RESET:'Press reset after both inputs and the feedback contact are ready. The machine needs a separate Start command.',FB:'Feedback from the normally closed contact on the contactor. It must be closed before reset.',COM:'Feed for the output contact. Trace the wire bringing power here.',OUT:'Switched feed from COM. Opening a safety input cuts this feed.'};
    if (contacts[id]) return set(contacts[id]);
  }
  if (type==='vfd') {
    if (['U','V','W'].includes(id)) { t.role='output'; return set('Motor output '+id+'. Measure between two motor outputs or across one winding. The bench shows the main AC voltage at the drive frequency.'); }
    if (id==='COM') return set('Return for the drive’s own 24 V control circuit. The run switch joins RUN to COM.');
    if (id==='RUN') return set('Closing a switch between RUN and COM tells the drive to run. The drive supplies this control circuit itself.');
  }
  if (type==='alarm' && id==='LINK') return set('This wire carries the alarm signal to the other alarm. Trigger one and watch the LINK indicator on the other. The bench does not give a voltage reading for this signal.');
  if (type==='emergency' && id==='SL') return set('Switched line for normal lighting. The permanent supply at L and N keeps the battery on standby even when SL is off.');
  if (type==='battery' && ['BL','BN'].includes(id)) return set('Backup AC '+(id==='BL'?'line':'return')+'. Measure between BL and BN. The battery can keep this pair live when the mains is off.');
  if (['pv','battery'].includes(type) && ['+','-'].includes(id)) return set((id==='+'?'Positive':'Negative')+' side of the DC supply. Measure across + and −. The grid side uses L and N.');
  if (['terminal','junction','neutralbar','earthbar'].includes(type)) return set('Terminal '+id+'. All four holes on this block share a metal link. Wires connected here meet inside the block.');
  if(type==='proximity')return set(({'+':'Brown supplies power to the sensor. It goes to DC positive.','-':'Blue returns to the negative terminal of the DC supply.','OUT':'Black is the output. When the powered sensor sees metal, it connects this wire to positive. That is what PNP means here.'} as Record<string,string>)[id]);
  if(type==='pwmcontrol'||type==='cctstrip')return set(id==='+'?'Shared positive DC connection.':id==='-'?'This wire goes back to the negative side of the DC supply.':(id==='W'?'W is the return for the warm LEDs, or for the single strip.':'C is the return for the cool LEDs.')+' The controller switches this wire on and off to set the brightness.');
  if(type==='floatvalve')return set(id==='COM'?'Common return for both direction inputs.':'On this bench, a supply across '+id+' and COM tells the valve to '+(id==='OPEN'?'open.':'close.'));
  if(type==='callchime'){
    if(id==='AC1')return set('One wire from the bell transformer comes here. Put the other probe on AC2 to check the AC supply, even with both buttons released.');
    if(id==='AC2')return set('This wire goes back to the transformer. Leave one probe here to check the supply at AC1 or a button at FRONT or REAR.');
    return set('Hold the '+(id==='FRONT'?'front':'back')+' door button and measure from '+id+' to AC2. If its wire and the supply are sound, you should see the bell supply voltage.');
  }
  if (id==='IN' || id==='OUT') {
    const other = id==='IN'?'OUT':'IN';
    return set(type==='cable' ? 'One end of the wire in the cutaway. Follow it to '+other+'. The other cores in this sample are for display.'
      : 'Paired with '+other+'. Opening this device breaks the connection between IN and OUT.');
  }
  if (/^(L[123]?|N)(IN|OUT)$/.test(id)) {
    const incoming = id.endsWith('IN'), pole = id.replace(/IN|OUT/g,'');
    const other = pole+(incoming?'OUT':'IN');
    if (type==='meter') return set((incoming?'Supply side':'Load side')+' of the meter. Follow '+pole+' through to '+other+'.');
    return set((incoming?'Incoming ':'Outgoing ')+(pole==='N'?'neutral':pole)+' terminal. Follow it to '+other+' on the other side of the same pole.');
  }
  if (['L','N'].includes(id) && ['plc','safetyRelay'].includes(type)) return set(id==='L'?'Power for the controls. Check the voltage on this unit. These lessons use 24 V.':'Return for the control supply. Measure from L to N to check the supply voltage.');
}
function add(type: string, name: string, group: string, model: string, description: string, ids: string[], defaults: Parameters = {}, parts: string[] = [], size: Vec3 = [1.1,1.35,.8], roles?: TerminalRole[], abstraction?: string) {
  const terminals=ports(ids,roles);
  if(['switch','switch2','intermediate','dimmer'].includes(type))terminals.forEach(t=>{t.role='L';});
  terminals.forEach(t=>explainTerminal(type,t));
  const definition:ComponentDefinition={ type,name,group,model,description,terminals,defaults,parts:['body','cover','terminals','mounting',...parts,...(['rcbo','rcd','rcd3'].includes(type)?['test']:[])].map(id=>{
    const [name,purpose]=equipmentParts[type]?.[id]??partText[id]??[id,''];
    return {id,name,purpose};
  }),size,abstraction };
  if(handToolParts[type])definition.parts=Object.entries(handToolParts[type]).map(([id,[name,purpose]])=>({id,name,purpose}));
  definition.terminals=getComponentTerminals({type,label:name,params:defaults},definition);
  defs.push(definition);
}
const load=['L','N','PE'], pass=['L','N','PE','LOUT','NOUT','PEOUT'];
const poles3=['L1IN','L2IN','L3IN','NIN','L1OUT','L2OUT','L3OUT','NOUT'];
add('source','Single-phase supply','Distribution','supply','This is where power enters the bench. Follow the line, neutral and earth from here.',load,{sourceResistance:.12},['display']);
add('source3','Three-phase supply','Distribution','supply','The three line terminals are L1, L2 and L3. At the 400 V setting, expect about 230 V from any one of them to neutral.',['L1','L2','L3','N','PE'],{sourceResistance:.12},['display']);
add('meter','Energy meter','Distribution','meter','A supply meter records energy in kilowatt-hours. Its practice display shows the power passing through its own line connection right now, in kilowatts (kW).',pass,{closed:true},['display','electronics']);
add('panel','Distribution enclosure','Distribution','panel','Open the door to reach the breakers. Behind the front panel are the rails, wires and terminal bars.',pass,{closed:true},[],[2,1.8,.8]);
add('gammaboard','Two-row domestic consumer unit','Distribution','modular-board','This board has two rows of 13 spaces. Open the door to reach the breaker handles. Lift the front panel on the bench to see where the wires go.',[],{doorOpen:true,frontOff:false},['rail','door','shield'],[5,7.5,2.06]);
add('invictaboard','Three-phase distribution board','Distribution','modular-board','This steel board has a main supply position and two facing rows of breakers. The earth wire connects to the stud marked PE on the case.',['PE'],{doorOpen:true,frontOff:false},['rail','door','shield'],[9.30,10,2.65],['PE']);
add('terminal','Terminal block','Distribution','bar','The numbered holes in this block are joined inside. Two wires in the same block share a connection.',['1','2','3','4'],{},[],[1,.5,.7]);
add('neutralbar','Neutral bar','Distribution','bar','The neutral wires meet on this metal bar. The earth wires have their own bar.',['1','2','3','4'],{},[],[1,.5,.7],['N','N','N','N']);
add('earthbar','Protective-earth bar','Distribution','bar','The earth wires from the fittings meet on this metal bar. It connects them back to the supply earth.',['1','2','3','4'],{},[],[1,.5,.7],['PE','PE','PE','PE']);
add('mcb','Miniature circuit breaker','Protection','protection','A circuit breaker trips if too much current flows. A heavy fault can trip it quickly. A smaller overload can take longer.',['IN','OUT'],{closed:true,currentRating:16,resetToken:0},['actuator','contacts','thermal','magnetic'],dinDimensions('mcb'),['L','L']);
add('mcb3','Linked three-pole breaker','Protection','protection','One handle switches all three phases. If a fault trips one pole, all three open together.',['L1IN','L2IN','L3IN','L1OUT','L2OUT','L3OUT'],{closed:true,currentRating:16,resetToken:0},['actuator','contacts','thermal','magnetic'],dinDimensions('mcb3'));
add('fuse','Fuse holder','Protection','protection','Too much current melts the thin metal link inside the fuse and opens the circuit.',['IN','OUT'],{closed:true,currentRating:13,resetToken:0},['fuse'],[.7,1.3,.8],['L','L']);
add('rcd','Residual-current circuit breaker','Protection','protection','This device compares the current in line and neutral. If some returns another way, it can trip. A separate breaker or fuse protects against overload.',['LIN','NIN','LOUT','NOUT'],{closed:true,tripMa:30,resetToken:0},['actuator','contacts','toroid'],dinDimensions('rcd'));
add('rcbo','Combined RCBO','Protection','protection','This breaker protects one circuit. It can trip on too much current or when some current returns by another path.',['LIN','NIN','LOUT','NOUT'],{closed:true,currentRating:16,tripMa:30,resetToken:0},['actuator','contacts','toroid','thermal','magnetic'],dinDimensions('rcbo'));
add('rcd3','Four-pole RCD','Protection','protection','All three phases and neutral pass through this device. It can trip if some current returns outside those wires.',poles3,{closed:true,tripMa:30,resetToken:0},['actuator','contacts','toroid'],dinDimensions('rcd3'));
add('spd','Surge-protection device','Protection','protection','A surge protector gives a sudden voltage spike a path away from the load. In normal use it draws very little current.',load,{healthy:true},['electronics'],[.8,1.3,.8],undefined,'You can check the wiring and the condition indicator. The bench does not reproduce a lightning surge.');
add('isolator','Double-pole isolator','Protection','switch','One handle disconnects both line and neutral.',['LIN','NIN','LOUT','NOUT'],{closed:true},['actuator','contacts']);
add('isolator3','Four-pole isolator','Protection','switch','One handle disconnects all three phases and neutral.',poles3,{closed:true},['actuator','contacts'],[1.5,1.2,.8]);
add('changeover','Interlocked changeover','Protection','switch','The handle selects which supply feeds the load. The two supplies stay separate.',['A','B','OUT','AN','BN','NOUT'],{position:0,closed:true},['actuator','contacts']);
add('socket','Domestic socket outlet','Accessories','socket','A double socket with an appliance plugged into the circuit. Both earth terminals share one metal strap.',['L','N','PE','PE2'],{watts:100,closed:true},['pins'],[1.465,.92,.4]);
add('socket3','Industrial five-pole socket','Accessories','socket','This socket has three line contacts, a neutral and an earth. Read the markings at the back to tell them apart.',['L1','L2','L3','N','PE'],{watts:900},['pins'],[1.2,1.2,1]);
add('plug','Fused domestic plug','Accessories','plug','Three-pin plug with a separate line fuse and cord grip.',pass,{closed:true,currentRating:13},['pins','fuse','sheath']);
add('plug3','Industrial plug','Accessories','plug','This industrial plug has five pins. Look for L1, L2, L3, N and the earth marking.',['L1IN','L2IN','L3IN','NIN','PE','L1OUT','L2OUT','L3OUT','NOUT','PEOUT'],{closed:true},['pins','sheath']);
add('junction','Junction box','Accessories','junction','All four holes in this connector are joined. Use another block for wires that need to stay separate.',['1','2','3','4'],{},[],[1,.7,.8]);
add('rose','Ceiling rose connector','Accessories','junction','The ceiling rose has separate groups for neutral, permanent line, switched line and earth. The pendant takes its feed from the switched line.',[...pass,'N3','LOOP1','LOOP2','LOOP3'],{closed:true},[],[1,.90,.8]);
add('shaveroutlet','Shaver outlet · isolated 230 V side','Accessories','socket','A two-pin shaver outlet with a small shaver load connected. The transformer inside the supply unit is shown separately on the workbench.',['L','N'],{watts:15,ratedVoltage:230,doubleInsulated:true,classII:true},['pins'],[.86,1.52,.40],['output','output'],'The lesson uses the 230 V pair. The second plug position and its interlock are shown for recognition. The two secondary connections are exposed for study.');
add('fcu','Switched fused connection unit','Accessories','socket','A switch and fuse for a fixed appliance. IN is the supply side. LOAD goes to the appliance.',['LIN','NIN','LOUT','NOUT','PE','PE2'],{closed:true,currentRating:13,resetToken:0},['actuator','contacts','fuse'],[.86,.92,.4]);
add('switch','One-way switch','Lighting','switch','The rocker joins two contacts to turn the lamp on. Flick it back and the contacts open.',['COM','OUT'],{closed:true},['actuator','contacts']);
add('switch2','Two-way switch','Lighting','switch','The rocker joins COM to one of two wires. These wires between the switches are called strappers.',['COM','T1','T2'],{position:0,closed:true},['actuator','contacts']);
add('intermediate','Intermediate switch','Lighting','switch','The two strappers pass through this switch. Flick the rocker and the wires swap over, changing the path to the lamp.',['A','B','C','D'],{position:0,closed:true},['actuator','contacts']);
add('dimmer','Lighting dimmer','Lighting','switch','Turn the knob to brighten or dim the reading lamp.',['COM','OUT'],{closed:true,level:.65,referenceOhms:960},['actuator','electronics'],[.85,.91,.44],undefined,'The bench uses a resistor to dim the lamp. Its resistance in ohms is 960 × (1/level − 1) + 0.001 at the default setting, with level between 0 and 1. At zero or when switched off, the circuit opens. The 960 Ω value comes from a 60 W lamp at 240 V. A real electronic dimmer switches part of each AC cycle. Use the maker’s figures for lamp compatibility and heat.');
add('lamp','Luminaire','Lighting','lamp','The lamp gets brighter as it draws more power. Measure from L to N to check the voltage across it.',load,{watts:60,nominalVoltage:240},['emitter','contacts','pins','electronics'],[1,1.3,1]);
add('led','Low-voltage LED light','Lighting','lamp','The driver feeds this light. Look for the positive and negative marks on the low-voltage side.',['L','N'],{watts:12,nominalVoltage:24},['emitter','electronics'],[1,1,1],['DC+','DC-']);
add('transformer','Isolating transformer','Conversion','transformer','The supply goes to the first winding. The second winding feeds a separate circuit. Measure across its two ends to read the output voltage.',['L','N','PE','+','-'],{outputVoltage:12,efficiency:.95},['winding','isolation']);
add('driver','LED driver','Conversion','transformer','This driver supplies the LEDs with a steady DC voltage. Look for + and − on the output.',['L','N','PE','+','-'],{outputVoltage:24,efficiency:.9,maxPower:120},['electronics','isolation']);
add('dcsupply','24 V control supply','Conversion','transformer','This takes the incoming supply and gives the controls their own DC supply. Measure across + and − to check it.',['L','N','PE','+','-'],{outputVoltage:24,efficiency:.9,maxPower:120},['electronics','isolation']);
add('sensor','Environmental sensor','Controls','sensor','The sensor needs its own supply. When it detects the change it is set for, it switches its output on.',['L','N','IN','OUT'],{active:true,demand:true,sensorValue:1,setpoint:.5,mode:'PIR'},['sensing','electronics']);
add('timer','Timeclock / timed controller','Controls','controller','The timer switches its output when the set time or delay is reached.',['L','N','IN','OUT'],{on:true,demand:true,delay:3,mode:'timer'},['display','electronics','contacts']);
add('smartrelay','Smart / priority controller','Controls','controller','A wired input or the relay setting tells the output when to switch.',['L','N','IN','OUT'],{on:true,demand:true,mode:'smart'},['electronics','contacts']);
add('thermostat','Thermostat','Heating','controller','A thermostat is a temperature switch. It calls for heat when the temperature falls below its setting.',['COM','OUT'],{closed:true,temperature:18,setpoint:21},['actuator','sensing','contacts']);
add('cutout','Independent thermal cut-out','Heating','controller','This safety switch opens if the temperature rises too far, even if the thermostat still calls for heat.',['COM','OUT'],{closed:true,temperature:20,setpoint:85,resetToken:0},['thermal','contacts']);
add('heater','Heating assembly','Heating','heater','Current through the element makes heat. The immersion, floor mat and storage heater each use that principle.',load,{watts:1000,nominalVoltage:240},['element','thermal'],[1.4,1.3,1]);
add('cooker','Cooker','Appliances','appliance','The cooker has its own feed. Follow it back to the local cooker switch.',load,{watts:2400,nominalVoltage:240},['element','actuator'],[1.5,1.8,1.1]);
add('shower','Electric shower','Appliances','appliance','The heating element warms the water as it flows. In this lesson the element needs both a feed and a signal from the flow switch.',load,{watts:3000,nominalVoltage:240},['element','sensing'],[1.1,1.7,.8]);
add('boiler','Packaged boiler','Heating','appliance','The heating controls call for the boiler to run. Trace that call back to the thermostat or valve.',load,{watts:120,nominalVoltage:240},['electronics','display'],[1.4,1.8,.9],undefined,'The bench shows the boiler’s feed and call for heat. Terminal markings vary between boilers.');
add('heatpump','Packaged heat pump','Heating','appliance','The heat pump has a local supply switch. A separate control tells it when heat is needed.',load,{watts:1200,nominalVoltage:240},['rotor','electronics'],[1.8,1.4,1.2],undefined,'You can check the supply and the call for heat. The bench does not calculate how much heat reaches the house.');
add('valve','Motorised valve / manifold actuator','Heating','valve','The motor opens the valve. Once it reaches the end of its travel, a small switch can call for the boiler.',['L','N','CALL','END','PE'],{delay:2,watts:6,mode:'two-port'},['actuator','contacts'],[1.2,1.3,1]);
add('valve3','Mid-position three-port valve','Heating','valve','This valve can send water to the heating, to the hot-water cylinder, or to both. Try the two calls for heat and watch it move.',['L','N','CH','HW','END','PE'],{delay:2,watts:6,mode:'three-port'},['actuator','contacts'],[1.2,1.3,1],undefined,'This valve follows the heating and hot-water calls shown here. Check the maker’s drawing for the markings on a particular valve.');
add('pump','Pump','Machinery','pump','An electric motor drives the pump. Check what calls it on and what stops it.',load,{watts:180,nominalVoltage:240},['rotor','winding'],[1.5,1.2,1.1]);
add('fan','Fan','Machinery','fan','The motor turns the blades to move air. The controls decide when it runs.',load,{watts:30,nominalVoltage:240},['rotor','winding','electronics'],[1.2,1.3,1]);
add('motor','Single-phase motor','Machinery','motor','The motor turns its shaft when it has a supply. Follow the feed through the starter to see what can stop it.',load,{watts:500,nominalVoltage:240,powerFactor:.8},['rotor','winding'],[1.7,1.2,1.2]);
add('motor3','Six-terminal three-phase motor','Machinery','motor','There are two ends to each of the three windings. The links between these six terminals set the motor for star or delta.',['U1','V1','W1','U2','V2','W2','PE'],{watts:1500,nominalVoltage:400,powerFactor:.8},['rotor','winding'],[1.8,1.3,1.3]);
add('contactor','Three-pole contactor','Machinery','contactor','A small coil pulls the main contacts closed to feed a larger load. Extra contacts can hold the coil on or signal that it has closed.',['A1','A2','1','2','3','4','5','6','13','14','21','22'],{nominalVoltage:240,coilWatts:5,mechanicallyInterlockedWith:''},['coil','contacts','actuator'],[1.5,1.6,1]);
add('relay','Control relay','Controls','contactor','Power the coil and the relay changes which contacts touch. The coil and contacts have separate connections.',['A1','A2','COM','NO','NC'],{nominalVoltage:240,coilWatts:3},['coil','contacts']);
add('overload','Motor overload relay','Machinery','overload','If the motor draws too much current, the overload opens its small switch marked 95–96. In the starter circuit, that cuts power to the coil and stops the motor.',['1','2','3','4','5','6','95','96'],{currentRating:8,closed:true,resetToken:0},['thermal','contacts','actuator']);
add('pushbutton','Momentary control button','Controls','switch','The contacts change when you press the button and spring back when you let go.',['COM','NO','NC'],{pressed:false},['actuator','contacts']);
add('selector','Maintained selector','Controls','switch','Turn the selector to choose A or B. It stays there when you let go.',['COM','A','B'],{position:0,closed:true},['actuator','contacts']);
add('indicator','Panel indicator','Controls','lamp','This small panel light comes on when there is enough voltage across its terminals.',load,{watts:2,nominalVoltage:240},['display'],[.8,.8,.8]);
add('vfd','Variable-frequency drive','Industrial','vfd','The drive changes the frequency it sends to the motor. Look for the incoming supply on L1, L2 and L3 and the motor on U, V and W.',['L1','L2','L3','PE','U','V','W','COM','RUN'],{frequency:50,efficiency:.95,on:true,maxPower:3000},['electronics','display'],[1.5,1.9,1],undefined,'The bench meter shows the voltage at the drive’s main output frequency. It leaves out the fast switching pulses and does not calculate the turning force at the shaft.');
add('plc','PLC and I/O module','Industrial','plc','This controller reads signals from the switches and sensors. Its program decides which outputs turn on.',['L','N','I1','I2','COM','Q1','Q2'],{mode:'and',on:true,nominalVoltage:24},['electronics','display'],[1.6,1.4,.9]);
add('safetyRelay','Safety relay','Industrial','plc','This relay checks both safety inputs and the contactor feedback before it allows a reset. The motor still needs a separate Start command.',['L','N','S1','S2','RESET','FB','COM','OUT'],{on:true,nominalVoltage:24},['electronics','contacts'],[1.4,1.4,.9],undefined,'You can try the stops, reset and feedback on the bench. A working result here does not give a real machine a safety rating.');
add('alarm','Interlinked alarm','Safety','alarm','The alarm has a mains supply and a backup battery. Its LINK terminal can pass an alarm signal to the other unit.', ['L','N','PE','LINK'],{watts:2,nominalVoltage:240,battery:true,alarm:false},['sensing','battery','electronics'],[1.1,.7,1.1]);
add('chime','Doorbell chime','Safety','alarm','The chime sounds when there is power across its two screws. In the bell circuit, pressing a door button completes that path.',['L','N'],{watts:3,nominalVoltage:12},['coil','actuator'],[1,.9,.8],['output','output']);
add('emergency','Emergency luminaire','Safety','lamp','This fitting watches its permanent mains supply. If the supply fails, the battery lights the lamp.',['L','N','PE','SL'],{watts:8,nominalVoltage:240,battery:true,maintained:false},['emitter','battery','electronics'],[1.6,.9,.7]);
add('ev','EV charging equipment','Energy','charger','The charger draws power when the load controller allows charging. Try pausing it and check the current.',load,{watts:1800,nominalVoltage:240,on:true},['electronics','display'],[1.3,1.8,.8],undefined,'This exercise covers the charging current and when the controller pauses it. Real chargers have their own protection and vehicle checks.');
add('pv','PV grid inverter','Energy','inverter','The inverter feeds solar power into the AC circuit. When the panels produce less, the supply has to make up the difference.', ['L','N','PE','+','-'],{generation:600,on:true,efficiency:.95,availability:1},['electronics','display'],[1.4,1.7,.8],undefined,'This inverter needs the grid supply before it can feed power back. You can try a loss of supply on the bench.');
add('battery','Battery / backup inverter','Energy','inverter','The battery can feed a separate backup output when the mains fails. Follow that output to the loads on backup.',['L','N','PE','+','-','BL','BN'],{generation:0,on:true,soc:80,capacityWh:2000,outputVoltage:240,efficiency:.9},['battery','electronics','display'],[1.4,1.9,1]);
add('cable','Cable section','Accessories','cable','The cut end lets you see the wires inside the outer covering, called the sheath.',['IN','OUT'],{closed:true},['sheath'],[1.5,.5,.7],undefined,'In this cutaway, IN and OUT are the ends of one wire. The other cores show how the cable is made. Use Connect to wire individual cores in your own circuit.');
add('conduit','Conduit / gland assembly','Accessories','conduit','The conduit protects the wires. The gland holds the cable where it enters the fitting.',[],{},['sheath'],[1.5,.5,.7]);
add('multimeter','Virtual multimeter','Instruments','instrument','Put one probe on each point to read the voltage between them. Switch off all bench supplies before checking resistance.',[],{mode:'voltage'},['display','actuator','probes'],[1,1.6,.6]);
add('clamp','Virtual current clamp','Instruments','instrument','Close the clamp around one wire to read the current flowing in it.',[],{mode:'current'},['display','sensing','actuator'],[1,1.7,.6]);
add('forktester','Open-fork tester · T6-600 study model','Instruments','instrument','Use the probes to read voltage between two points. Use the fork around one insulated AC wire to read its current.',[],{},['display','sensing','actuator','mode','hold','backlight','ground','probes'],[.51,2,.46]);
add('stripper','Wire stripper','Instruments','instrument','Take the insulation off the end of a wire. The mark on the connector shows how much to strip.',[],{},['actuator','mechanism'],[.62,1.21,.22]);
add('crimper','Ferrule crimper','Instruments','instrument','A ferrule is a small metal sleeve for the end of stranded wire. The crimper squeezes the sleeve onto the strands.',[],{},['actuator','mechanism'],[.62,1.21,.22]);
add('torquedriver','Adjustable torque screwdriver','Instruments','instrument','Set the driver to the torque given for that terminal. It releases when you reach the setting.',[],{},['actuator','mechanism'],[.24,1.24,.24]);
add('pwmcontrol','Low-voltage pulse controller','Lighting','controller','The controller switches the LED strip on and off quickly. The longer each pulse stays on, the brighter the strip looks.',['+','-','W','C'],{level:.5,mix:.5,on:true},['actuator','electronics'],[1.15,.6,.55],['DC+','DC-','control','control'],'The bench works out average power and current from how long each pulse stays on. It does not show the individual pulses on a meter.');
add('cctstrip','Warm / cool tape','Lighting','lamp','The warm and cool LEDs share a positive connection. Each has its own return wire, so you can change the mix.',['+','W','C'],{ratedVoltage:24,channelWatts:12},['emitter','electronics'],[2.1,.9,.32],['DC+','control','control'],'Compare the power of the two LED channels to see which is brighter. The bench does not give a colour temperature or a light level in lux.');
add('callchime','Two-input AC door chime','Safety','alarm','The chime has a supply of its own. The front and back buttons each have a separate wire, so you can tell which door is calling.',['AC1','AC2','FRONT','REAR'],{ratedVoltage:12},['electronics','actuator'],[1.1,.95,.6],['output','output','control','control']);
add('floatvalve','Three-point valve actuator','Heating','valve','OPEN and CLOSE move the valve in opposite directions. Switch both off and it holds its position.',['COM','OPEN','CLOSE'],{ratedVoltage:24,travel:4},['actuator','mechanism'],[1.15,1.25,.8],['DC-','control','control'],'The valve moves faster on the bench so you can see the result. If OPEN and CLOSE both have power, it stays still.');
add('proximity','Three-wire PNP proximity sensor','Controls','sensor','This sensor detects nearby metal. With its DC supply on, the black wire goes positive when metal reaches the sensor.',['+','OUT','-'],{ratedVoltage:24,minVoltage:10,maxVoltage:30,active:false},['sensing','electronics'],[.74,1.65,.74],['DC+','control','DC-'],'Try moving the metal target in and out. The bench checks whether the sensor switches. It does not measure the distance at which a real sensor would switch.');
// Physical forms share stable electrical terminals and differ only in presentation.
const physicalForms:Record<string,{id:string;name:string}[]>={
  fan:[{id:'xf100s',name:'100 mm bathroom extractor'}],
  pwmcontrol:[{id:'single-channel',name:'Single-channel PWM'},{id:'tunable-white',name:'Warm / cool controller'}],
  led:[{id:'strip',name:'Constant-voltage strip'},{id:'series-module',name:'Series downlight module'}],
  switch:[{id:'door-contact',name:'Door-operated contact'},{id:'dc-rocker',name:'DC panel rocker for cabinet lights'}],selector:[{id:'float-changeover',name:'Changeover float switch'}],
  isolator3:[{id:'fan-isolator',name:'Three-pole fan isolator'}],
  pushbutton:[{id:'sesame',name:'Two-wire bell push'},{id:'bell-push',name:'Three-contact push'}], driver:[{id:'constant-current',name:'350 mA driver'}],
  terminal:[{id:'lever-connector',name:'Lever connector'},{id:'comb-busbar',name:'Insulated single-phase comb'}], fuse:[{id:'dc-fuse',name:'DC branch carrier'}],
  panel:[{id:'domestic',name:'Domestic consumer unit'},{id:'industrial',name:'Industrial cabinet'}],
  lamp:[{id:'bulb',name:'B22 bulb and holder'},{id:'downlight',name:'Recessed downlight'},{id:'batten',name:'Linear batten'}],
  heater:[{id:'immersion',name:'Immersion assembly'},{id:'mat',name:'Underfloor heating mat'},{id:'storage',name:'Storage heater'}],
  conduit:[{id:'conduit',name:'Conduit and gland'},{id:'trunking',name:'Slotted trunking'}],
  cable:[{id:'three-core',name:'Three-core cutaway'},{id:'five-core',name:'Five-core cutaway'}],
};
for(const def of defs)if(physicalForms[def.type])def.variants=physicalForms[def.type];
export const COMPONENTS: Record<string,ComponentDefinition> = Object.fromEntries(defs.map(d=>[d.type,d]));
const dcRockerDefinition:ComponentDefinition={
  ...COMPONENTS.switch,name:'DC panel rocker for cabinet lights',size:[.463,.92,1.95],
  description:'This small rocker clips into a panel. It joins the two metal blades behind it to switch the positive wire to one worktop strip.',
  abstraction:'The fitting follows the RG1-1A-DC-1-B. Its contacts are rated 10 A at 28 V DC. The lab illustrates the hidden moving contact and the push-on wire ends.',
  parts:COMPONENTS.switch.parts.map(part=>part.id==='terminals'?{...part,name:'Blades 2 and 1',purpose:'Each wire has a push-on end that grips one metal blade. The uninsulated metal at the base of the blade is a probe point.'}
    :part.id==='cover'?{...part,name:'Bezel',purpose:'The rim around the small rocker rests against the front of the panel.'}:part),
  terminals:getComponentTerminals({type:'switch',variant:'dc-rocker',label:'',params:{}},COMPONENTS.switch),
};
const xf100sDefinition:ComponentDefinition={
  ...COMPONENTS.fan,name:'100 mm bathroom extractor',size:[1.63,1.695,.75],
  defaults:{watts:15,nominalVoltage:230,classII:true},
  parts:COMPONENTS.fan.parts.filter(p=>p.id!=='electronics'),
  terminals:getComponentTerminals({type:'fan',variant:'xf100s',label:'',params:{}},COMPONENTS.fan),
};
const sesameDefinition:ComponentDefinition={
  ...COMPONENTS.pushbutton,
  name:'Two-wire bell push',
  terminals:getComponentTerminals({type:'pushbutton',variant:'sesame',label:'',params:{}},COMPONENTS.pushbutton),
};
const fanIsolatorDefinition:ComponentDefinition={
  ...COMPONENTS.isolator3, name:'Three-pole fan isolator',defaults:{...COMPONENTS.isolator3.defaults,currentRating:10},
  description:'One rocker disconnects the permanent line, switched line and neutral together. The light switch can still operate the bathroom light.',
  size:[.86,.90,.244],terminals:getComponentTerminals({type:'isolator3',variant:'fan-isolator',label:'',params:{}},COMPONENTS.isolator3),
};
/** Named fittings can have their own terminal groups and mounting envelope. */
export function definitionFor(item:Pick<ComponentInstance,'type'|'variant'>):ComponentDefinition {
  if(item.type==='switch'&&item.variant==='dc-rocker')return dcRockerDefinition;
  if(item.type==='fan'&&item.variant==='xf100s')return xf100sDefinition;
  if(item.type==='isolator3'&&item.variant==='fan-isolator')return fanIsolatorDefinition;
  return item.type==='pushbutton'&&item.variant==='sesame'?sesameDefinition:COMPONENTS[item.type];
}

export const COMPONENT_LIST = defs;
export const getComponent = (type:string) => COMPONENTS[type];

const variantPurpose: Record<string, string> = {
  'switch:dc-rocker':dcRockerDefinition.description,
  'fan:xf100s':'Air comes in through the front grille and leaves through the round duct at the back. Under the cover are two motor connections, L and N. This double-insulated fan has no earth terminal. In the bathroom job a separate timer keeps it running.',
  'isolator3:fan-isolator': fanIsolatorDefinition.description,
  'switch:door-contact': 'The door moves this switch. Try opening and closing the door and watch what happens to the circuit.',
  'selector:float-changeover': 'The water level moves the float. Its common wire (COM) switches from one output wire to the other.',
  'driver:constant-current': 'This driver adjusts its output voltage to keep the current through the LEDs steady, within its working range. Check the current rating on the driver.',
  'led:series-module': 'These LEDs are wired one after the other. The same current flows through every module in a complete string.',
  'terminal:comb-busbar': 'The metal teeth are joined inside the insulated strip. It carries the same feed to each breaker clipped onto it.',
  'terminal:lever-connector': 'Lift a lever to open that clamp. The wire entries share one metal link inside the connector.',
  'pushbutton:sesame': 'Hold the button to ring the bell. Let go and the two contacts spring apart. The two screw terminals on the back are interchangeable.',
  'pushbutton:bell-push': 'Press the button to join COM to NO. Let go and the spring opens the contact again.',
};

export function equipmentPurpose(component: Pick<ComponentInstance, 'type' | 'variant' | 'params'>): string {
  // Older saved drivers can have the current setting without an explicit model variant.
  if (component.type === 'driver' && component.params.mode === 'constant-current') return variantPurpose['driver:constant-current'];
  return variantPurpose[component.type + ':' + component.variant] ?? COMPONENTS[component.type].description;
}

export function connectedTerminalMissing(doc:CircuitDocument,replacement:ComponentInstance):string|undefined {
  const available=definitionFor(replacement).terminals;
  for (const link of [...doc.wires,...(doc.cableRuns??[])]) {
    for(const end of [link.from,link.to]){
      if(end.component===replacement.id&&!available.some(t=>t.id===end.terminal))return end.terminal;
    }
  }
}

/** Changing the actual material also selects its declared electrical specification.
 * Geometry-only variants never alter saved settings or terminal endpoints. */
export function applyEquipmentVariant(item:ComponentInstance,variant:string|undefined):ComponentInstance{
  if(item.variant===variant)return item;
  let params=item.params;
  if(item.type==='fan'&&(variant==='xf100s'||item.variant==='xf100s')){
    const defaults=variant==='xf100s'?xf100sDefinition.defaults:COMPONENTS.fan.defaults;
    params={...params,...defaults};
    if(variant!=='xf100s')delete params.classII;
    if('ratedVoltage' in params)params.ratedVoltage=defaults.nominalVoltage;
    if('power' in params)params.power=defaults.watts;
  }else if(item.type==='driver'&&(variant==='constant-current'||item.variant==='constant-current')){
    params=variant==='constant-current'
      ?{...params,mode:'constant-current',outputCurrent:.35,outputVoltage:30,maxPower:15}
      :{...params,mode:'constant-voltage',outputVoltage:24,maxPower:120};
  }else if(item.type==='led'&&(variant==='strip'||variant==='series-module'||item.variant==='series-module')){
    const series=variant==='series-module';
    params={...params,ratedVoltage:series?9:24,watts:series?3.15:12};
  }
  return {...item,variant,params};
}
