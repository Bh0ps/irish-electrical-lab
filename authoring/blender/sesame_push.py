"""Original D814 reconstruction. Bench scale is 1 unit to 50 mm.
Friedland's P814 fitting sheet shows the clip-off cover, removable cartridge,
two wall screws and two connections on the reverse. The smaller dimensions
follow the drawing and the front photograph. The sealed contacts stay enclosed.
"""
import math
import bpy
from mathutils import Vector


def build_sesame_push(recipe, root, api, distance=False):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailRevision']=3
    root['detailFamily']='switch'
    frame=api.empty('Sesame elevation', root, (0,.55,0))

    def mm(point):
        return tuple(v/50 for v in point)

    def box(name,p,s,parent,mat,r=.38):
        return api.box(name,mm(p),mm(s),parent,mat,r/50)

    def round_part(name,p,r,h,parent,mat,segments=40):
        return api.cyl(name,mm(p),r/50,h/50,parent,mat,vertices=max(20,segments//2) if distance else segments)

    def cut(mesh,tool):
        bpy.context.view_layer.update()
        api.boolean_difference(mesh,tool)

    def detail(key,parent,text):
        return api.empty(key,parent,data={'detailId':key,'detailPurpose':text})

    def bell_wire(parent,centre_y):
        # Figure 2 shows the bare end hooked around the shank. Meet the
        # existing insulated core end-on, then turn under the screw head.
        cx,cy=1.75,centre_y
        radius=1.44
        a=math.atan2(-cy,-cx)-math.acos(radius/math.hypot(cx,cy))
        end=Vector((cx+radius*math.cos(a),cy+radius*math.sin(a),-1.02))
        tangent=Vector((math.sin(a),-math.cos(a),0))
        start=Vector((0,0,.15))
        p1=start+Vector((0,0,-1.00))
        p2=end-tangent*1.0
        points=[]
        for i in range(13):
            t=i/12
            points.append((1-t)**3*start+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*end)
        for i in range(1,30):
            angle=a-math.radians(222)*i/29
            points.append(Vector((cx+radius*math.cos(angle),cy+radius*math.sin(angle),end.z)))
        curve=bpy.data.curves.new('Formed solid bell wire','CURVE')
        curve.dimensions='3D'
        curve.bevel_depth=.34/50
        curve.bevel_resolution=1 if distance else 3
        curve.use_fill_caps=True
        path=curve.splines.new('POLY')
        path.points.add(len(points)-1)
        for vertex,point in zip(path.points,points):
            vertex.co=(*mm(point),1)
        obj=bpy.data.objects.new('Hook clamped under screw',curve)
        bpy.context.collection.objects.link(obj)
        obj.parent=parent
        curve.materials.append(copper)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')

    def cap_profile(parent):
        # The product photograph shows a flat centre with a soft rolled rim.
        rings=[(6.67,13.8),(6.95,14.10),(7.0,15.9),(6.99,17.11),
               (6.90,17.45),(6.68,17.71),(6.27,17.87),(5.32,17.96),(4.0,18.0)]
        steps=40 if distance else 72
        verts=[mm((r*math.cos(i*math.tau/steps),r*math.sin(i*math.tau/steps),z))
               for r,z in rings for i in range(steps)]
        faces=[tuple(reversed(range(steps)))]
        for k in range(len(rings)-1):
            for i in range(steps):
                j=(i+1)%steps
                faces.append((k*steps+i,k*steps+j,(k+1)*steps+j,(k+1)*steps+i))
        faces.append(tuple(range((len(rings)-1)*steps,len(rings)*steps)))
        mesh=bpy.data.meshes.new('Rolled edge button')
        mesh.from_pydata(verts,[],faces)
        mesh.update()
        obj=bpy.data.objects.new('One-piece ivory cap',mesh)
        bpy.context.collection.objects.link(obj)
        api.setmesh(obj,parent,cap)

    white=api.material('White moulded cover',(.85,.86,.84),0,.30)
    carrier=api.material('Moulded switch base',(.69,.70,.65),0,.47)
    black=api.material('Black plunger surround',(.022,.025,.024),0,.38)
    cap=api.material('Ivory push cap',(.84,.83,.76),0,.34)
    brass=api.material('Terminal brass',(.56,.36,.13),.75,.32)
    copper=api.material('Bare formed bell wire',(.68,.29,.12),.80,.32)
    zinc=api.material('Zinc screw head',(.53,.58,.57),.77,.30)
    shadow=api.material('Dark cartridge moulding',(.085,.090,.082),0,.50)
    body=api.semantic('body',frame)
    cover=api.semantic('cover',frame,data={'restPosition':[0,0,0],'restRotation':[0,0,0],'sesameClipOff':True})
    mount=api.semantic('mounting',frame)
    contacts=api.semantic('terminals',frame)
    moving=api.semantic('actuator',frame)
    base=detail('sesame-base',body,'The narrow carrier holds the round button between the two wall fixing holes.')
    shell=detail('sesame-cover',cover,'The white cover clips over the carrier. Its round opening leaves the button free to move.')
    button=detail('sesame-plunger',moving,'Pressing the cap closes the two contacts. The cap springs out and opens them when you let go.')
    shell['keepDistanceSurface']=True

    # One hollow shell with a rounded face and an open rear. The front opening
    # is cut through to the cavity rather than painted onto the front surface.
    face=box('Clip-on shell',(0,0,8.1),(24,55,15.0),shell,white,.80)
    cut(face,box('Interior clearance',(0,0,5.6),(21.35,52.25,17.0),shell,None,.56))
    cut(face,round_part('Circular bezel clearance',(0,0,14.8),9.14,7,shell,None,72))
    cut(face,box('Release slot at bottom',(0,-27.25,2.0),(4.1,3.0,3.9),shell,None,.22))
    for x in (-1,1):
        box('Inside retaining ledge',(x*10.63,0,2.30),(.88,5.0,.89),shell,white,.23)
        box('Carrier side catch',(x*10.27,0,2.90),(1.10,4.25,1.10),base,carrier,.26)

    back=box('Base perimeter',(0,0,1.35),(22.0,53.8,2.7),base,carrier,.70)
    cut(back,box('Rear terminal bridge clearance',(0,0,1.25),(9.85,37.3,4.8),base,None,.54))
    cut(back,round_part('Round cartridge clearance',(0,0,1.25),8.18,4.8,base,None,72))
    # The two holes in the drawing above and below the switch are wall
    # fixings. They do not share an electrical identity with either wire.
    for sign in (-1,1):
        y=sign*21.35
        support=box('Solid fixing boss',(0,sign*19.5,5.4),(16.0,12.1,8.3),base,carrier,.70)
        cut(support,box('Rear access to switch screw',(0,sign*15.05,2.8),(9.4,7.8,7.2),base,None,.42))
        cut(support,round_part('Clearance for mounting screw',(0,y,5),1.85,14,base,None))
        cut(back,round_part('Matching clearance through base',(0,y,1.3),1.85,6,base,None))
        washer=round_part('Seating for fixing screw',(0,y,9.50),3.05,.55,mount,zinc)
        cut(washer,round_part('Fixing clearance',(0,y,9.50),1.87,1.9,mount,None))
        round_part('Fixing shank',(0,y,5.0),1.54,9.4,mount,zinc)
        fixing=round_part('Face of wall fixing',(0,y,9.98),2.72,.83,mount,zinc)
        for w,h in ((3.70,.68),(.70,3.70)):
            cut(fixing,box('Fixing cross recess',(0,y,10.42),(w,h,.83),mount,None,.08))
    # The carrier and sealed switch mechanism are separate from the cover.
    cartridge=detail('sesame-cartridge',body,'The centre bridge carries the two unmarked wire screws. The round switch mechanism behind it stays enclosed.')
    cartridge['preservePlanarLod']=True
    round_part('Round back of sealed switch',(0,0,5.30),7.78,7.2,cartridge,black,64)
    support=box('Insulated terminal bridge',(0,0,4.55),(8.9,37,6.5),cartridge,shadow,.52)
    for y in (-15.1,15.1):
        cut(support,box('Rear terminal pad pocket',(0,y,1.95),(7.45,7.3,4.6),cartridge,None,.22))
    box('Raised stiffening spine',(0,0,1.93),(6.78,20.4,1.38),cartridge,shadow,.30)
    barrel=round_part('Central cartridge barrel',(0,0,10.75),8.40,9.15,base,black,64)
    cut(barrel,round_part('Cartridge guide',(0,0,12.65),7.15,9.4,base,None,64))
    bezel=round_part('Dark retaining rim',(0,0,15.35),9.02,2.65,base,black,80)
    cut(bezel,round_part('Plunger clearance',(0,0,15.35),7.15,4.1,base,None,80))
    api.torus('Polished bezel edge',mm((0,0,16.43)),.174,.0055,base,black)
    plunger=api.empty('Spring return plunger',button,data={'animation':'translate','offPosition':[0,0,0],'onPosition':[0,0,-.045]})
    round_part('Guided stem',(0,0,11.8),6.35,9.0,plunger,cap,56)
    cap_profile(plunger)

    for t in recipe['terminals']:
        ax,ay,az=t['anchor']
        node=api.empty('port:'+t['id'],contacts,(ax,ay-.55,az),
                       data={'terminalId':t['id'],'fieldMarking':t['label'],'markingSource':'bench position',
                             'fieldLegendModelled':True,'contactForm':'screw terminal','entryDirection':t['entryDirection']})
        node.rotation_euler.y=math.pi
        clamp=detail('terminal-clamp:'+t['id'],node,'The bell wire sits under this rear screw. Pressing the button joins the two screw terminals.')
        clamp['preservePlanarLod']=True
        # The node remains the canonical insulation end. The probe touches
        # the steel shoulder beside the recess, clear of the hooked core.
        x,y=1.75,2.6 if t['id']=='COM' else -2.6
        pad=box('Stamped contact pad',(x,y,-1.92),(6.4,6.85,1.12),clamp,brass,.32)
        cut(pad,round_part('Tapped screw hole',(x,y,-1.92),1.08,2.6,clamp,None))
        round_part('Threaded clamp screw',(x,y,-2.03),.98,3.9,clamp,zinc)
        for j in range(0 if distance else 4):
            api.torus('Clamp screw thread',mm((x,y,-3.2+j*.52)),.0195,.0028,clamp,zinc)
        head=round_part('Terminal screw head',(x,y,-.04),2.28,1.27,clamp,zinc)
        for width,height in ((3.65,.67),(.63,2.58)):
            cut(head,box('Cross recess',(x,y,.61),(width,height,1.00),clamp,None,.10))
        for edge in (-1,1):
            box('Insulating side rib',(x+edge*3.48,y,-1.67),(.64,7.5,1.9),clamp,shadow,.22)
        landed=detail('sesame-insert-'+t['id'],node,'The exposed copper curls under the screw head. The insulation stops beside it.')
        landed['occupiedTerminal']=t['id']
        bell_wire(landed,y)
    # Planar mouldings edged with curved bores need a true flat normal.
    # Blindly collapsing their large faces makes fan-shaped highlights.
    for obj in root.children_recursive:
        if obj.type=='MESH':
            bpy.context.view_layer.objects.active=obj
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            normals=[tuple(c.vector) for c in obj.data.corner_normals]
            for polygon in obj.data.polygons:
                if max(abs(v) for v in polygon.normal)>.99998:
                    for index in polygon.loop_indices:
                        normals[index]=polygon.normal
            obj.data.normals_split_custom_set(normals)
        elif distance and (obj.get('detailId') or obj.get('partId') or obj.get('terminalId')):
            obj['keepDistanceSurface']=True
    return ['individual-electrical-terminations','sesame-cover','sesame-base','sesame-cartridge','sesame-plunger']
