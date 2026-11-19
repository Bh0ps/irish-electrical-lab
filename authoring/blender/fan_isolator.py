"""Original three-pole rocker and cassette from BG 815 front, rear and side elevations.

86 mm plate, 60.3 mm centres and 22.2 mm total depth from BG's drawing.
Coordinates of minor mouldings are interpreted from the rear product photograph.
"""
import bpy
import math


def build_fan_isolator(recipe, root, api):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailRevision'] = 3
    root['detailFamily'] = 'switch'
    face = api.empty('Front elevation', root, (0,.46,0))
    rear = api.empty('Rear elevation', root, (0,.46,0))
    rear.rotation_euler.y = math.pi
    white=api.material('Ivory thermoset',(.83,.85,.84),0,.29)
    ivory=api.material('Rocker and caps',(.86,.87,.85),0,.28)
    grey=api.material('Grey switch cassette',(.32,.33,.31),0,.42)
    raised=api.material('Raised moulding legends',(.49,.50,.46),0,.47)
    shade=api.material('Contact recess',(.045,.05,.045),0,.45)
    silver=api.material('Captive terminal screws',(.64,.68,.69),.82,.27)
    brass=api.material('Copper alloy jaws',(.58,.34,.10),.78,.31)
    copper=api.material('Moving contact arm',(.58,.24,.085),.78,.31)
    ink=api.material('Printed charcoal legends',(.045,.049,.043),0,.51)

    def mm(p):
        return tuple(n/100 for n in p)

    def box(name, p, size, group, material, radius=.55):
        return api.box(name,mm(p),mm(size),group,material,radius/100)

    def cyl(name, p, r, length, group, material, segments=32):
        return api.cyl(name,mm(p),r/100,length/100,group,material,vertices=segments)

    def cut(mesh, tool):
        bpy.context.view_layer.update()
        api.boolean_difference(mesh,tool)

    def lettering(text,p,group,material,size,raised=False):
        curve=bpy.data.curves.new('Accessory lettering','FONT')
        curve.body=text;curve.align_x='CENTER';curve.align_y='CENTER'
        curve.size=size/100;curve.resolution_u=4;curve.extrude=.00025 if raised else 0
        obj=bpy.data.objects.new('Mark '+text,curve);bpy.context.collection.objects.link(obj)
        obj.parent=group;obj.location=mm(p);curve.materials.append(material)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH');obj.select_set(False)

    def detail(name, text, group):
        return api.empty(name,group,data={'detailId':name,'detailPurpose':text})

    def poly(name,profile,depths,group,material,bevel):
        pts=[mm((x,y,z)) for z in depths for x,y in profile]
        n=len(profile)
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
        faces+=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(pts,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
        api.setmesh(obj,group,material)
        mod=obj.modifiers.new('Moulded edge','BEVEL');mod.width=bevel/100;mod.segments=3
        normal=obj.modifiers.new('Formed faces','WEIGHTED_NORMAL');normal.keep_sharp=True
        return obj

    cover=api.semantic('cover',face)
    body=api.semantic('body',rear)
    mount=api.semantic('mounting',rear)
    contacts=api.semantic('contacts',rear)
    actuator=api.semantic('actuator',face)
    actuator.location.z=.059
    actuator['animation']='rotate';actuator['axis']='x'
    # Off depresses the top edge, on depresses the bottom.
    actuator['onAngle']=.19;actuator['offAngle']=-.19
    # Nested shells give the profiled plate its curved projecting face and
    # leave a hollow skirt inside the recessed plaster-side surface.
    rings=[(0,4,0),(0,4,1.2),(.7,4.1,4.8),(1.7,4.4,6.3),(3.5,4,7),
           (6,3,7.04),(6.2,3,4.85),(2.5,2.2,3.37),(2.3,2,0)]
    coords=[]
    for inset,r,z in rings:
        for corner,(sx,sy) in enumerate(((1,1),(-1,1),(-1,-1),(1,-1))):
            cx,cy=sx*(43-inset-r),sy*(43-inset-r)
            for step in range(9):
                ang=math.pi*(corner/2+step/16)
                coords.append(mm((cx+r*math.cos(ang),cy+r*math.sin(ang),z)))
    n=36
    faces=[tuple(range(5*n,6*n))]
    for ring in range(len(rings)):
        if ring==5:continue
        nxt=(ring+1)%len(rings)
        faces += [(ring*n+i,ring*n+(i+1)%n,nxt*n+(i+1)%n,nxt*n+i) for i in range(n)]
    faces.append(tuple(reversed(range(6*n,7*n))))
    mesh=bpy.data.meshes.new('Profiled switch plate');mesh.from_pydata(coords,[],faces);mesh.update()
    plate=bpy.data.objects.new('Rounded white face and hollow skirt',mesh);bpy.context.collection.objects.link(plate)
    api.setmesh(plate,cover,white)
    for flat in mesh.polygons:flat.use_smooth=0<flat.index<5*n+1
    plate['preservePlanarLod']=True
    cut(plate,box('Rocker aperture',(0,0,5),(46.7,26.3,14),cover,None,1.2))
    box('Wide tilting rocker',(0,0,0),(46.2,25.9,3),actuator,ivory,1.4)
    surround=box('Rear rocker surround',(0,0,-2.8),(50,29,3.8),body,grey,1.6)
    cut(surround,box('Clearance for rocker motion',(0,0,-2),(45.7,25.7,9),body,None,1.3))
    for x,y,text,size in [(-10,18,'OFF',4.45),(11.2,18,'O',4.4),(-10,-19.4,'ON',4.45),(11,-19.4,'I',4.4),(0,-29.8,'FAN ISOLATOR',4.18)]:
        lettering(text,(x,y,7.06),cover,ink,size)
    for x,y,w,h,angle in [(-5.5,-35.3,3.9,.35,0),(-.2,-34.25,7,.35,.34),(2.7,-35.4,.35,2,0),(4.75,-35.4,3.95,.35,0)]:
        stroke=box('Printed open contact',(x,y,7.07),(w,h,.11),cover,ink,.045)
        stroke.rotation_euler.z=angle
    # White reverse lattice, cruciform posts and hollow side fixing bosses.
    lattice=detail('moulded-fixing-grid','The ribs stiffen the plate around the two fixing eyes and keep the switch cassette located in the opening.',mount)
    for x in (-28,-9,9,28):
        box('Vertical reinforcing web',(x,0,-1.2),(1.6,80,4.4),lattice,white,.4)
    for side in (-1,1):
        x=side*30.15
        cut(plate,cyl('Fixing screw opening',(-x,0,4),3,15,cover,None))
        for y in (-6.7,5.9,-27.8):
            box('Stiffening tie',(side*33.7,y,-1.3),(14,1.6,4.5),lattice,white,.4)
        for y in (23,33):
            box('Cross recess stiffener',(side*34,y,-1.4),(7.4,2,4.4),lattice,white,.45)
            box('Cross recess stiffener',(side*34,y,-1.4),(2,7.4,4.4),lattice,white,.45)
        boss=cyl('Mounting sleeve',(x,0,-1.1),4.9,7.2,lattice,white)
        cut(boss,cyl('Screw passage',(x,0,-1),2.25,12,lattice,None))
        cyl('Cap rim',(-x,0,6.98),4.22,.25,cover,grey)
        cyl('Removable screw cover',(-x,0,7.10),4.02,.24,cover,ivory)
    cassette=detail('three-pole-switch-cassette','Three separate contact mechanisms occupy the profiled grey cassette. The shared rocker operates all three.',body)
    # Stepped moulding and screw access scallops follow the back photograph.
    profile=[(-28,-24),(-23,-24),(-20,-19),(-17,-18),(-14,-22),(-4,-20),(1,-19),(8,-21),(13,-21),(15,-15),(18,-14),(22,-19),(28,-18),
             (28,18),(24.5,19),(23,24),(18,26),(13,24),(9,22),(5,22),(0,25),(-4,25),(-5.6,20),(-8.8,18),(-11.8,19),(-13.4,24),(-17.7,25),(-23,22),(-26,18),(-28,16)]
    cassetteBack=poly('Contoured rear cassette',profile,(3.1,12.2),cassette,grey,.59)
    neck=box('Cassette spring clip frame',(0,0,1.5),(54,44,3.5),cassette,grey,1.2)
    for side in (-1,1):
        cut(cassetteBack,cyl('Side crescent fixing relief',(side*30.15,0,7),5.2,21,cassette,None))
        for y in (-14,12):
            box('Retaining clip',(side*28.2,y,4.1),(1.9,3.8,3.1),cassette,grey,.45)
    # Recesses, raised rating legend and index text are moulded into the back.
    for x,y,tilt in [(-10.7,10.1,0),(-3.9,13,.26),(11.2,9.8,0),(-6.1,-11.5,0),(5.4,-12.3,0)]:
        recess=box('Mould core pocket',(x,y,12.15),(3.25,3.35,3.4),cassette,None,.28)
        recess.rotation_euler.z=tilt;cut(cassetteBack,recess)
    lettering('10A  250V~',(7,-2.4,12.23),cassette,raised,2.6,True)
    lettering('50 / 60 Hz',(9,-6.25,12.23),cassette,raised,2.1,True)
    lettering('3 POLE',(-16,-4,12.23),cassette,raised,2.2,True)
    linkage=detail('linked-contact-arms','The insulating link moves the three contact arms together. Each arm keeps its own electrical path.',contacts)
    box('Shared insulating contact link',(0,0,1.4),(43,3,3.7),linkage,ivory,.45)
    for x in (-16,0,16):
        box('Separate copper contact bridge',(x,0,3.4),(4.5,22,1.1),linkage,copper,.35)
        for y in (-10.5,10.5):cyl('Silver contact rivet',(x,y,3.95),1.4,.43,linkage,silver,20)
    ports=api.semantic('terminals',rear)
    for term in recipe['terminals']:
        tid=term['id'];incoming=tid.endswith('IN');side=1 if incoming else -1
        x=-term['anchor'][0]*100; y=(term['anchor'][1]-.46)*100
        twist={'L1IN':-.23,'L2OUT':.27,'NOUT':.28}.get(tid,0)
        # The outer wall itself has a through cut; the conductor reaches a
        # separate clamp tunnel just inside the skin. The clamp screw is
        # accessed through the upper or lower edge, away from the wire entry.
        opening=box('Rear-facing conductor aperture',(x,y,10.5),(4.85,4.3,9),cassette,None,.38)
        opening.rotation_euler.z=twist;cut(cassetteBack,opening)
        node=api.empty('port:'+tid,ports,mm((x,y,12.2)),data={'terminalId':tid,'fieldMarking':term['label'],
                           'fieldLegendModelled':True,'contactForm':'pressure plate','entryDirection':term['entryDirection']})
        clamp=detail('terminal-clamp:'+tid,'The square opening leads to a separate brass pressure terminal. The captive screw is accessed through the side of its moulded pocket.',node)
        cage=api.empty('Angled conductor tunnel',clamp)
        cage.rotation_euler.z=twist
        tube=box('Brass box terminal',(0,0,-3.25),(4.7,4.16,4.8),cage,brass,.33)
        cut(tube,box('Wire bore',(0,0,-3),(3.75,3.26,6),cage,None,.25))
        box('Pressure leaf',(0,-1.38,-3.25),(3.5,.43,3.9),cage,copper,.12)
        lettering(term['label'],(0,side*5.9,.035),clamp,raised,3.2,True)
        # Bore enters from the end of the cassette, aligned with the captive screw.
        outward=side*11.4
        access=cyl('Tool access tunnel',(x,y+outward,7.4),2.45,17,cassette,None)
        access.rotation_euler.x=math.pi/2;cut(cassetteBack,access)
        screw=api.empty('Captive screw axis',clamp,mm((0,side*6.35,-4.8)))
        screw.rotation_euler.x=-side*math.pi/2
        head=cyl('Slotted terminal head',(0,0,0),1.95,1.6,screw,silver)
        cut(head,box('Slotted driver recess',(0,0,.65),(3.5,.60,1.05),screw,None,.085))
        cyl('Captive screw shank',(0,0,-2.85),1.1,4.7,screw,silver,24)
    root['preservePlanarLod']=True
    return ['individual-electrical-terminations','moulded-fixing-grid','three-pole-switch-cassette','linked-contact-arms']
