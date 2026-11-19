import {UTILITY_BOARD,cupboardLeaf,utilityCupboard} from '../../lib/consumer-unit-site';
import type {Vec3} from '../../lib/types';

/** The existing utility room has a clear service bay to the left of the worktop. */
export function cupboardJoinery(add:(p:Vec3,s:Vec3,finish:string)=>void){
  const {wall}=UTILITY_BOARD,{x,width:w,depth:d,height:h,plinth}=utilityCupboard;
  const box=(a:number,b:number,c:number,l:number,m:number,n:number,finish:string)=>add([a,b,c],[l,m,n],finish);
  for(const side of [-1,1]){
    box(x+side*(w-.021)/2,h/2,wall+d/2,.021,h,d,'paint');
    box(x+side*(w-.032)/2,h/2,wall+d,.040,h,.017,'trim');
  }
  box(x,plinth/2,wall+d-.019,w-.041,plinth,.031,'trim');
  box(x,plinth,wall+d/2,w-.042,.020,d,'cream');
  // The upper shelf has a rear notch for the actual rising duct.
  const duct=x-.061,opening=.083,head=h-.013;
  const left=x-w/2+.021,right=x+w/2-.021;
  for(const [a,b] of [[left,duct-opening/2],[duct+opening/2,right]]){
    box((a+b)/2,head,wall+d/2,b-a,.024,d,'cream');
  }
  box(duct,head,wall+.082+(d-.082)/2,opening,.024,d-.082,'cream');
  box(x,h-.037,wall+d,w,.077,.025,'trim');
  // A single open cupboard door and the actual clear enclosure door are separate leaves.
  const leaf=cupboardLeaf;
  box(leaf.x,h/2,leaf.z,leaf.w,h-.038,leaf.d-.016,'paint');
  for(const side of [-1,1]){
    box(leaf.x+side*.017,h/2,leaf.z,.003,h-.18,leaf.d-.145,'cream');
    for(const y of [.58,1.66]){
      box(leaf.x+side*.021,y,leaf.z,.006,.92,leaf.d-.208,'paint');
    }
  }
  for(const y of [.30,1.16,2.02]){
    box(leaf.x-.018,y,wall+d+.012,.012,.065,.032,'metal');
  }
  box(leaf.x-.025,1.07,leaf.z+leaf.d/2-.066,.023,.144,.024,'metal');
  box(leaf.x-.041,1.10,leaf.z+leaf.d/2-.108,.018,.021,.096,'metal');
}
