const terms: Array<[RegExp, string, string]> = [
  [/\bRCBO\b/i, 'RCBO', 'A circuit breaker with two jobs. It trips on excess current and can also trip if some current returns by another route.'],
  [/\b(RCD|RCCB)\b/i, 'RCD', 'A device that compares the current going out and coming back. A difference can make it trip.'],
  [/\bMCB\b/i, 'MCB', 'A circuit breaker that trips when too much current flows.'],
  [/\b(CPC|protective conductor|protective earth)\b/i, 'Protective earth', 'The earth wire. It gives fault current a path back to the supply so protection can operate.'],
  [/\bcontinuity\b/i, 'Continuity', 'A check for an unbroken electrical path. Switch off every supply before using this meter setting.'],
  [/\bcontactor\b/i, 'Contactor', 'A switch operated by a coil. A small control circuit can switch a larger load, such as a motor.'],
  [/\bcoil\b/i, 'Coil', 'A winding of wire. In a relay or contactor, current through it makes a magnet pull the contacts over.'],
  [/\btravellers?\b|\bstrappers?\b/i, 'Strappers', 'The two wires between two-way switches. The switches choose which path the lamp uses. They are also called travellers.'],
  [/\bneutral\b/i, 'Neutral', 'The normal return wire for a single-phase load. It can carry current while the load is running.'],
  [/\bterminal[s]?\b/i, 'Terminal', 'The marked point on a fitting where a wire connects.'],
  [/\bpermissive\b/i, 'Permissive', 'A signal that allows equipment to start when a condition has been met. It still needs a start command.'],
  [/\binterlock\b/i, 'Interlock', 'A control that must be in the right state before another part can operate.'],
  [/\bPWM\b/i, 'PWM', 'The controller switches the light on and off rapidly. Longer on-time gives more average light.'],
  [/\bLED driver\b/i, 'LED driver', 'A power supply that gives an LED the voltage or current it needs.'],
  [/\bthermostat\b/i, 'Thermostat', 'A temperature switch. It calls for heat or cooling as the temperature changes.'],
  [/\bOL\b/i, 'OL', 'This resistance reading is outside the meter’s range. An open wire can give this reading.'],
];

export function TermsInThisStep({text}:{text:string}) {
  const matches = terms.filter(([pattern])=>pattern.test(text));
  if (!matches.length) return null;
  return <details className="book-terms"><summary>What do these words mean?</summary>
    <dl>{matches.map(([,name,meaning])=><div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}</dl>
  </details>;
}
