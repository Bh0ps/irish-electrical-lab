const terms: Array<[RegExp, string, string]> = [
  [/\bRCBO\b/i, 'RCBO', 'A breaker that can trip when too much current flows or when some current comes back by another route.'],
  [/\b(RCD|RCCB)\b/i, 'RCD', 'A device that compares the current going out and coming back. A difference can make it trip.'],
  [/\bMCB\b/i, 'MCB', 'A circuit breaker that trips when too much current flows.'],
  [/\b(CPC|protective conductor|protective earth)\b/i, 'Protective earth', 'The earth wire. It gives fault current a path back to the supply so protection can operate.'],
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
];

export function TermsInThisStep({text}:{text:string}) {
  const matches = terms.filter(([pattern])=>pattern.test(text));
  if (!matches.length) return null;
  return <details className="book-terms"><summary>What do these words mean?</summary>
    <dl>{matches.map(([,name,meaning])=><div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}</dl>
  </details>;
}
