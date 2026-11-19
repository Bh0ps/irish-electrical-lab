"""Original CROMA 100A study assembly. Coordinates in millimetres, +Z out of wall.
Uses Grothe 43170's dimensional drawing and installation figures 2a/2b, 3a, 5D, 6a.
The diaphragm and circuit board illustrate the sound path inside the closed cassette.
"""
import bpy
import math


def build_croma_chime(recipe, root, api):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailRevision']=3
    root['detailFamily']='alarm'
    body=api.empty('Wall-hung chassis',root,data={'partId':'body'})
    cover=api.empty('Lift-off left-pivoted front',root,(-.755,0,.325),data={'partId':'cover','restPosition':[-.755,0,.325],'restRotation':[0,0,0],'leftHandChimeLid':True})
    terminals=api.empty('K1 five-way connection strip',root,data={'partId':'terminals','serviceChamber':True})
    fixings=api.empty('Wall mounting and housing fixings',root,data={'partId':'mounting'})
    electronics=api.empty('Electronic sound generation',root,data={'partId':'electronics'})
    controls=api.empty('Sound settings behind front panel',root,data={'partId':'actuator','serviceChamber':True})
    refs=[]
    def feature(id,name,group,keep=False):
        refs.append(id)
        return api.empty(id,group,data={'detailId':id,'detailPurpose':name,'keepDistanceSurface':keep})
    def unit(a):return tuple(v*.01 for v in a)
    def box(n,p,s,o,m,b=.5):return api.box(n,unit(p),unit(s),o,m,b*.01)
    def cyl(n,p,r,d,o,m,segs=32):return api.cyl(n,unit(p),r*.01,d*.01,o,m,vertices=segs)
    def cut(mesh,tool):
        bpy.context.view_layer.update()
        api.boolean_difference(mesh,tool)
    def plate(n,xy,zlo,zhi,parent,m,b=.5):
        pts=[(x,y,z) for z in (zlo,zhi) for x,y in xy]
        k=len(xy)
        faces=[tuple(range(k-1,-1,-1)),tuple(range(k,k*2))]+[(i,(i+1)%k,k+(i+1)%k,k+i) for i in range(k)]
        mesh=bpy.data.meshes.new(n);mesh.from_pydata([unit(v) for v in pts],[],faces);mesh.update()
        ob=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(ob);api.setmesh(ob,parent,m)
        if b:
            bevel=ob.modifiers.new('Cast edge','BEVEL');bevel.width=.01*b;bevel.segments=3
            normal=ob.modifiers.new('Moulded faces','WEIGHTED_NORMAL');normal.keep_sharp=True
        return ob
    def label(n,p,o,m,h):
        curve=bpy.data.curves.new('Printed service inscription','FONT');curve.body=n;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=h/100;curve.resolution_u=3
        obj=bpy.data.objects.new('Print '+n,curve);bpy.context.collection.objects.link(obj);obj.parent=o;obj.location=unit(p);curve.materials.append(m)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
    def head(n,p,r,group,mat):
        h=cyl(n,p,r,1.05,group,mat,32)
        for a in [0,math.pi/2]:
            cutter=box('Recess tool',(p[0],p[1],p[2]+.46),(r*1.50,.40,.63),group,None,0)
            cutter.rotation_euler.z=a;cut(h,cutter)
        return h

    pale=api.material('Silver grey case ABS',(.51,.53,.53),0,.38)
    white=api.material('Ivory electronics carrier',(.74,.76,.73),0,.42)
    rail=api.material('Silver satin edge rails',(.51,.54,.55),.45,.31)
    frost=api.material('Frosted acrylic door',(.68,.71,.64),.03,.36,.96)
    edge=api.material('Translucent acrylic polished edges',(.64,.72,.67),.01,.25,.90)
    dark=api.material('Dark grey wire entry moulding',(.062,.071,.066),0,.53)
    black=api.material('Speaker suspension rubber',(.031,.035,.032),0,.57)
    steel=api.material('Plated mounting steel',(.48,.52,.53),.80,.31)
    screws=api.material('K1 clamp screw steel',(.53,.58,.57),.80,.26)
    copper=api.material('Bare bell conductor',(.62,.27,.105),.81,.32)
    brass=api.material('K1 copper alloy cage',(.61,.37,.11),.74,.32)
    green=api.material('Representative glass epoxy board',(.045,.164,.083),.05,.56)
    ink=api.material('K1 marking and settings ink',(.040,.046,.040),0,.55)
    grey=api.material('Smoke grey light windows',(.23,.26,.23),.08,.33)
    # Door seen closed, with 4 mm centre sheet and subtly bowed silver side stiles.
    acrylic=feature('croma-acrylic','The 4 mm frosted acrylic front opens at the left to expose the connections and sound controls.',cover,True)
    box('4 mm acrylic panel',(75.5,95,15.9),(112,189.5,4),acrylic,frost,.8)
    for x in [19.65,131.35]:box('Polished acrylic edge',(x,95,15.95),(.55,187.8,3.7),acrylic,edge,.2)
    for side in [-1,1]:
        # Shape through the centre of the published straight-on and end views.
        inside=75.5+side*57.4;outer=75.5+side*81.5
        profile=[(inside,.15),(outer-side*2.8,.15),(outer-side*1.1,43),(outer,94.5),(outer-side*1.1,147),(outer-side*2.8,189.85),(inside,189.85)]
        if side<0: profile.reverse()
        plate('Bowed silver side trim',profile,11.2,17.85,acrylic,rail,.68)
        box('Shadow line behind front panel',(75.5+side*56.8,95,12.7),(2.0,187,1.2),acrylic,dark,.32)
    # Seated mounting plane. The back is not a solid blocking the cable entry.
    frame=feature('croma-rear-entry','The wires share aperture K1 in the back of the case and turn into the sides of the five terminal clamps.',body,True)
    base=box('Rear wall plate with keyhole and cable entry',(0,95,1.55),(114.5,150,3.1),frame,pale,1.3)
    def opening(part,z,d):
        cut(part,box('K1 aperture',(-4,93.7,z),(16,14,d),frame,None,.6))
    opening(base,1.55,8)
    cut(base,cyl('Hanging keyhole 8 mm',(0,151.3,1.5),4.15,8,frame,None))
    cut(base,box('Hanging keyhole neck',(0,154.5,1.55),(4,5.8,8),frame,None,.3))
    for x in [-30,30]:cut(base,cyl('Lower mounting hole',(x,73,1.55),2.55,8,frame,None))
    for x in [-56.5,56.5]:box('Backplate side wall',(x,95,13.1),(2.5,147.4,23.6),frame,pale,.8)
    for y in [21,169]:box('Backplate end wall',(0,y,13.1),(113,2.6,23.6),frame,pale,.8)
    # Bracket carries front hinge and lock ears clear of conductors.
    for y in [34,151]:
        box('Lift off hinge lug',(-60.0,y,29),(12.5,8,5),fixings,white,.7)
        pivot=cyl('Hinge pin',(-65.3,y,32),1.4,9,fixings,steel);pivot.rotation_euler.x=math.pi/2
    for x in [-30,30]:
        boss=cyl('Lower wall fixing boss',(x,73,8),4.8,10,fixings,white)
        cut(boss,cyl('Fixing bore',(x,73,8),2.5,16,fixings,None))
        head('Wall fixing head',(x,73,13),3.9,fixings,steel)
    # Flat service deck above the battery compartment. Side entries and
    # screw bridges remain unobstructed when the front is swung away.
    deck=box('Service label and wiring deck',(0,121.7,15.15),(111,93.8,3.9),frame,white,1.2)
    opening(deck,15.15,9)
    deck['inspectionHousing']=True
    for x in [-34.7,34.7]:
        casing=box('Raised upper sound chamber cheek',(x,143.2,24.3),(43.5,51.6,10.8),frame,white,1.1)
        casing['inspectionHousing']=True
    # K1 not a covered indentation: no PCB/battery piece crosses the back opening.
    slit=feature('alarm-transducer','A grille passes sound from a loudspeaker. A simplified diaphragm and its driver board are visible in the cutaway.',electronics)
    con=cyl('Representative paper diaphragm',(0,143,19.1),19.5,2.1,slit,black,48)
    cyl('Speaker dust cap',(0,143,21.2),6.3,2,slit,dark)
    api.torus('Speaker rubber surround',unit((0,143,20)),.18,.018,slit,black)
    board=box('Representative electronic tone board',(-19,136,10.8),(66,49,1.35),slit,green,.6)
    for x,y in [(-42,145),(-29,143),(-42,136),(-18,127)]:
        box('Surface mount IC',(x,y,12.0),(6,3.6,1.3),slit,black,.26)
        for n in range(4):
            for t in [-1,1]:box('Gull-wing lead',(x-2.15+n*1.4,y+t*2.1,11.7),(.35,1.35,.32),slit,steel,.05)
    # Integral perforated vertical sound outlet: real continuous holes, built
    # from ring-to-square cells so Economy LOD keeps them without warped caps.
    grille=feature('croma-sound-outlet','The panel behind the hinged door has a narrow perforated loudspeaker grille. The sound comes from the loudspeaker behind it.',body,True)
    vs=[];fs=[]
    for row in range(13):
        for col in range(5):
            cx=(col-2)*4.3;cy=109+row*3.94;hx=2.15;hy=1.97;r=1.43;start=len(vs);n=16
            for z,isouter in [(30,True),(30,False),(28.6,False),(28.6,True)]:
                for k in range(n):
                    a=math.tau*k/n;ex=math.cos(a);ey=math.sin(a)
                    if isouter:
                        side=max(abs(ex),abs(ey))
                        vx=hx*ex/side;vy=hy*ey/side
                    else:vx=r*ex;vy=r*ey
                    vs.append(unit((cx+vx,cy+vy,z)))
            for layer in range(3):
                for k in range(n):
                    p=start+layer*n+k;q=start+layer*n+(k+1)%n
                    # Face the front and the bore consistently for ray/pixel picking.
                    fs.append((p,q,q+n,p+n))
    g=bpy.data.meshes.new('Perforated grille');g.from_pydata(vs,[],fs);g.update();ob=bpy.data.objects.new('65 through holes',g);bpy.context.collection.objects.link(ob);api.setmesh(ob,grille,white)
    for x in [-11.65,11.65]:box('Grille side rim',(x,134,26.9),(1.8,56,6.5),grille,white,.4)
    for y in [106.6,160.6]:box('Grille end rim',(0,y,27.1),(24.8,2.5,5.7),grille,white,.5)
    cloth=box('Acoustic fabric behind perforations',(0,132.65,28.25),(21.5,52.4,.24),grille,black,.07)
    cloth['inspectionHousing']=True
    # Empty four-C holder and service cover retained for transformer use.
    batt=feature('alarm-backup-or-solenoid','The empty battery compartment can accept four C cells when used in battery mode. Diagram D uses transformer power and leaves it empty.',body)
    box('Empty battery holder',(0,48.4,5.2),(109.7,54.7,2.5),batt,pale,.9)
    for i in range(4):
        x=(i-1.5)*26.5
        for end in [-1,1]:
            y=48+end*25
            t=box('Battery contact leaf',(x,y,13),(9,1.1,12),batt,steel,.3)
            if (i%2==0)==(end>0):
                for j in range(4):
                    spring=api.torus('Empty cell spring',unit((x,y-end*(j+1)*.92,13)),(.039-j*.004),.004,batt,steel)
                    spring.rotation_euler.x=math.pi/2
    hatch=box('Separate battery access cover',(0,49.7,30.4),(110.5,56.7,2.9),batt,white,1.2)
    hatch['inspectionHousing']=True
    # Volume dial, indicators and two real setting buttons per manual fig 6a.
    settings=feature('croma-sound-controls','The wheel adjusts loudness on the real chime. The two little setup keys let the installer choose call sounds and settings.',controls)
    wheel=cyl('Volume thumbwheel',(40,116,19.4),7.5,6.5,settings,dark)
    for i in range(18):
        a=math.tau*i/18
        t=box('Wheel grip',(40+7.5*math.cos(a),116+7.5*math.sin(a),19.5),(1,1.4,5.8),settings,grey,.2);t.rotation_euler.z=a
    for x in [36.2,45.4]:
        for y in [101,95.8]:cyl('Indicator lens',(x,y,19.4),1.55,3.4,settings,grey,20)
        cyl('Setting key',(x,89.8,20),2.2,4,settings,dark,24)
    label('VOLUME',(40.5,124.5,17.21),settings,ink,2.1)
    label('T1    T2',(40.5,85,17.21),settings,ink,1.8)
    label('K1',(-3.7,83.8,17.20),frame,ink,2.55)
    label('8–12 V AC/DC',(-35.0,95.5,17.21),frame,ink,2.9)
    for x in [21.0,30.05]:
        box('K1 recessed screw channel guard',(x,98,28.8),(3.3,25.7,3.4),frame,white,.32)
    for y in [85.05,110.95]:
        box('K1 terminal channel lip',(25.5,y,28.8),(12.5,.95,3.4),frame,white,.27)
    # Five independently wired cages under vertically aimed screw heads. The
    # row's keyed copper entries face left towards the cable passage.
    for t in recipe['terminals']:
        id=t['id']; y=t['anchor'][1]*100
        node=api.empty('port:'+id,terminals,t['anchor'],data={'terminalId':id,'fieldMarking':t['label'],'fieldLegendModelled':True,'contactForm':'pressure plate','entryDirection':[-1,0,0]})
        node.rotation_euler.y=-math.pi/2
        insert=api.empty('terminal-clamp:'+id,node,data={'detailId':'terminal-clamp:'+id,'detailPurpose':'A captive front screw bears on one conductor entering the copper alloy cage from the left.','preservePlanarLod':True})
        insert.rotation_euler.y=math.pi/2
        h=box('Individually insulated terminal cell',(4.35,0,.3),(9.9,4.94,11.2),insert,dark,.28)
        bore=box('Side-facing conductor entry',(4,0,0),(14.0,4.05,4.05),insert,None,.25);cut(h,bore)
        cut(h,cyl('Front screw well',(5.0,0,3.4),2.05,10,insert,None,24))
        cage=box('Brass wire clamp',(4.65,0,0),(5.1,3.8,3.8),insert,brass,.2)
        cut(cage,box('Conductor through-hole',(4.65,0,0),(8.5,2.8,2.85),insert,None,.2))
        box('Captive pressure leaf',(4.45,0,1.15),(4.4,2.1,.38),insert,steel,.09)
        wire=api.empty('Landed copper '+id,node,data={'detailId':'croma-insert-'+id,'detailPurpose':'Only the stripped copper tip continues inside the cage when a conductor is connected.','occupiedTerminal':id})
        wire.rotation_euler.y=math.pi/2
        core=cyl('Stripped wire seated under the cage screw',(3.4,0,0),.61,6.8,wire,copper,18)
        core.rotation_euler.y=math.pi/2
        cyl('Clamp screw shank',(5.0,0,4.7),.88,4.7,insert,steel)
        head('K1 captive clamp screw',(5.0,0,7.175),1.74,insert,screws)
        label(t['label'],(15.25,y+2.55,17.22),frame,ink,2.55 if len(t['label'])<4 else 2.1)
    return refs+['individual-electrical-terminations']
