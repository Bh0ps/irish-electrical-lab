export const terminations = {
  strip: {
    tool:'stripper', name:'Strip a wire', sample:'WAGO 221-413 lever connector',
    instruction:'The mark on the connector shows how much insulation to take off. Set the stripper to that length.',
    documentation:'Strip length 11 mm', choices:[6,11,15],unit:'mm',target:11,
    action:'Strip the wire',success:'The bare copper matches the 11 mm mark on this connector.',
    low:'Too little copper is bare. Try the 11 mm setting.',high:'Too much copper is bare. Set the stripper to 11 mm and try a fresh end.',
    source:'https://www.wago.com/global/p/221-413',
  },
  crimp: {
    tool:'crimper',name:'Crimp a ferrule',sample:'Phoenix Contact AI 0,75-8 GY · 3200519',
    instruction:'A ferrule is a metal sleeve for the end of a stranded wire. Choose one to fit this 0.75 mm² wire.',
    documentation:'0.75 mm² conductor · 8 mm contact · 11 mm strip length',choices:[0.5,0.75,1.5],unit:'mm²',target:.75,
    action:'Crimp the ferrule',success:'The crimper squeezed the sleeve onto the strands. The sleeve and wire are both 0.75 mm².',
    low:'The sleeve is too small for all the strands. Choose the 0.75 mm² ferrule.',high:'This sleeve is too big for the wire. Try the 0.75 mm² ferrule.',
    source:'https://www.phoenixcontact.com/en-de/products/ferrule-ai-075-8-gy-3200519',
  },
  torque: {
    tool:'torquedriver',name:'Set a torque screwdriver',sample:'Hager MBN106W B6 · top screw terminal',
    instruction:'Check how tightly the maker says to turn the top terminal screw. Set the screwdriver and try it on this breaker.',
    documentation:'2.80 N·m (newton metres) for the top terminal on this breaker.',choices:[1.2,2.8,3.5],unit:'N·m',target:2.8,
    action:'Tighten the terminal screw',success:'The driver reached 2.8 N·m, the setting for this breaker’s top terminal.',
    low:'The driver released too soon. Set it to 2.8 N·m for this terminal.',high:'That setting is too high for this terminal. Set the driver to 2.8 N·m.',
    source:'https://hager.com/ie/catalogue/products/mbn106w-mcb-1p-6ka-b-6a-1m',
  },
} as const;
export type PreparationTask=keyof typeof terminations;
export interface WorkshopVisual {type:string; task:PreparationTask; setting?:number; applied:boolean; accepted:boolean}
export function prepareSample(id:PreparationTask,setting:number){
  const task=terminations[id],won=setting===task.target;
  return {won,message:won?task.success:setting<task.target?task.low:task.high};
}
