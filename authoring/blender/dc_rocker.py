"""Original Switch Components RG1-1A-DC-1-B study fitting, drawing rev B.

Panel mounting plane z=0, face up +Z. Dimensions below are mm. The vertical
installation turns the long dimension of the maker's front view upright.
"""
import math
import bpy


def build_dc_rocker(recipe,root,api):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj,do_unlink=True)
    root['detailFamily']='switch'
    root['detailRevision']=3
    frame=api.empty('Panel mounting plane',root,(0,.48,0))
    body=api.semantic('body',frame)
    mount=api.semantic('mounting',frame)
    bezel=api.semantic('cover',frame)
    contacts=api.semantic('contacts',frame)
    ports=api.semantic('terminals',frame)
    rocker=api.semantic('actuator',frame)
    rocker['animation']='rotate'
    rocker['axis']='x'
    rocker['onAngle']=-.17
    rocker['offAngle']=.17
    rocker.location.z=.046
    nylon=api.material('Satin black nylon 66',(.019,.022,.028),0,.38)
    dark=api.material('Moulded black base nylon',(.023,.026,.032),0,.45)
    lever=api.material('Fine-grain rocker',(.036,.038,.043),0,.44)
    relief=api.material('Raised base numerals',(.061,.064,.070),0,.49)
    rating=api.material('Switch close-up rating moulding',(.061,.064,.070),0,.49)
    steel=api.material('Plated male blade',(.65,.66,.62),.78,.31)
    brass=api.material('Spring copper contact',(.56,.29,.080),.73,.31)
    silver=api.material('Contact silver',(.72,.72,.69),.84,.24)
    tin=api.material('Tinned push-on tab spring',(.51,.54,.54),.75,.34)
    boot=api.material('Red insulated crimp sleeve',(.49,.045,.026),0,.34)
    convert=lambda p:tuple(n/40 for n in p)

    def detail(key,text,owner,**props):
        return api.empty(key,owner,data={'detailId':key,'detailPurpose':text,**props})
    def box(name,p,size,parent,mat,bevel=.20):
        return api.box(name,convert(p),convert(size),parent,mat,bevel/40)
    def cyl(name,p,r,depth,parent,mat,n=32):
        return api.cyl(name,convert(p),r/40,depth/40,parent,mat,vertices=n)
    def cut(target,cutter):
        bpy.context.view_layer.update()
        api.boolean_difference(target,cutter)
    def mesh(name,vertices,faces,parent,mat,bevel=.10):
        data=bpy.data.meshes.new(name)
        data.from_pydata([convert(p) for p in vertices],[],faces);data.update()
        o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);api.setmesh(o,parent,mat)
        for f in data.polygons:f.use_smooth=False
        if bevel:
            mod=o.modifiers.new('Tooled edges','BEVEL');mod.width=bevel/40;mod.segments=3
            mod=o.modifiers.new('Planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True
        return o
    def across(name,profile,width,parent,mat,bevel=.1,centre=0):
        # Stamp a profile in the y/z plane and give it a width across x.
        vs=[(x,y,z) for x in (centre-width/2,centre+width/2) for y,z in profile]
        n=len(profile)
        return mesh(name,vs,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2)),*[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]],parent,mat,bevel)
    def section(name,rings,parent,mat):
        # Sweep a hollow rounded-rectangle ring through the curved upper bezel.
        vs=[]
        for w,h,r,z in rings:
            for cx,cy,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
                for j in range(9):
                    a=math.radians(start+90*j/8);vs.append((cx+r*math.cos(a),cy+r*math.sin(a),z))
        n=36
        return mesh(name,vs,[(s*n+i,s*n+(i+1)%n,((s+1)%len(rings))*n+(i+1)%n,((s+1)%len(rings))*n+i)
            for s in range(len(rings)) for i in range(n)],parent,mat,.025)
    base=detail('rg-base','The numbers beside the two populated blade positions match the circuit drawing. The moulding also has a spare position marked 3.',body,keepDistanceSurface=True)
    # The operator can see the rocker through this real upper opening.
    casing=box('Hollow tapered switch moulding',(0,0,-9.5),(12.2,27.2,20.0),base,dark,.6)
    casing['inspectionHousing']=True
    cut(casing,box('Switch chamber',(0,0,-8.1),(10.0,23.1,20.1),base,None,.48))
    # Square cut sides, shallow floor, raised rim and a visible assembly seam.
    floor=box('Terminal base moulding',(0,0,-19.9),(12.1,22.2,2),base,dark,.48)
    # Circular ejector-pin witnesses and edge ribs on the broad photographed sides.
    for x in [-1,1]:
        witness=cyl('Recessed tool witness',(x*6.16,0,-4.3),1.32,.75,base,None)
        witness.rotation_euler.y=math.pi/2;cut(casing,witness)
        for y in [-8.5,8.5]:
            box('Short side strengthening rib',(x*6.24,y,-2.25),(.45,.7,3.55),base,dark,.1)
        for y in [-9.3,0,9.3]:
            mark=cyl('Round rear mould witness',(x*3.5,y,-20.98),1.04,.38,base,None)
            cut(floor,mark)
    section('Stepped rectangular bezel',[(18.0,31.1,2.3,-.1),(18.5,31.5,2.45,.25),
        (16.5,29.0,1.75,1.52),(15.8,28.3,1.65,1.6),(10.0,20.6,1.05,1.6),
        (9.75,20.4,.96,.75),(9.75,20.4,.96,-.9),(15.2,28.2,1.7,-.9),(15.2,28.2,1.7,-.1)],bezel,nylon)
    moving=detail('rg-rocker','The unlit black nylon rocker tilts on its two side pivots. It latches at either end and operates a single contact inside.',rocker,keepDistanceSurface=True)
    contour=[(-9.9,-1.3),(-9.95,2.05),(-9.65,2.48)]
    for j in range(1,48):
        y=-9.65+j*19.3/48
        contour.append((y,1.05+1.43*(y/9.65)**2))
    contour.extend([(9.65,2.48),(9.95,2.05),(9.9,-1.3)])
    cap=across('Shallow dished rocker face',contour,9.8,moving,lever,.32)
    for poly in cap.data.polygons:
        if abs(poly.normal.x)<.01 and abs(poly.normal.z)>.6:poly.use_smooth=True
    box('Moving plunger stem',(0,0,-2.4),(6.8,9.1,4.8),moving,nylon,.65)
    for side in [-1,1]:
        pivot=cyl('Moulded pivot button',(side*5.5,0,-1.85),1.45,1.8,moving,nylon)
        pivot.rotation_euler.y=math.pi/2
        box('Short retaining lip',(side*5.8,0,-.8),(.7,23.8,1.6),base,nylon,.23)
    # Four spring ears and actual separate rows of teeth, based on both product photographs.
    clips=detail('rg-clips','Two resilient catches at each end squeeze through a thin panel. Their teeth sit behind the edge of its rectangular opening.',mount)
    for side in [-1,1]:
        for x in [-4.47,4.47]:
            form=[(side*y,z) for y,z in [(10.5,-19.9),(11.8,-19.5),(13.1,-15.7),(17.1,-6.5),(16.45,-5.5),(15.1,-5.8),(11.75,-15.35),(10.15,-17.7)]]
            across('Bowed panel spring',form,3.1,clips,dark,.18,x)
            for tooth in range(8):
                z=-6.5+tooth*.68
                y=17.05-tooth*.25
                across('Snap tooth',[(side*(y-.65),z-.24),(side*(y+.15),z-.12),(side*(y-.15),z+.34),(side*(y-.75),z+.24)],3.07,clips,nylon,.07,x)
    # Visible only in cutaway or exploded views; dimensions of these mechanisms
    # are illustrative, while the external blade positions follow the drawing.
    inside=detail('rg-moving-contact','The spring presses a moving contact onto the fixed contact. Its exact factory mechanism is represented by this cutaway.',contacts,conceptualInternal=True)
    box('Fixed copper tongue',(0,9.3,-16.4),(4.5,.9,6.4),inside,brass,.15)
    box('Central fulcrum',(0,0,-16),(4.8,1.4,8.4),inside,brass,.2)
    arm=api.empty('Over-centre contact motion',inside,convert((0,0,-14.2)),data={'animation':'rotate','axis':'x','onAngle':-.07,'offAngle':.20})
    across('Bent moving contact',[(-4,.7),(-3,1.2),(0,-1.3),(8.8,.45),(9.8,.5),(9.8,-.2),(0,-2.15),(-3,.3)],3.5,arm,brass,.13)
    cyl('Moving silver contact',(0,8.85,-.29),1.28,.5,arm,silver)
    cyl('Fixed silver contact',(0,9.3,-14.9),1.35,.45,inside,silver)
    # The product image shows these three moulded station numbers on the side
    # above the terminal line, including an unpopulated third station.
    for mark,y in [('1',9.3),('2',0),('3',-9.3)]:
        o=api.label(mark,convert((-6.12,y,-18.6)),base,relief,size=2.3/40);o.rotation_euler.y=-math.pi/2
    o=api.label('16A 12VDC',convert((-6.13,0,-10.2)),base,rating,size=1.45/40);o.rotation_euler.y=-math.pi/2
    for term in recipe['terminals']:
        tid=term['id'];y=(term['anchor'][1]-.48)*40
        pin=api.empty('port:'+tid,ports,convert((0,y,-30.9)),data={'terminalId':tid,'fieldMarking':term['label'],
            'fieldLegendModelled':True,'entryDirection':term['entryDirection'],'contactForm':'pin'})
        # Node +Z is the same rearward wire-entry axis as the canonical terminal.
        pin.rotation_euler.y=math.pi
        tab=detail('terminal-clamp:'+tid,'The wire has a female push-on connector. It slides onto the flat numbered blade and its spring holds it against the metal.',pin,keepDistanceSurface=True)
        blade=box('Stamped 6.35 mm blade',(0,0,-5.10),(6.35,.8,10.20),tab,steel,.12)
        hole=cyl('1.6 mm detent eye',(0,0,-4.5),.8,2.4,tab,None)
        hole.rotation_euler.x=math.pi/2;cut(blade,hole)
        for side in [-1,1]:
            cutter=box('Lead-in chamfer',(side*3.21,0,.06),(1.55,1.6,1.55),tab,None,0)
            cutter.rotation_euler.y=side*math.pi/4;cut(blade,cutter)
        box('Tab shoulder',(0,0,-9.6),(7.45,1.10,1.05),tab,steel,.17)
        # Short insulating support cheeks around the root of each projecting blade.
        for x in [-1,1]:
            box('Blade seat support',(x*3.62,0,-9.41),(.98,2.20,1.85),tab,dark,.26)
        socket=detail('rg-push-on-'+tid,'A separate crimped female terminal fits over this blade when its core is connected. The metal shoulder remains accessible near the base.',tab,matingBlade=tid)
        # The curled prongs and flat back actually straddle the blade.
        box('Female receptacle back',(0,-.60,-2.0),(6.55,.34,7.0),socket,tin,.13)
        for side in [-1,1]:
            box('Folded receptacle side',(side*3.31,.12,-2.03),(.40,1.72,6.72),socket,tin,.17)
            box('Returned spring lip',(side*2.41,.80,-2.16),(1.85,.31,6.08),socket,tin,.15)
        box('Crimp transition',(0,-.65,2.5),(4.10,.52,2.50),socket,tin,.16)
        barrel=cyl('Folded conductor barrel',(0,0,5.4),1.32,4.5,socket,tin)
        cut(barrel,cyl('Wire passage',(0,0,5.5),.84,5.4,socket,None))
        shroud=cyl('Insulated wire collar',(0,0,7.67),2.18,6.85,socket,boot)
        cut(shroud,cyl('Open wire inlet',(0,0,7.6),1.22,8.65,socket,None))
        for j in range(2):api.torus('Crimp impression rim',convert((0,0,6.0+j*2.2)),2.10/40,.10/40,socket,boot)
    root['preservePlanarLod']=True
    return ['individual-electrical-terminations','rg-rocker','rg-clips','rg-base','rg-moving-contact','terminal-clamp:COM','terminal-clamp:OUT']
