"""VARILIGHT HQ1A. Dimensions use the data sheet; small mouldings follow its rear photo.
Coordinates are millimetres facing the wiring side. The shaft axis is +Z towards
the rear. Both terminals accept either wire on this one-way fitting.
"""
import math
import bpy


def build_rotary_dimmer(recipe, root, api):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailFamily'] = 'switch'
    root['detailRevision'] = 3
    frame = api.empty('Rear elevation of rotary dimmer', root, (0, .46, 0))
    frame.rotation_euler.y = math.pi

    def mm(values):
        return tuple(v / 100 for v in values)

    def box(name, point, size, parent, material, bevel=.4):
        return api.box(name, mm(point), mm(size), parent, material, bevel / 100)

    def rod(name, point, radius, depth, parent, material, count=36):
        return api.cyl(name, mm(point), radius/100, depth/100, parent, material, vertices=count)

    def cut(mesh, tool):
        bpy.context.view_layer.update()
        api.boolean_difference(mesh, tool)

    def detail(parent, key, purpose):
        return api.empty(key, parent, data={'detailId':key, 'detailPurpose':purpose})

    white = api.material('Warm white moulded dimmer plate', (.86, .86, .83), 0, .32)
    black = api.material('Black dimmer enclosure', (.025, .027, .026), 0, .43)
    steel = api.material('Zinc plated screw', (.55, .59, .60), .77, .29)
    alloy = api.material('Satin turned aluminium', (.73, .75, .74), .76, .33)
    edge = api.material('Turned silver bevel', (.73, .75, .74), .86, .22)
    brass = api.material('Brass terminal block', (.51, .32, .095), .77, .33)
    green = api.material('Green rating label', (.024, .22, .052), 0, .49)
    ink = api.material('Pale dimmer marking', (.80, .85, .77), 0, .50)
    cover = api.semantic('cover', frame, data={'restPosition':[0,0,0], 'restRotation':[0,0,0]})
    body = api.semantic('body', frame)
    mounting = api.semantic('mounting', frame)
    knob = api.semantic('actuator', cover)
    ports = api.semantic('terminals', frame)
    case = detail(body, 'dimmer-rear-case', 'The black case contains the dimmer. Both wire openings are at the lower end.')
    tray = detail(cover, 'dimmer-plate', 'Two screws hold this plate to the wall box. The raised edge leaves space behind the face.')
    spindle = detail(knob, 'dimmer-knob', 'Turn this knob to change the light level. On the real fitting it clicks off at the end of its travel.')
    tray['keepDistanceSurface'] = True
    case['keepDistanceSurface'] = True
    turn = api.empty('Turning knob', spindle, data={'animation':'dimmer', 'axis':'z'})
    # A swept perimeter keeps the outer corner radius independent of the
    # narrower radius inside the tray. Z=0 is the face against the wall box.
    rings = [(39.7,3.9,-11),(41.1,4.3,-10.55),(42.0,4.45,-9.38),
             (42.5,4.45,-7.6),(42.5,4.45,-.35),(42.1,4.15,0),
             (40.15,2.75,0),(39.95,2.75,-.5),(39.65,2.7,-7.2),(38.65,2.4,-8.15)]
    points = []
    for half, radius, z in rings:
        for corner,(sx,sy) in enumerate(((1,1),(-1,1),(-1,-1),(1,-1))):
            for step in range(11):
                a = (corner + step/10) * math.pi/2
                points.append(mm((sx*(half-radius)+radius*math.cos(a),
                                  sy*(half-radius)+radius*math.sin(a),z)))
    n=44
    faces=[tuple(reversed(range(n)))]
    for layer in range(len(rings)-1):
        for j in range(n):
            a=layer*n+j
            b=layer*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces.append(tuple(range(len(points)-n,len(points))))
    surface=bpy.data.meshes.new('Moulded plate profile')
    surface.from_pydata(points, [], faces)
    surface.update()
    plate=bpy.data.objects.new('Square face with recessed rear',surface)
    bpy.context.collection.objects.link(plate)
    api.setmesh(plate,tray,white)
    for face in surface.polygons:
        face.use_smooth=0 < face.index < len(faces)-1

    def slotted(name,x,y,z,r,parent,facing=1):
        head=rod(name,(x,y,z),r,1.15,parent,steel)
        tool=box('Slot cutter',(x,y,z+facing*.56),(2.3*r,.68,.76),parent,None,.04)
        tool.rotation_euler.z=math.radians(18 if x<0 else -27)
        cut(head,tool)
        return head

    for side in (-1,1):
        x=side*30.15
        cut(plate,rod('Wall screw passage',(x,0,-5),2.05,17,cover,None))
        boss=box('Paired holes in fixing lug',(side*34.3,0,-4.1),(14,8.8,8.1),mounting,white,1.1)
        cut(boss,rod('Wall screw passage',(x,0,-4),2.1,12,mounting,None))
        cut(boss,rod('Outer mould opening',(side*36.4,0,-3.2),1.10,9,mounting,None))
        slotted('Face fixing screw',x,0,-11.25,3.0,mounting,-1)
        rod('Fixing screw through lug',(x,0,-1.4),1.63,20,mounting,steel)
        for j in range(7):
            api.torus('Fixing screw thread',mm((x,0,2.1+j*.90)),.0165,.0020,mounting,steel)
        for y in (16.3,25.7):
            box('Moulded retaining nib',(side*39,side*y,-3.3),(2.7,2.3,4.1),tray,white,.7)
        rod('Ejector boss',(side*31.5,side*20,-2.2),1.9,6.2,tray,white)

    rod('Spindle collar',(0,0,-12),6.65,2.2,knob,black)
    rod('Aluminium rotary control',(0,0,-20.05),10.6,15.8,turn,alloy,80)
    rod('Rounded face of rotary control',(0,0,-27.94),10.30,1.12,turn,alloy,80)
    api.torus('Knob rim',mm((0,0,-28.0)),.101,.0034,turn,edge)
    housing=box('Insulated dimmer module',(1.6,1.5,4.65),(26.2,50.5,21.7),case,black,.72)
    # The two recesses in the published rear view are separated by an
    # unconnected moulded slot. Only the two outer entries own terminal IDs.
    for x in (-8.2,4.1):
        cut(housing,box('Window for wire',(x,-16.3,13),(5.65,5.7,10),case,None,.35))
        cut(housing,rod('Wire entry through case',(x,-16.3,6.2),1.66,12,case,None))
        opening=rod('Driver access from bottom',(x,-21.8,10.0),1.85,8,case,None)
        opening.rotation_euler.x=math.pi/2
        cut(housing,opening)
    cut(housing,box('Centre moulded pocket',(-2,-17.4,14.4),(5.3,7.6,5),case,None,.30))
    for side in (-1,1):
        box('Catch at case seam',(1.6+side*13.12,-12.5,4.1),(1.2,6.2,2.4),case,black,.28)
    box('Green rating label',(1.6,9.9,15.56),(18.8,32.6,.2),case,green,.074)
    for label,y,size in [('1 WAY',15.8,2.3),('220–250 V AC',11.7,1.78),
                         ('60–400 W',8.05,2.08),('EITHER WIRE',1.3,1.42),
                         ('EITHER SIDE',-.85,1.42)]:
        # Ink is flat. A bevelled, extruded font adds thousands of invisible
        # side faces per line of print, including in the phone download.
        letters=bpy.data.curves.new('Flat rating label', 'FONT')
        letters.body=label
        letters.align_x='CENTER'
        letters.align_y='CENTER'
        letters.size=size/100
        letters.resolution_u=3
        letters.materials.append(ink)
        mark=bpy.data.objects.new('Printed '+label, letters)
        bpy.context.collection.objects.link(mark)
        mark.parent=case
        mark.location=mm((1.6,y,15.73))
        bpy.context.view_layer.objects.active=mark
        mark.select_set(True)
        bpy.ops.object.convert(target='MESH')
        mark.select_set(False)
    for t in recipe['terminals']:
        # Use the router's exact centre, including the left/right reversal
        # when the fitting is viewed from the back.
        ax,ay,az=t['anchor']
        node=api.empty('port:'+t['id'],ports,(-ax,ay-.46,-az),
                       data={'terminalId':t['id'],'fieldLegendModelled':True,
                             'fieldMarking':t['label'],'markingSource':'bench alias',
                             'contactForm':'pressure plate','entryDirection':t['entryDirection']})
        clamp=detail(node,'terminal-clamp:'+t['id'],'The wire sits in the brass hole. A screw reached from the end of the case holds it there.')
        clamp['preservePlanarLod']=True
        insert=box('Recessed square brass entry',(0,0,-3.2),(5.3,5.2,6.4),clamp,brass,.20)
        cut(insert,rod('3.2 mm conductor bore',(0,0,-3.3),1.6,8,clamp,None))
        guide=box('Insulating window surround',(0,0,2.15),(6,6.1,4.4),clamp,black,.25)
        cut(guide,box('Access to brass block',(0,0,2.15),(4.9,4.9,6),clamp,None,.28))
        screw=api.empty('End-access terminal screw',clamp,mm((0,-4.7,-2.2)))
        screw.rotation_euler.x=math.pi/2
        slotted('Terminal screw',0,0,0,1.6,screw)
        rod('Clamp screw stem',(0,0,-1.7),.85,3.3,screw,steel)
    return ['individual-electrical-terminations','dimmer-plate','dimmer-knob','dimmer-rear-case']
