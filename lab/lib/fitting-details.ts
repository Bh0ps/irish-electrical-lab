import {equipmentAsset} from './equipment-assets';
import type {ComponentDefinition,ComponentInstance} from './types';

export interface FittingDetail {id:string;part:string;title:string;explanation:string;face:'service'|'front'}
type Feature = [id:string,part:string,title:string,explanation:string,face?:'front'];

const rocker:Feature[]=[
  ['ribbed-switch-plate','body','Faceplate ribs','The ridges stiffen the plate. The two round fixing holes line it up with the wall box.'],
  ['recessed-switch-cassette','body','Switch mechanism','The rocker moves a contact inside this grey case. The wire goes into the rectangular hole. Its clamp screw is reached from the end.'],
  ['switch-case-fixings','body','Case screws','The two screws at the top and the one in the curved recess hold the case shut. Look at the ends of the case for the wire clamps.'],
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
const earth:Feature=['linked-earth-strap','mounting','Earth strap','Follow the folded strip from one earth terminal to the other. It also touches the metal sleeves around the fixing screws.'];
const socket:Feature[]=[earth,['socket-contact-system','pins','Socket shutters','The shutters cover the live and neutral openings when the plug is out. The metal contacts behind them grip the plug pins.','front']];
const fusedSpur:Feature[]=[earth,['accessory-strain-relief','mounting','Cord grip','This two-screw clamp holds the outer sheath of the flex. A tug on the cable reaches the clamp before it reaches the individual wires.'],['socket-contact-system','contacts','Fused connection','The switch opens the line and neutral contacts. The replaceable fuse is in the line path to the appliance.']];
const breaker:Feature[]=[
  ['din-latch','mounting','Rail clip','This clip hooks the breaker onto the metal rail at the back of the board.'],
  ['protection-mechanism','contacts','Trip latch','When the breaker trips, the latch lets go. The metal contacts spring apart and cut the feed.'],
];
const residualBreaker:Feature[]=[...breaker,['contact-indicator','contacts','Contact window','This little window shows whether the contacts are open or closed. It cannot tell you whether there is voltage at a terminal.','front']];
const byModel:Record<string,Feature[]>={
  'switch:single-rocker':rocker,'switch2:single-rocker':rocker,'intermediate:single-rocker':rocker,
  'switch:gang-module-left':rocker,'switch:gang-module-right':rocker,
  'led:strip':[
    ['flexible-copper-tracks','body','Cut mark and copper pads','The printed line marks the end of a section. Put the probes on the bare pads beside it. Look for +24V and −.','front'],
    ['surface-mount-bodies','body','Packages and resistors','The white cases hold the LEDs. The small dark parts between them are resistors.','front'],
    ['smd-led-packages','emitter','Seven LED windows','Current through the LEDs lights these yellow windows. This 100 mm section has seven.','front'],
  ],
  'pushbutton:sesame':[
    ['sesame-cover','cover','Clip-on cover','The cover clips off to reveal the two wall fixing screws. The round button stays on the base.','front'],
    ['sesame-base','body','Fixing base','The holes at the top and bottom take the wall screws. The two smaller screws closer to the button hold the wires.'],
    ['sesame-plunger','actuator','Spring-return button','Hold the button in to join the two wires. Let go and the contact opens again.','front'],
  ],
  'dimmer:rotary':[
    ['dimmer-knob','actuator','Aluminium knob','Turn the knob to change how bright the lamp is. On the wall fitting it clicks off when you turn it fully down.','front'],
    ['dimmer-plate','cover','Wall plate','The two slotted screws hold the plate to the wall box. Turn it over to see where they pass through.','front'],
    ['dimmer-rear-case','body','Rear case','The green label gives the lamp range, 60 to 400 watts. Look below it for the two wire entries. Either one can take the feed.'],
  ],
  'rose:default':rose,'lamp:bulb':lamp,'socket:default':socket,'fcu:default':fusedSpur,
  'mcb:default':breaker,'mcb3:default':breaker,
  'rcd:default':residualBreaker,'rcd3:default':residualBreaker,'rcbo:default':residualBreaker,
  'transformer:default':[
    ['converter-specific-core','winding','Steel core','The thin steel plates carry the magnetic field from one coil to the other.'],
    ['converter-isolation-barrier','winding','Insulating barrier','The insulation keeps the two windings apart. To check the output, put one probe on SEC 1 and the other on SEC 2.'],
  ],
  'chime:default':[
    ['alarm-transducer','body','Sound bars','The striker taps these metal bars. The small rubber supports let the bars ring.'],
    ['alarm-backup-or-solenoid','body','Return spring','When the button is released, this spring moves the striker back.'],
  ],
  'callchime:default':[['two-note-sound-bars','body','Sound bars','The metal bars ring when struck. FRONT and REAR are separate button connections, so the bench can show which door is calling.']],
};

/** Show details only when the corresponding selectable assembly exists in the model. */
export function fittingDetails(component:ComponentInstance,definition:ComponentDefinition):FittingDetail[]{
  const asset=equipmentAsset(component,definition);
  if(!asset)return [];
  return (byModel[asset.galleryKey]??[]).filter(([id])=>asset.detailFeatures.includes(id))
    .map(([id,part,title,explanation,face])=>({id,part,title,explanation,face:face??'service'}));
}
