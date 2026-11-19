import {equipmentAsset} from './equipment-assets';
import type {ComponentDefinition,ComponentInstance} from './types';

export interface FittingDetail {id:string;part:string;title:string;explanation:string;face:'service'|'front'}
type Feature = [id:string,part:string,title:string,explanation:string,face?:'front'];

const rocker:Feature[]=[
  ['ribbed-switch-plate','body','Faceplate ribs','The ridges stiffen the plate. The two round fixing holes line it up with the wall box.'],
  ['recessed-switch-cassette','body','Switch mechanism','This grey case holds the moving contact. A wire enters through a rectangular opening. A separate opening at the end gives access to its screw.'],
  ['switch-case-fixings','body','Case screws','Look for two screws at the top and one in the curved recess below. These hold the case together. The screws that grip the wires are reached from the ends.'],
];
const rose:Feature[]=[
  ['cable-entry-knockouts','body','Cable openings','The rectangular hole lets a cable through. The panel marked REMOVE below it is a knockout. Removing it makes the opening bigger. The round holes and the slot take the fixing screws.'],
  ['three-insulated-terminal-groups','body','Three separate brass links','Each brass strip joins its own row of wires. The three rows carry neutral, permanent line and switched line. A fourth clamp below joins the protective conductors.'],
  ['cover-fixing','cover','Pendant cover','The cover screws onto the base. The flex to the lamp passes through the smooth opening in its centre.','front'],
];
const lamp:Feature[]=[
  ['lamp-mounting','mounting','Brass mounting flange','Two holes secure the angled holder. Its metal base connects to the protective earth terminal.'],
  ['ceramic-terminal-insert','body','Ceramic insert','Ceramic keeps the two lamp contacts apart and insulates them from the brass shell. The earth connection is on its own metal lug.'],
  ['tungsten-coiled-filament','emitter','Filament','Inside the glass, this fine coil heats up and glows when current flows. Watch it as you change the dimmer.','front'],
];
const earth:Feature=['linked-earth-strap','mounting','Earth strap','The folded metal strip joins the two earth entries and the metal screw bushes. It keeps them on the same protective path.'];
const socket:Feature[]=[earth,['socket-contact-system','pins','Socket shutters','The shutters cover the live and neutral openings when the plug is out. The metal contacts behind them grip the plug pins.','front']];
const fusedSpur:Feature[]=[earth,['accessory-strain-relief','mounting','Cord grip','This two-screw clamp holds the outer sheath of the flex. A tug on the cable reaches the clamp before it reaches the individual wires.'],['socket-contact-system','contacts','Fused connection','The switch opens the line and neutral contacts. The replaceable fuse is in the line path to the appliance.']];
const byModel:Record<string,Feature[]>={
  'switch:single-rocker':rocker,'switch2:single-rocker':rocker,'intermediate:single-rocker':rocker,
  'switch:gang-module-left':rocker,'switch:gang-module-right':rocker,
  'rose:default':rose,'lamp:bulb':lamp,'socket:default':socket,'fcu:default':fusedSpur,
};

/** Show details only when the corresponding selectable assembly exists in the model. */
export function fittingDetails(component:ComponentInstance,definition:ComponentDefinition):FittingDetail[]{
  const asset=equipmentAsset(component,definition);
  if(!asset)return [];
  return (byModel[asset.galleryKey]??[]).filter(([id])=>asset.detailFeatures.includes(id))
    .map(([id,part,title,explanation,face])=>({id,part,title,explanation,face:face??'service'}));
}
