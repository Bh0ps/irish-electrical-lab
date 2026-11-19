const terms: Array<[RegExp, string, string]> = [
  [/\bRCBO\b/i, 'RCBO', 'A breaker that can trip when too much current flows or when some current comes back by another route.'],
  [/\b(RCD|RCCB)\b/i, 'RCD or RCCB', 'It compares the current going out with the current coming back. If some takes another path, the device can trip. An RCCB needs a separate fuse or breaker for overloads.'],
  [/\bMCB\b/i, 'MCB', 'A circuit breaker that trips when too much current flows.'],
  [/\b(CPC|PE|protective conductor|protective earth)\b/i, 'Earth wire (PE)', 'If a live wire touches an earthed metal case, the earth wire carries fault current back to the supply. This helps the protection trip.'],
  [/\bcontinuity\b/i, 'Continuity', 'A check for an unbroken electrical path. Switch off every supply before using this meter setting.'],
  [/\bcontactor\b/i, 'Contactor', 'A switch operated by a coil. A small control circuit can switch a larger load, such as a motor.'],
  [/\bcoil\b/i, 'Coil', 'A winding of wire. In a relay or contactor, current through it makes a magnet pull the contacts over.'],
  [/\btravellers?\b|\bstrappers?\b/i, 'Strappers', 'The two wires between two-way switches. The switches choose which path the lamp uses. They are also called travellers.'],
  [/\bneutral\b/i, 'Neutral', 'The normal return wire for a single-phase load. It can carry current while the load is running.'],
  [/\bcontacts?\b/i, 'Contact', 'The metal faces inside a switch. Closed means the faces touch and current can pass. Open means there is a gap.'],
  [/\b(dry contact|volt(?:age)?-free)\b/i, 'Volt-free contact', 'These switch contacts have no supply of their own. The circuit you connect to them provides the voltage.'],
  [/\bterminal[s]?\b/i, 'Terminal', 'The marked point on a fitting where a wire connects.'],
  [/\bpermissive\b/i, 'Permissive', 'A signal that allows equipment to start when a condition has been met. It still needs a start command.'],
  [/\binterlock\b/i, 'Interlock', 'One control prevents another action. On a reversing motor, it stops Forward and Reverse switching on together.'],
  [/\bsubmain(s)?\b/i, 'Submain', 'A cable that takes power from one distribution board to another.'],
  [/\bthree[- ]phase\b|\bbetween phases\b|\bL1, L2 and L3\b/i, 'Phase', 'A three-phase supply has three line wires, marked L1, L2 and L3. Their voltages rise and fall at different times.'],
  [/\b(duty|standby) pump\b/i, 'Duty pump', 'The pump picked to run first. The standby pump is the one kept in reserve.'],
  [/\bactuators?\b/i, 'Actuator', 'The part that moves something when it gets a signal. On a heating valve it opens or closes the valve.'],
  [/\b(LED strip|strip pads?|solder pads?|copper pads?)\b/i, 'LED strip pads', 'The bare copper patches on the tape where a wire or meter probe makes contact.'],
  [/\bPWM\b/i, 'PWM', 'The controller switches the light on and off rapidly. Longer on-time gives more average light.'],
  [/\bLED driver\b/i, 'LED driver', 'A power supply that gives an LED the voltage or current it needs.'],
  [/\bthermostat\b/i, 'Thermostat', 'A temperature switch. It calls for heat or cooling as the temperature changes.'],
  [/\b(isolator|isolation switch)\b/i, 'Isolator', 'A switch used to disconnect equipment from its supply. Its incoming terminals can still be live.'],
  [/\b(NO|NC|normally (open|closed))\b/, 'NO and NC', 'Look at the contact at rest. Normally open (NO) has a gap. Normally closed (NC) makes a connection.'],
  [/\b(COM|common terminal)\b/, 'COM', 'On a changeover switch, this is the common point. Moving the switch joins it to one of the other two terminals.'],
  [/\bPIR\b/i, 'PIR', 'A motion detector. It senses changes in heat as someone moves past.'],
  [/\b(windings?|secondary|primary)\b/i, 'Winding', 'A coil of wire. On a transformer, the supply goes to the primary winding and the other circuit connects to the secondary.'],
  [/\bstranded\b/i, 'Stranded wire', 'Many fine metal strands make up one conductor. You can see them together at the cut end.'],
  [/\b(run-on|off-delay)\b/i, 'Run-on', 'The fan or light stays on for a set time after the switch or sensor turns off.'],
  [/\bOL\b/i, 'OL', 'This resistance reading is outside the meter’s range. An open wire can give this reading.'],
  [/\bload(s)?\b/i, 'Load', 'Something that uses electrical power, such as a lamp, heater or motor.'],
  [/\b(feed|feeder|feeds)\b/i, 'Feed', 'The wire or cable that brings power to a fitting or circuit.'],
  [/\b(switched line|SL)\b/, 'Switched line (SL)', 'The wire carrying power from a switch to the fitting it controls.'],
  [/\b(radial|radials)\b/i, 'Radial circuit', 'The cable starts at the board and ends at the last fitting. It can have branches.'],
  [/\bring (final|circuit)\b/i, 'Ring circuit', 'The cable runs from the board through the sockets and back to the same breaker.'],
  [/\b(holding contact|hold-in contact|seal-in contact)\b/i, 'Holding contact', 'On a starter, this contact keeps the coil powered after you let go of Start. Stop breaks that path.'],
  [/\b(changeover|change-over)\b/i, 'Changeover', 'A switch moves the common connection from one path to another.'],
  [/\b(AC|DC)\b/, 'AC and DC', 'With AC the current changes direction, as it does at a mains socket. DC flows in one direction, as it does from a battery.'],
  [/\bSPD\b/i, 'Surge protection device (SPD)', 'At the board, it helps limit sudden voltage spikes. It does not switch the lights on or off.'],
  [/\b(load shedding|shed the load)\b/i, 'Load shedding', 'A controller switches off one load to leave power available for another.'],
  [/\bPLC\b/i, 'PLC', 'A small industrial computer. It reads inputs such as switches, then uses its program to control outputs.'],
  [/\bVFD\b/i, 'VFD', 'A drive that changes the frequency of the supply to a motor to control its speed.'],
];

export function TermsInThisStep({text}:{text:string}) {
  const matches = terms.filter(([pattern])=>pattern.test(text));
  if (!matches.length) return null;
  return <details className="book-terms"><summary>What do these words mean?</summary>
    <dl>{matches.map(([,name,meaning])=><div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}</dl>
  </details>;
}
