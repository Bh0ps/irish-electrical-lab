import type {Vec3} from './types';

export interface SitePose {position:Vec3;yaw:number;pitch:number;walking?:boolean;fitOnResize?:boolean}
export interface SavedSitePose extends SitePose {job:string;focus:number}
export interface SiteFocus {id:number;component?:string;restore?:SitePose;overview?:boolean}

/** A final frame from the previous fitting can land after a new visit was requested. */
export function previousSiteView(saved:SavedSitePose|undefined,job:string,focus:SiteFocus){
  return saved?.job===job&&saved.focus===focus.id?saved:focus.restore;
}
