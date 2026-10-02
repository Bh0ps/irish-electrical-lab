import * as THREE from 'three';
import type { ComponentInstance, DeviceState } from './types';
import type { EquipmentView } from './Equipment';
import { COMPONENTS } from './components';

const lampTypes=new Set(['lamp','led','emergency']);
const diffuserOff=new THREE.Color('#aeb6ad'),diffuserOn=new THREE.Color('#fff6e9');
const filamentOff=new THREE.Color('#79858b'),filamentOn=new THREE.Color('#ffe8a5');
/** Educational visible output, normalized to the individual lamp's rating.
 * The solver supplies emitting power, including the declared emergency block.
 * Neither dimmer position nor a nearby control can illuminate an unpowered lamp.
 * This is a visual power scale, not a photometric or filament-temperature model. */
export function lampBrightness(component:ComponentInstance,state?:DeviceState):number{
  if(!lampTypes.has(component.type))return 0;
  const watts=Number(component.params.watts??COMPONENTS[component.type]?.defaults.watts);
  const output=state?.lightOutputPower;
  return Number.isFinite(watts)&&watts>0&&typeof output==='number'&&Number.isFinite(output)?THREE.MathUtils.clamp(output/watts,0,1):0;
}
/** Mutate only an instance-owned material; the immutable source stays shared. */
export function applyLampBrightness(material:THREE.MeshStandardMaterial,brightness:number,filament=false):void{
  const level=Number.isFinite(brightness)?THREE.MathUtils.clamp(brightness,0,1):0;
  material.userData.lampOutput=true;material.userData.lampBrightness=level;
  material.color.copy(filament?filamentOff:diffuserOff).lerp(filament?filamentOn:diffuserOn,Math.sqrt(level));
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
export interface AssetPresentation {
  scene:THREE.Group;
  covers:{node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion}[];
  meshes:{node:THREE.Mesh;part:string;material:THREE.Material|THREE.Material[];cutaway?:THREE.Material;light?:THREE.MeshStandardMaterial;indicator?:boolean;lampOutput?:boolean;filament?:boolean;coverAssembly?:boolean;conceptualInternal?:boolean}[];
  motions:{node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;angle:number;current:number}[];
  owned:THREE.Material[];
  initialized:boolean;
}
export function semanticOwner(node:THREE.Object3D):{part?:string;terminal?:string}{
  let part:string|undefined;
  for(let current:THREE.Object3D|null=node;current;current=current.parent){
    if(current.userData.terminalId)return {terminal:String(current.userData.terminalId),part:'terminals'};
    part??=current.userData.partId?String(current.userData.partId):undefined;
  }
  return {part};
}
/** Clone transforms and selectable identity while sharing immutable mesh data. */
export function prepareBlenderModel(source:THREE.Group):AssetPresentation{
  const scene=source.clone(true),presentation:AssetPresentation={scene,covers:[],meshes:[],motions:[],owned:[],initialized:false};
  scene.userData.equipmentSource='Blender';
  let componentType='',componentVariant='';scene.traverse(node=>{if(node.userData.galleryKey)[componentType,componentVariant]=String(node.userData.galleryKey).split(':');});
  scene.traverse(node=>{
    const part=semanticOwner(node).part??'';
    if(node.userData.partId==='cover'&&Array.isArray(node.userData.restPosition))presentation.covers.push({node,position:node.position.clone(),quaternion:node.quaternion.clone()});
    if(node.userData.animation){const axis=sourceAxis(String(node.userData.axis??'z'));const q=node.quaternion,angle=2*Math.atan2(new THREE.Vector3(q.x,q.y,q.z).dot(axis),q.w);presentation.motions.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),angle,current:angle});}
    if(!(node instanceof THREE.Mesh))return;
    node.receiveShadow=true;
    const entry:AssetPresentation['meshes'][number]={node,part,material:node.material};
    for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.partId==='cover'){entry.coverAssembly=true;break;}
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
    if(original instanceof THREE.MeshStandardMaterial&&(lampOutput||part==='emitter'||indicator||original.emissive.r+original.emissive.g+original.emissive.b>0)){
      const light=original.clone();entry.light=light;presentation.owned.push(light);
      entry.indicator=indicator;entry.lampOutput=lampOutput;
      for(let owner:THREE.Object3D|null=node;owner;owner=owner.parent)if(owner.userData.emitterKind==='filament'){entry.filament=true;break;}
    }
    node.castShadow=castsEquipmentShadow(entry.material,!!entry.lampOutput,!!node.userData.lampEnvelope);
    presentation.meshes.push(entry);
  });
  return presentation;
}
export function closedForPresentation(component:ComponentInstance,state?:DeviceState):boolean{
  if(state?.tripped)return false;
  if(component.type==='pushbutton')return Boolean(component.params.on??component.params.pressed);
  if(['switch2','intermediate','selector','changeover'].includes(component.type))return Number(component.params.position??0)===0;
  if(component.type==='dimmer')return component.params.closed!==false;
  return state?.closed??component.params.closed!==false;
}
export function presentBlenderModel(presentation:AssetPresentation,view:EquipmentView,component:ComponentInstance,state?:DeviceState):void{
  for(const cover of presentation.covers){
    cover.node.position.copy(cover.position);cover.node.quaternion.copy(cover.quaternion);
    if(view==='open'){cover.node.position.add(sourceVector([.55,.08,.15]));cover.node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(sourceAxis('y'),Math.PI/2.5));}
    if(view==='exploded')cover.node.position.add(sourceVector([.5,.5,.65]));
  }
  const active=!!state?.energized;
  const brightness=lampBrightness(component,state);
  for(const mesh of presentation.meshes){
    const conceptualInternal=mesh.conceptualInternal||['electronics','coil','thermal','magnetic'].includes(mesh.part)||mesh.part==='winding'&&!['transformer','dcsupply'].includes(component.type);
    mesh.node.visible=!(view==='cutaway'&&mesh.coverAssembly||view==='normal'&&conceptualInternal);
    mesh.node.material=view==='cutaway'&&mesh.cutaway?mesh.cutaway:mesh.light??mesh.material;
    mesh.node.castShadow=castsEquipmentShadow(mesh.node.material,!!mesh.lampOutput,!!mesh.node.userData.lampEnvelope);
    if(mesh.light){
      if(mesh.lampOutput)applyLampBrightness(mesh.light,brightness,mesh.filament);
      else if(mesh.indicator){const on=component.type==='overload'?!!state?.tripped:active;const color=component.type==='overload'?'#e12624':'#43d57d';mesh.light.color.set(on?color:'#253b33');mesh.light.emissive.set(on?color:'#000000');mesh.light.emissiveIntensity=on?.8:0;}
      else if(mesh.part==='emitter'){mesh.light.emissive.set(active?'#ffd394':'#000000');mesh.light.emissiveIntensity=active?.6:0;}
      else mesh.light.emissiveIntensity=active?1.1:0;
    }
  }
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
    if(animation==='translate'){
      const target=sourceVector(((data.useEnergized?active:closed)?data.onPosition:data.offPosition)??[0,0,0]);
      const destination=motion.position.clone().add(target);
      if(immediate)motion.node.position.copy(destination);else motion.node.position.lerp(destination,1-Math.exp(-Math.min(dt,.05)*18));
      moving ||= motion.node.position.distanceToSquared(destination)>1e-8;
      continue;
    }
    const target=animation==='dimmer'?(THREE.MathUtils.clamp(Number(component.params.level??.65),0,1)-.5)*4:animation==='valve'?(active?Number(data.onAngle??.6):Number(data.offAngle??-.6)):closed?Number(data.onAngle??-.115):Number(data.offAngle??.115);
    if(immediate)motion.current=target;else motion.current=THREE.MathUtils.lerp(motion.current,target,1-Math.exp(-Math.min(dt,.05)*18));
    motion.node.quaternion.copy(motion.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(axis,motion.current-motion.angle));
    moving ||= Math.abs(motion.current-target)>.001;
  }
  return moving;
}
