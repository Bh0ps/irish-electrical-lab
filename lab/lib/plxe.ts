import type {TerminalDefinition,Vec3} from './types';

/** PLX050E Series C. The wall is Z=0, the operating face looks towards +Z.
 * The document retains the same L/N/PE identities as other single-phase heaters. */
export const PLXE_MM_PER_UNIT=300;
export const PLXE_BODY_BOTTOM=.32;
export const PLXE_FLEX_EXIT:Vec3=[.625,.28,.115];
export const PLXE_BODY_SIZE:Vec3=[450/300,430/300,108/300];

// The shortened workbench lead has three free core ends. In the utility the
// whole circular flex runs continuously from its gland to the wall fitting.
export function plxeTerminals(terminals:TerminalDefinition[]):TerminalDefinition[]{
  const ends:Record<string,[number,string]>={L:[153.5,'Brown live'],N:[187.5,'Blue neutral'],PE:[221.5,'Green and yellow earth']};
  return terminals.map(t=>({...t,label:t.id==='PE'?'E':t.id,group:'Fitted flex',
    anchor:[ends[t.id][0]/300,.13,-.30],entryDirection:[0,0,-1],scale:.36,
    purpose:ends[t.id][1]+' core in the heater’s factory-fitted lead. '+(t.id==='PE'?'It bonds the metal case to earth.':'This core supplies the heater controller and element.')}));
}
