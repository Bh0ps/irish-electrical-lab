import * as THREE from 'three';
import type { ComponentInstance, DeviceState } from './types';
import type { EquipmentView } from './Equipment';
import { COMPONENTS } from './components';
import { attachTerminalBatches } from './terminal-render-batches';
export { disposeBlenderTerminalBatches } from './terminal-render-batches';

const lampTypes=new Set(['lamp','led','emergency','cctstrip']);
const diffuserOff=new THREE.Color('#aeb6ad'),diffuserOn=new THREE.Color('#fff6e9');
const stripPhosphor=new THREE.Color('#f0cf62');
const filamentOff=new THREE.Color('#79858b'),filamentOn=new THREE.Color('#ffe8a5');
/** Educational visible output, normalized to the individual lamp's rating.
 * The solver supplies emitting power, including the declared emergency block.
 * Neither dimmer position nor a nearby control can illuminate an unpowered lamp.
 * This is a visual power scale, not a photometric or filament-temperature model. */
export function lampBrightness(component:ComponentInstance,state?:DeviceState):number{
  if(!lampTypes.has(component.type))return 0;
  const watts=component.type==='cctstrip'?2*Number(component.params.channelWatts??12):Number(component.params.watts??COMPONENTS[component.type]?.defaults.watts);
  const output=state?.lightOutputPower;
  return Number.isFinite(watts)&&watts>0&&typeof output==='number'&&Number.isFinite(output)?THREE.MathUtils.clamp(output/watts,0,1):0;
}
/** Mutate only an instance-owned material; the immutable source stays shared. */
export function applyLampBrightness(material:THREE.MeshStandardMaterial,brightness:number,filament=false,unlitColour?:THREE.Color):void{
  const level=Number.isFinite(brightness)?THREE.MathUtils.clamp(brightness,0,1):0;
  material.userData.lampOutput=true;material.userData.lampBrightness=level;
  material.color.copy(unlitColour??(filament?filamentOff:diffuserOff)).lerp(filament?filamentOn:diffuserOn,Math.sqrt(level));
  material.emissive.set(level>0?'#ffd394':'#000000');
  material.emissiveIntensity=(filament?3:2.4)*level;
}

/** Light passes through its own emitting diffuser and glass envelope. Three's
 * default shadow depth material otherwise treats these closed meshes as opaque
 * and can extinguish a point light located inside a luminaire. Opaque mounting
 * hardware still casts; inspection glass changes only the presented shadow. */
export function castsEquipmentShadow(material:THREE.Material|THREE.Material[],lampOutput=false,lampEnvelope=false):boolean{
  if(lampOutput||lampEnvelope)return false;
  return (Array.isArray(material)?material:[material]).some(surface=>
    !(surface.transparent&&surface.opacity<1)&&
    !(surface instanceof THREE.MeshPhysicalMaterial&&surface.transmission>0));
}

const sourceVector=(value:number[])=>new THREE.Vector3(value[0],value[2],-value[1]);
const sourceAxis=(axis:string)=>sourceVector(axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1]);
function raycastVisible(this:THREE.Mesh,caster:THREE.Raycaster,hits:THREE.Intersection[]){
  for(let node:THREE.Object3D|null=this;node;node=node.parent)if(!node.visible)return;
  THREE.Mesh.prototype.raycast.call(this,caster,hits);
}
export interface AssetPresentation {
  scene:THREE.Group;
  covers:{node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion}[];
  chamber:boolean;
  probeDocks:{node:THREE.Object3D;red:boolean}[];
  doors:{node:THREE.Object3D;rest:THREE.Quaternion}[];
  shields:THREE.Object3D[];
  benchStands:THREE.Object3D[];
  meshes:{node:THREE.Mesh;part:string;material:THREE.Material|THREE.Material[];pickingMaterial?:THREE.Material;cutaway?:THREE.Material;light?:THREE.MeshStandardMaterial;indicator?:boolean;contactFlag?:boolean;lampOutput?:boolean;filament?:boolean;coverAssembly?:boolean;serviceChamber?:boolean;conceptualInternal?:boolean}[];
  terminalBatches:THREE.Mesh[];
  motions:{node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;angle:number;current:number}[];
  owned:THREE.Material[];
  initialized:boolean;
}
export function semanticOwner(node:THREE.Object3D):{part?:string;terminal?:string;detail?:string}{
  let part:string|undefined,detail:string|undefined;
  for(let current:THREE.Object3D|null=node;current;current=current.parent){
    if(current.userData.terminalId)return {terminal:String(current.userData.terminalId),part:'terminals'};
    detail??=current.userData.detailId?String(current.userData.detailId):undefined;
    part??=current.userData.partId?String(current.userData.partId):undefined;
  }
  return {part,detail};
}
/** Clone transforms and selectable identity while sharing immutable mesh data. */
export function prepareBlenderModel(source:THREE.Group,batchDistantTerminals=false):AssetPresentation{
  const scene=source.clone(true),presentation:AssetPresentation={scene,covers:[],meshes:[],terminalBatches:[],motions:[],doors:[],shields:[],benchStands:[],probeDocks:[],owned:[],initialized:false,chamber:false};
  scene.userData.equipmentSource='Blender';
  let componentType='',componentVariant='';scene.traverse(node=>{if(node.userData.galleryKey)[componentType,componentVariant]=String(node.userData.galleryKey).split(':');});
  scene.traverse(node=>{
    const part=semanticOwner(node).part??'';
    if(node.userData.probeSide)presentation.probeDocks.push({node,red:node.userData.probeSide==='red'});
    if(node.userData.boardDoor)presentation.doors.push({node,rest:node.quaternion.clone()});
    if(node.userData.benchOnly)presentation.benchStands.push(node);
    if(node.userData.boardShield)presentation.shields.push(node);
    if(node.userData.partId==='cover'&&Array.isArray(node.userData.restPosition))presentation.covers.push({node,position:node.position.clone(),quaternion:node.quaternion.clone()});
    if(node.userData.animation){const axis=sourceAxis(String(node.userData.axis??'z'));const q=node.quaternion,angle=2*Math.atan2(new THREE.Vector3(q.x,q.y,q.z).dot(axis),q.w);presentation.motions.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),angle,current:angle});}
    if(!(node instanceof THREE.Mesh))return;
    node.receiveShadow=true;
    node.raycast=raycastVisible;
    const entry:AssetPresentation['meshes'][number]={node,part,material:node.material};
    for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.partId==='cover'){entry.coverAssembly=true;break;}
    for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.serviceChamber){entry.serviceChamber=true;presentation.chamber=true;break;}
    for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.conceptualInternal){entry.conceptualInternal=true;break;}
    let constructionDetail=false;for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.detailId){constructionDetail=true;break;}
    if(part==='body'&&!constructionDetail||node.userData.inspectionHousing){
      const cutaway=new THREE.MeshStandardMaterial({color:'#97bcb1',transparent:true,opacity:.14,depthWrite:false,roughness:.5,metalness:.04});entry.cutaway=cutaway;presentation.owned.push(cutaway);
    }
    if(node.userData.lampEnvelope){
      const glass=new THREE.MeshStandardMaterial({color:'#d9e5df',transparent:true,opacity:.12,depthWrite:false,roughness:.12,metalness:0});entry.cutaway=glass;presentation.owned.push(glass);
    }
    const original=Array.isArray(node.material)?node.material[0]:node.material;
    node.geometry.computeBoundingBox();const dimensions=node.geometry.boundingBox?.getSize(new THREE.Vector3());
    // Original opal covers are the visible diffuser on battens/downlights; LED
    // chip banks remain visible when their cover is removed. Preserve the part
    // identities rather than moving these surfaces into the electrical emitter.
    const lampOutput=original instanceof THREE.MeshStandardMaterial&&lampTypes.has(componentType)&&(part==='emitter'||part==='cover'&&componentVariant!=='bulb'&&original.color.getHexString()==='f5f2e9'||part==='electronics'&&original.color.getHexString()==='eee8df');
    const indicator=part==='display'&&(componentType==='indicator'||!!dimensions&&Math.max(dimensions.x,dimensions.y,dimensions.z)<.085);
    for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.contactFlag){entry.contactFlag=true;break;}
    if(original instanceof THREE.MeshStandardMaterial&&(entry.contactFlag||lampOutput||part==='emitter'||indicator||original.emissive.r+original.emissive.g+original.emissive.b>0)){
      const light=original.clone();entry.light=light;presentation.owned.push(light);
      entry.indicator=indicator;entry.lampOutput=lampOutput;
      for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.emitterKind==='filament'){entry.filament=true;break;}
    }
    node.castShadow=castsEquipmentShadow(entry.material,!!entry.lampOutput,!!node.userData.lampEnvelope);
    presentation.meshes.push(entry);
  });
  if(batchDistantTerminals)attachTerminalBatches(source,presentation);
  return presentation;
}
export function closedForPresentation(component:ComponentInstance,state?:DeviceState):boolean{
  if(state?.tripped)return false;
  if(component.type==='pushbutton')return Boolean(component.params.on??component.params.pressed);
  if(['switch2','intermediate','selector','changeover'].includes(component.type))return Number(component.params.position??0)===0;
  if(component.type==='dimmer')return component.params.closed!==false;
  return state?.closed??component.params.closed!==false;
}
export function presentBlenderModel(presentation:AssetPresentation,view:EquipmentView,component:ComponentInstance,state?:DeviceState,contactPiece?:'reed'|'magnet'):void{
  const batch=view==='normal'&&!contactPiece;
  for(const mesh of presentation.terminalBatches)mesh.visible=batch;
  for(const dock of presentation.probeDocks)dock.node.visible=!(dock.red?component.params.redOut:component.params.blackOut);
  for(const door of presentation.doors)door.node.quaternion.copy(door.rest).multiply(new THREE.Quaternion().setFromAxisAngle(sourceAxis('y'),component.params.doorOpen!==false||view!=='normal'?-1.69:0));
  for(const stand of presentation.benchStands)stand.visible=!component.mount&&view==='normal';
  for(const shield of presentation.shields)shield.visible=view==='normal'&&!component.params.frontOff;
  for(const cover of presentation.covers){
    cover.node.position.copy(cover.position);cover.node.quaternion.copy(cover.quaternion);
    if(component.mount&&COMPONENTS[component.type].model==='protection'&&!cover.node.userData.fittedDin)cover.node.position.add(sourceVector([0,0,.24]));
    if(view==='open'){cover.node.position.add(sourceVector([presentation.chamber?1:.55,.08,.15]));cover.node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(sourceAxis('y'),Math.PI/2.5));}
    if(view==='exploded')cover.node.position.add(sourceVector([.5,.5,.65]));
  }
  const active=!!state?.energized;
  const brightness=lampBrightness(component,state);
  const clearBulb=component.type==='lamp'&&presentation.meshes.some(m=>m.node.userData.lampEnvelope);
  for(const mesh of presentation.meshes){
    const visibleBulbStem=clearBulb&&mesh.part==='electronics';
    const conceptualInternal=!visibleBulbStem&&(mesh.conceptualInternal||['electronics','coil','thermal','magnetic'].includes(mesh.part)||mesh.part==='winding'&&!['transformer','dcsupply'].includes(component.type));
    mesh.node.visible=!(view==='cutaway'&&mesh.coverAssembly||view==='normal'&&(conceptualInternal||mesh.serviceChamber));
    if(component.variant==='door-contact' && contactPiece){
      mesh.node.visible &&= (mesh.part==='actuator')===(contactPiece==='magnet');
    }
    mesh.node.material=batch&&mesh.pickingMaterial?mesh.pickingMaterial:view==='cutaway'&&mesh.cutaway?mesh.cutaway:mesh.light??mesh.material;
    mesh.node.castShadow=!(batch&&mesh.pickingMaterial)&&castsEquipmentShadow(mesh.node.material,!!mesh.lampOutput,!!mesh.node.userData.lampEnvelope);
    if(mesh.light){
      if(mesh.contactFlag){mesh.light.color.set(closedForPresentation(component,state)?'#b33529':'#417f49');}
      else if(mesh.lampOutput){
        if(mesh.node.userData.lampEnvelope && component.type==='lamp' && mesh.light.transparent){
          // A clear GLS bulb emits at the tungsten coil. Keep the glass
          // transparent and allow a small reflection when the coil is hot.
          mesh.light.userData.lampBrightness=brightness;
          mesh.light.color.setRGB(.76+brightness*.15,.84+brightness*.10,.87+brightness*.08);
          mesh.light.emissive.set(brightness>0?'#ffe4ac':'#000000');mesh.light.emissiveIntensity=brightness*.24;
        }else if(component.type==='cctstrip'){
          let channel:string|undefined;for(let n:THREE.Object3D|null=mesh.node;n&&!channel;n=n.parent)channel=n.userData.ledChannel;
          const level=THREE.MathUtils.clamp(Number(state?.[channel==='C'?'coolWatts':'warmWatts']??0)/Math.max(.001,Number(component.params.channelWatts??12)),0,1);
          applyLampBrightness(mesh.light,level);if(level>0&&channel==='C')mesh.light.emissive.set('#c3deff');
        }else applyLampBrightness(mesh.light,brightness,mesh.filament,component.type==='led'&&component.variant==='strip'?stripPhosphor:undefined);
      }
      else if(mesh.indicator){const on=component.type==='overload'?!!state?.tripped:active;const color=component.type==='overload'?'#e12624':'#43d57d';mesh.light.color.set(on?color:'#253b33');mesh.light.emissive.set(on?color:'#000000');mesh.light.emissiveIntensity=on?.8:0;}
      else if(mesh.part==='emitter'){mesh.light.emissive.set(active?'#ffd394':'#000000');mesh.light.emissiveIntensity=active?.6:0;}
      else mesh.light.emissiveIntensity=active?1.1:0;
    }
  }
  presentation.scene.userData.splitContact=contactPiece;
  animateBlenderModel(presentation,component,state,0,!presentation.initialized);presentation.initialized=true;
  presentation.scene.updateMatrixWorld(true);
}
/** Deterministic operating visuals. Topology and canonical terminals are never moved. */
export function animateBlenderModel(presentation:AssetPresentation,component:ComponentInstance,state:DeviceState|undefined,dt:number,immediate=false):boolean{
  const closed=closedForPresentation(component,state),active=!!state?.energized;let moving=false;
  for(const motion of presentation.motions){
    const data=motion.node.userData,animation=String(data.animation),axis=sourceAxis(String(data.axis??'z'));
    if(animation==='rotor'){
      if(active){motion.current+=Math.min(dt,.05)*Number(data.speed??6)*(Number(state?.direction)||1);motion.node.quaternion.copy(motion.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(axis,motion.current-motion.angle));moving=dt>0;}
      continue;
    }
    if(animation==='translate' && presentation.scene.userData.splitContact){motion.node.position.copy(motion.position);continue;}
    if(animation==='translate'){
      const target=sourceVector(((data.useEnergized?active:closed)?data.onPosition:data.offPosition)??[0,0,0]);
      const destination=motion.position.clone().add(target);
      if(immediate)motion.node.position.copy(destination);else motion.node.position.lerp(destination,1-Math.exp(-Math.min(dt,.05)*18));
      moving ||= motion.node.position.distanceToSquared(destination)>1e-8;
      continue;
    }
    const target=animation==='valvePosition'?-Math.PI*.5*Number(state?.level??0):animation==='pwmLevel'||animation==='pwmMix'?(Number(component.params[animation==='pwmMix'?'mix':'level']??.5)-.5)*-4.0:animation==='testerDial'?-THREE.MathUtils.clamp(Number(component.params.dialPosition??0),0,3)*.55:animation==='dimmer'?((closed?THREE.MathUtils.clamp(Number(component.params.level??.65),0,1):0)-.5)*4:animation==='valve'?(active?Number(data.onAngle??.6):Number(data.offAngle??-.6)):closed?Number(data.onAngle??-.115):Number(data.offAngle??.115);
    if(immediate)motion.current=target;else motion.current=THREE.MathUtils.lerp(motion.current,target,1-Math.exp(-Math.min(dt,.05)*18));
    motion.node.quaternion.copy(motion.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(axis,motion.current-motion.angle));
    moving ||= Math.abs(motion.current-target)>.001;
  }
  return moving;
}
