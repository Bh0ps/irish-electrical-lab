'use client';
import { useLayoutEffect } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { publicAssetUrl } from '../../web/asset-url';

const paths=['wood','plaster'].flatMap(surface=>['diff','nor_gl','arm'].map(channel=>publicAssetUrl('/site-assets/'+surface+'-'+channel+'.jpg')));

/** The instanced furniture and room panels have different dimensions. Keep the
 * photographed grain and plaster at the same scale across adjacent surfaces. */
function physicalUV(material:THREE.MeshStandardMaterial,painted:boolean){
  material.customProgramCacheKey=()=>painted?'site-painted-plaster':'site-stained-wood';
  material.onBeforeCompile=shader=>{
    if(painted)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      'vec3 paintColour=diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb=mix(paintColour*.92,diffuseColor.rgb,.12);');

    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 dimensions = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 surface = position * dimensions + instanceMatrix[3].xyz;
        vec3 direction = abs(normal);
        vec2 metres = direction.y > 0.5 ? surface.xz : direction.z > 0.5 ? surface.xy : surface.zy;
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(metres, 1.)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(metres, 1.)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = (roughnessMapTransform * vec3(metres, 1.)).xy;
        #endif
      #endif`);
  };
}

export function SiteFinishes({materials}:{materials:Record<string,THREE.Material>}){
  const maps=useTexture(paths);
  const {invalidate,gl}=useThree();
  useLayoutEffect(()=>{
    const restore: (()=>void)[]=[];
    for(const [index,surface] of ['wood','plaster'].entries()){
      const [albedo,normal,roughness]=maps.slice(index*3,index*3+3);
      albedo.colorSpace=THREE.SRGBColorSpace;
      for(const map of [albedo,normal,roughness]){
        map.wrapS=map.wrapT=THREE.RepeatWrapping;
        map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());
        map.repeat.setScalar(surface==='wood'?1/1.5:1);
        map.needsUpdate=true;
      }
      const names=surface==='wood'?['oak','walnut']:['wall0','wall1','wall2'];
      for(const name of names){
        const material=materials[name] as THREE.MeshStandardMaterial;
        const previous={map:material.map,normalMap:material.normalMap,roughnessMap:material.roughnessMap,onBeforeCompile:material.onBeforeCompile,customProgramCacheKey:material.customProgramCacheKey,roughness:material.roughness};
        const tint=material.color.clone(),strength=material.normalScale.clone();
        restore.push(()=>{Object.assign(material,previous);material.color.copy(tint);material.normalScale.copy(strength);material.needsUpdate=true;});
        material.map=albedo;material.normalMap=normal;material.roughnessMap=roughness;material.roughness=1;
        if(surface==='wood')material.color.set(name==='oak'?'#fff7e9':'#ccbaaa');
        material.normalScale.setScalar(surface==='wood'?.48:.32);
        physicalUV(material,surface==='plaster');
        material.needsUpdate=true;
      }
    }
    invalidate();
    return ()=>{for(const reset of restore)reset();};
  },[maps,materials,gl,invalidate]);
  return null;
}
