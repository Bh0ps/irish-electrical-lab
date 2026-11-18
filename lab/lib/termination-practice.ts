export const terminations = {
  strip: {
    tool:'stripper', name:'Strip an insulated single', sample:'WAGO 221-413 lever connector',
    instruction:'Use the connector’s strip-length gauge to prepare the conductor.',
    documentation:'Strip length 11 mm', choices:[6,11,15],unit:'mm',target:11,
    action:'Strip the conductor',success:'The bare copper now matches the connector’s 11 mm gauge.',
    low:'The exposed copper ends short of the strip-length gauge.',high:'Copper extends beyond the marked strip length.',
    source:'https://www.wago.com/global/p/221-413',
  },
  crimp: {
    tool:'crimper',name:'Crimp a ferrule',sample:'Phoenix Contact AI 0,75-8 GY · 3200519',
    instruction:'Fit a ferrule to the prepared 0.75 mm² stranded conductor and close the crimping jaws.',
    documentation:'0.75 mm² conductor · 8 mm contact · 11 mm strip length',choices:[0.5,0.75,1.5],unit:'mm²',target:.75,
    action:'Crimp the ferrule',success:'The selected ferrule matches the conductor, and the die has compressed its metal sleeve.',
    low:'The fine strands cannot all enter this smaller ferrule.',high:'This ferrule is too large for the conductor in this exercise.',
    source:'https://www.phoenixcontact.com/en-de/products/ferrule-ai-075-8-gy-3200519',
  },
  torque: {
    tool:'torquedriver',name:'Set a torque screwdriver',sample:'Hager MBN106W B6 · top screw terminal',
    instruction:'Read the setting for this breaker terminal, then set the driver and tighten the sample.',
    documentation:'Top terminal nominal tightening torque 2.80 N·m',choices:[1.2,2.8,3.5],unit:'N·m',target:2.8,
    action:'Tighten the sample',success:'The driver reaches 2.8 N·m on the selected MBN106W terminal.',
    low:'The driver releases below the setting specified for this terminal.',high:'This setting exceeds the torque specified for this terminal.',
    source:'https://hager.com/ie/catalogue/products/mbn106w-mcb-1p-6ka-b-6a-1m',
  },
} as const;
export type PreparationTask=keyof typeof terminations;
export interface WorkshopVisual {type:string; task:PreparationTask; setting?:number; applied:boolean; accepted:boolean}
export function prepareSample(id:PreparationTask,setting:number){
  const task=terminations[id],won=setting===task.target;
  return {won,message:won?task.success:setting<task.target?task.low:task.high};
}
