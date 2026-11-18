import type { ComponentInstance } from './types.ts';
export const WORKSHOP_TOOLS = ['forktester','stripper','crimper','torquedriver'];
const special = new Set(['led:strip','led:series-module','switch:door-contact','switch:float-contact','selector:float-changeover','pushbutton:bell-push','driver:constant-current','terminal:lever-connector','terminal:comb-busbar','fuse:dc-fuse']);
export function workshopKey(c:Pick<ComponentInstance,'type'|'variant'>):string|undefined {
  if (WORKSHOP_TOOLS.includes(c.type) || ['gammaboard','invictaboard','callchime','floatvalve','proximity','cctstrip'].includes(c.type)) return c.type+':default';
  if(c.type==='pwmcontrol')return c.type+':'+(c.variant==='tunable-white'?'tunable-white':'single-channel');
  const variant=c.type+':'+c.variant;
  return special.has(variant)?variant:undefined;
}
