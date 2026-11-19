/** The six surfaces of the study probe, measured along the grip from the
 * contact tip. Keeping one profile makes the mesh and its clearance checks agree.
 * All lengths and radii are in millimetres. */
export const siteProbeSegments=[
  {start:0,end:3.2,base:.10,top:.48,facets:12},
  {start:3.2,end:11.2,base:.75,top:1.55,facets:12},
  {start:11.2,end:13.2,base:3.2,top:3.7,facets:16},
  {start:13,end:73,base:2.8,top:2.5,facets:16},
  {start:73,end:81,base:2.4,top:1.25,facets:12},
  {start:81,end:201,base:1.1,top:1.1,facets:10},
] as const;
