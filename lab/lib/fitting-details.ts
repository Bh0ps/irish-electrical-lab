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
  ['ceramic-terminal-insert','body','Two lamp contacts','Each wire ends in its own brass pillar. Ceramic separates them. A spring contact carries current from each pillar to the base of the bulb.'],
  ['b22-earth-bond','body','Earth connection','The earth terminal is joined to the brass body. It gives a fault current a return path if a live wire touches the metal.'],
  ['b22-bayonet-shell','body','How the bulb locks in','The two side pins enter slots in the holder. A short turn seats them while the two contacts press against the base of the bulb.','front'],
  ['tungsten-coiled-filament','emitter','Filament','Inside the glass, this fine coil heats up and glows when current flows. Watch it as you change the dimmer.','front'],
];
const earth:Feature=['linked-earth-strap','mounting','Earth strap','Follow the folded strip from one earth terminal to the other. It also touches the metal sleeves around the fixing screws.'];
const socket:Feature[]=[earth,['socket-contact-system','pins','Socket shutters','The shutters cover the live and neutral openings when the plug is out. The metal contacts behind them grip the plug pins.','front']];
const fusedSpur:Feature[]=[earth,
  ['851-rocker','actuator','Rocker position','The red edge shows that the rocker is on. It can still show if the fuse has blown or the supply is off.','front'],
  ['851-fuse-drawer','fuse','Captive fuse carrier','The small notch is beside the cover marked FUSE. In the inspection view the carrier slides out and stays attached.','front'],
  ['851-cartridge','fuse','Cartridge fuse','The ceramic cartridge sits inside the drawer. If it blows, the appliance loses its line supply. Its appearance alone does not tell you whether it conducts.','front'],
  ['851-in-load-markings','body','Supply and appliance terminals','IN is the supply side. LOAD goes to the appliance. Find L for line and N for neutral beside the openings.'],
  ['accessory-strain-relief','mounting','Cord grip','The lower opening is for the whole flex. The bridge holds its outer sheath so a tug does not pull on the individual cores.'],
  ['socket-contact-system','contacts','Double-pole switch','The switch opens both line and neutral. The separate cartridge fuse is in the line path.'],
];
const breaker:Feature[]=[
  ['din-latch','mounting','Rail clip','This clip hooks the breaker onto the metal rail at the back of the board.'],
  ['protection-mechanism','contacts','Trip latch','When the breaker trips, the latch lets go. The metal contacts spring apart and cut the feed.'],
];
const residualBreaker:Feature[]=[...breaker,['contact-indicator','contacts','Contact window','This little window shows whether the contacts are open or closed. It cannot tell you whether there is voltage at a terminal.','front']];
const byModel:Record<string,Feature[]>={
  'heater:plx050e':[
    ['plxe-inlet','body','Cool air inlet','Air enters at the bottom of the case, passes the heating element and leaves through the upper grille.','front'],
    ['plxe-outlet','cover','Upper air outlet','Look between the white blades. The open gaps allow warm air to leave the front of the heater.','front'],
    ['plxe-controls','body','Manual temperature control','The top-right panel has six touch keys. Use the two arrows to lower or raise the target room temperature.','front'],
    ['plxe-fitted-flex','body','Factory-fitted flex','The flexible cord enters at the lower right. The wall switch disconnects line and neutral. The green and yellow core stays joined to the case.'],
    ['plxe-wall-bracket','mounting','Wall bracket','Two lower hooks and two upper spring latches hold the heater on a steel H-frame.'],
    ['heat-transfer-construction','element','Finned element','The element heats the aluminium fins. Air carries heat away. In the lab you can check the electrical power with the meter.','front'],
  ],
  'switch:dc-rocker':[
    ['rg-rocker','actuator','Black rocker','Press one end to close the contact. Press the other to open it. The rocker stays where you leave it.','front'],
    ['rg-clips','mounting','Panel clips','The ridged spring clips squeeze in as the switch enters the rectangular cutout, then hold the frame against the panel.'],
    ['rg-base','body','Numbered base','Positions 1 and 2 have blades. Position 3 is moulded into the base but has no blade on this on/off switch.'],
  ],
  'switch:single-rocker':rocker,'switch2:single-rocker':[
    ['bg812-operator','actuator','Two-way rocker','Press either end of the rocker. It chooses which of the two paths joins COM.','front'],
    ['faceplate-fixing','cover','Plate and wall box','Two white caps hide the screws that secure this plate to the wall box. The box has a threaded lug at either side.','front'],
    ['switch-contact-mechanism','contacts','Changeover contact','In cutaway view, operate the rocker. A moving contact reaches one strapper at a time. Its hidden shape is illustrated for study.'],
    ...rocker,
  ],'intermediate:single-rocker':rocker,
  'switch:gang-module-left':rocker,'switch:gang-module-right':rocker,
  'led:strip':[
    ['flexible-copper-tracks','body','Cut mark and copper pads','The printed line marks the end of a section. Put the probes on the bare pads beside it. Look for +24V and −.','front'],
    ['surface-mount-bodies','body','Packages and resistors','The white cases hold the LEDs. The small dark parts between them are resistors.','front'],
    ['smd-led-packages','emitter','Seven LED windows','Current through the LEDs lights these yellow windows. This 100 mm section has seven.','front'],
  ],
  'fan:xf100s':[
    ['xf-intake','cover','Front grille','Air enters around the round centre. The two white screw caps cover the screws that hold the grille on.','front'],
    ['xf-spigot','body','Duct spigot','This round outlet slips into a 100 mm duct. The air leaves the bathroom here.'],
    ['xf-impeller','rotor','Impeller','The motor turns these curved blades behind the grille. The centre and four spokes on the cover stay still.','front'],
    ['xf-base','mounting','Fixing base','Four slotted holes hold the base to the wall. The cable enters behind the cover beside the two terminals.','front'],
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
  'callchime:croma-100a':[
    ['croma-acrylic','cover','Frosted front panel','Open the front panel to see the two call connections.','front'],
    ['croma-rear-entry','body','K1 cable entry','The wires enter through one opening in the back and separate before they reach the terminal screws.'],
    ['croma-sound-outlet','body','Speaker grille','Sound passes through the small holes in front of the speaker.'],
    ['alarm-transducer','electronics','Loudspeaker','The two buttons send separate signals to one electronic chime. The speaker and board inside the case are simplified for inspection.'],
    ['alarm-backup-or-solenoid','body','Empty battery compartment','This installation uses its bell transformer. The four C-cell positions are empty.'],
    ['croma-sound-controls','actuator','Sound settings','The real chime has a volume wheel and two setup buttons. The lab uses two fixed training calls.'],
  ],
};

/** Show details only when the corresponding selectable assembly exists in the model. */
export function fittingDetails(component:ComponentInstance,definition:ComponentDefinition):FittingDetail[]{
  const asset=equipmentAsset(component,definition);
  if(!asset)return [];
  return (byModel[asset.galleryKey]??[]).filter(([id])=>asset.detailFeatures.includes(id))
    .map(([id,part,title,explanation,face])=>({id,part,title,explanation,face:face??'service'}));
}
