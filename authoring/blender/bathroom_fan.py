"""XF100S study model. Millimetres, viewed from the bathroom side.

Manrose's XF100 outline and diagram 1 locate the duct, fixing slots, wire
entry and two-pole block. The impeller pitch and motor interior are illustrative.
"""
import math
import bpy


def build_bathroom_fan(recipe, root, api, distance=False):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailFamily'] = 'fan'
    root['detailRevision'] = 3
    frame = api.empty('Wall mounting plane', root, (0, .88, 0))
    body = api.semantic('body', frame)
    mounting = api.semantic('mounting', frame)
    cover = api.semantic('cover', frame, data={'restPosition': [0, 0, 0], 'restRotation': [0, 0, 0]})
    rotor = api.semantic('rotor', frame)
    terminals = api.semantic('terminals', frame)
    terminals['serviceChamber'] = True
    winding = api.semantic('winding', frame)
    shell = api.material('Ivory ABS fascia', (.87, .88, .87), 0, .32)
    edge = api.material('Inner moulded ABS', (.69, .70, .67), 0, .41)
    vane = api.material('Pale blue grey impeller', (.51, .62, .67), 0, .33)
    steel = api.material('Retaining screw steel', (.51, .53, .51), .84, .26)
    copper = api.material('Motor winding copper', (.49, .185, .062), .76, .37)
    brass = api.material('Terminal insert', (.63, .45, .18), .77, .30)
    black = api.material('Motor lead insulation', (.035, .039, .040), 0, .52)
    chalk = api.material('Terminal block nylon', (.82, .79, .67), 0, .47)

    def mm(values):
        return tuple(v / 100 for v in values)

    def feature(key, parent, purpose):
        return api.empty(key, parent, data={'detailId':key, 'detailPurpose':purpose})

    def box(name, pos, size, parent, mat, radius=.32):
        return api.box(name, mm(pos), mm(size), parent, mat, radius / 100)

    def cyl(name, pos, radius, depth, parent, mat, sides=48):
        return api.cyl(name, mm(pos), radius/100, depth/100, parent, mat, vertices=sides)

    def cut(obj, cutter):
        bpy.context.view_layer.update()
        api.boolean_difference(obj, cutter)

    def mesh(name, vertices, faces, parent, material, smooth=True):
        data = bpy.data.meshes.new(name)
        data.from_pydata([mm(v) for v in vertices], [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        api.setmesh(obj, parent, material)
        for polygon in data.polygons:
            polygon.use_smooth = smooth
        return obj

    def perimeter(angle, radius, corner):
        # Intersect a radial ray with a square whose corners are true arcs.
        if not corner:
            return radius
        x, y = abs(math.cos(angle)), abs(math.sin(angle))
        side = radius / max(x, y)
        h = radius - corner
        if min(x, y)*side <= h:
            return side
        projection = h*(x+y)
        return projection + math.sqrt(max(0, projection**2 - 2*h*h + corner**2))

    def moulding(name, profile, parent, material, segments=96):
        # Re-sample the same curved profile for the phone. Collapsing triangles
        # across the broad white fascia makes a diagonal visible in reflections.
        if distance:
            segments = min(segments, 64 if any(corner for _, _, corner in profile) else 40)
        vertices = []
        for radius, z, corner in profile:
            for i in range(segments):
                angle = i*math.tau/segments
                r = perimeter(angle,radius,corner)
                vertices.append((math.cos(angle)*r,math.sin(angle)*r,z))
        faces = []
        for j in range(len(profile)):
            start = j*segments
            end = ((j+1)%len(profile))*segments
            for i in range(segments):
                k = (i+1)%segments
                faces.append((start+i,start+k,end+k,end+i))
        return mesh(name,vertices,faces,parent,material)

    grille = feature('xf-intake', cover, 'The round grille stays still while the blades turn behind it. The two screw caps lift off to reach the cover screws.')
    grille['keepDistanceSurface'] = True
    moulding('Hollow wraparound front cover', [
        (80.9,2.2,4.1),(81.5,3.0,4.4),(81.4,5.0,4.5),
        (79.7,23,5.3),(79.0,25.4,5.6),(77.3,27.4,5.8),(75,28.1,5.8),
        (53.2,29.9,0),(51.1,29.9,0),(49.7,29.3,0),(48.35,27.4,0),
        (47.0,23.7,0),(46.5,20.2,0),(46.5,18.8,0),(48.1,18.8,0),
        (49.0,23.1,0),(51.6,27.6,0),(75.0,26,5.6),(77.3,24,5.5),
        (79.2,3.0,4.1),(79.1,2.2,4.0)
    ],grille,shell,144)
    moulding('Concentric guard rib',[(37.9,19.6,0),(38.1,28.0,0),(37.7,28.7,0),(36.7,28.7,0),(36.35,28,0),(36.8,19.6,0)],grille,shell)
    moulding('Fixed central grille disc',[(24.2,18,0),(24.1,25,0),(23.6,27.3,0),(22,28.8,0),(20,29.35,0),(2.2,29.7,0),(1.5,29.2,0),(1.45,28,0),(1.45,26.9,0),(20,27,0),(22.6,25.6,0),(22.6,18,0)],grille,shell)
    cyl('Blind mould mark',(0,0,27.2),1.54,1.2,grille,edge)
    for n in range(4):
        a=n*math.pi/2
        spoke=box('Guard spoke',(36*math.cos(a),36*math.sin(a),23.1),(28.4,1.65,9.8),grille,shell,.46)
        spoke.rotation_euler.z=a
    for side in (-1,1):
        cap=api.empty('Cover fixing cap',grille,mm((side*69,0,0)))
        moulding('Lip around screw cap',[(4.9,28.0,0),(4.9,28.85,0),(4.6,29.0,0),(4.45,29,0),(4.45,28,0)],cap,edge,40)
        moulding('Domed blanking cap',[(4.38,28.2,0),(4.38,29,0),(3.9,29.42,0),(3,29.75,0),(1.6,29.94,0),(.10,29.97,0),(.10,28.2,0)],cap,shell,40)
    # The two metal cover screws belong to the fixed part in the open view.
    base = feature('xf-base',mounting,'The four slotted holes hold the extractor to the wall. The cable comes through the base behind the front cover.')
    back = box('Slotted wall mounting plate',(0,0,1.1),(158,158,2.2),base,edge,2)
    cut(back,cyl('Open duct inlet',(0,0,1),46.65,9,base,None,96))
    for x in (-68,68):
        for y in (-68,68):
            cutter=box('Oblong fixing slot',(x,y,1),(17,5.0,9),base,None,2.45)
            cutter.rotation_euler.z=math.copysign(math.pi/4,x*y)
            cut(back,cutter)
    # Entry from the dry side into the wiring corner below the two clamps.
    cut(back,box('Cable inlet',(-59.5,7.0,1),(17,11,8),base,None,2))
    for poly in back.data.polygons:
        poly.use_smooth = False
    base['preservePlanarLod'] = True
    for sign in (-1,1):
        box('Perimeter lip',(sign*77.8,0,4),(2.1,155,6),base,edge,.48)
        box('Perimeter lip',(0,sign*77.8,4),(155,2.1,6),base,edge,.48)
        cyl('Cover fixing pillar',(sign*69,0,11.7),4.3,19,base,edge)
        head=cyl('Captive cover screw',(sign*69,0,21.8),3.25,1.4,base,steel)
        for w,h in ((4.5,.8),(.8,3.6)):
            cut(head,box('Driver recess',(sign*69,0,22.5),(w,h,1.2),base,None,.03))

    spigot = feature('xf-spigot',body,'The outlet is 98 mm across. Air leaves through this opening and passes into the duct through the wall.')
    moulding('Hollow outlet spigot',[(48.6,-45,0),(49,-44.6,0),(49,.4,0),(48.4,4.1,0),(46.7,4.1,0),(46.65,-44.8,0)],spigot,edge)
    for j in range(3):
        a=math.radians(90+j*120)
        arm=box('Motor support arm',(31*math.cos(a),31*math.sin(a),-23),(34,4.3,6.8),spigot,edge,.8)
        arm.rotation_euler.z=a
    cyl('Rear motor housing',(0,0,-23),17,22,spigot,edge)
    cyl('Rear bearing moulding',(0,0,-35),9,4,spigot,edge)
    box('Motor terminal shield',(13,63,9.2),(95,27,13),body,edge,1.5)

    spin=api.empty('Turning impeller',rotor,data={'animation':'rotor','axis':'z','speed':11})
    blades=feature('xf-impeller',spin,'These curved blades move the air. The motor and blade pitch are shown in simplified form. Rotation follows the simulated motor state.')
    cyl('Impeller hub',(0,0,2.1),17.5,17,blades,vane)
    cyl('Impeller nose',(0,0,11.05),15.6,2,blades,vane)
    # A swept, twisted sheet, with thickness and a rounded tip instead of a flat paddle.
    for index in range(5):
        vertices=[]
        rows, cols = 9,11
        for side in (-.55,.55):
            for i in range(rows):
                t=i/(rows-1)
                radius=15.6+30.1*t
                for j in range(cols):
                    s=j/(cols-1)
                    angle=index*math.tau/5+math.radians(12*t*t+(s-.48)*(59-16*t))
                    r=radius-1.1*t**4*abs(2*s-1)**4
                    z=7-7*t+(s-.50)*(11+10*t)+2.3*math.sin(s*math.pi)+side
                    vertices.append((r*math.cos(angle),r*math.sin(angle),z))
        faces=[]
        count=rows*cols
        for j in range(rows-1):
            for k in range(cols-1):
                q=j*cols+k
                poly=(q,q+cols,q+cols+1,q+1)
                faces.append(tuple(reversed(poly)))
                faces.append(tuple(count+p for p in poly))
        border=[*range(cols),*(j*cols+cols-1 for j in range(1,rows)),
                *range(count-2,count-cols-1,-1),*(j*cols for j in range(rows-2,0,-1))]
        for i,q in enumerate(border):
            end=border[(i+1)%len(border)]
            faces.append((q,end,count+end,count+q))
        mesh('Curved impeller blade',vertices,faces,blades,vane)

    cyl('Study motor core',(0,0,-15.5),13.0,11,winding,steel)
    for i in range(7):
        api.torus('Study motor turns',mm((0,0,-19+i*1.15)),.137,.007,winding,copper)

    for terminal in recipe['terminals']:
        x,y,z=terminal['anchor']
        node=api.empty('port:'+terminal['id'],terminals,(x,y-.88,z),data={
            'terminalId':terminal['id'],'fieldMarking':terminal['label'],'fieldLegendModelled':True,
            'contactForm':'pressure plate','entryDirection':terminal['entryDirection']})
        node.rotation_euler.x=math.pi/2
        clamp=feature('terminal-clamp:'+terminal['id'],node,'The supply wire enters below the screw. The motor lead comes out above it.')
        clamp.rotation_euler.x=-math.pi/2
        clamp['preservePlanarLod'] = True
        housing=box('Insulated terminal moulding',(0,4.15,0),(8.8,10.3,9.2),clamp,chalk,1.05)
        bore=cyl('Wire entry',(0,4.1,0),2.48,13,clamp,None)
        bore.rotation_euler.x=math.pi/2
        cut(housing,bore)
        cut(housing,cyl('Screwdriver well',(0,4.55,3.8),2.95,8.1,clamp,None))
        sleeve=box('Brass wire clamp',(0,4.1,-.15),(6.0,8.8,5.8),clamp,brass,.3)
        hole=cyl('Through wire bore',(0,4.1,0),1.82,12,clamp,None)
        hole.rotation_euler.x=math.pi/2
        cut(sleeve,hole)
        screw=cyl('Recessed terminal screw',(0,4.55,2.0),2.30,2,clamp,steel)
        cut(screw,box('Slotted screw head',(0,4.55,3.0),(4.8,.78,1.35),clamp,None,.02))
        # The drilled top and the screwdriver slot are flat faces. Interpolating
        # across their Boolean cuts makes the metal and nylon look dented.
        for part in (housing,sleeve,screw):
            for face in part.data.polygons:
                if max(abs(n) for n in face.normal) > .9999:
                    face.use_smooth = False
        api.label(terminal['label'],mm((0,-5.3,-9.8)),clamp,black,size=.029)
        route=[(0,9,0),(0,17,0),(4,23,-1),(12,28,-2),(26,31,-2)]
        path=bpy.data.curves.new('Factory motor lead',type='CURVE')
        path.dimensions='3D'
        path.resolution_u=6
        path.bevel_depth=.0115
        path.bevel_resolution=2
        spline=path.splines.new('BEZIER')
        spline.bezier_points.add(len(route)-1)
        for point,p in zip(spline.bezier_points,route):
            point.co=mm(p)
            point.handle_left_type=point.handle_right_type='AUTO'
        lead=bpy.data.objects.new('Insulated motor lead',path)
        bpy.context.collection.objects.link(lead)
        lead.parent=clamp
        path.materials.append(black)
        bpy.context.view_layer.objects.active=lead
        lead.select_set(True)
        bpy.ops.object.convert(target='MESH')
        lead.select_set(False)
    return ['individual-electrical-terminations','xf-intake','xf-base','xf-spigot','xf-impeller','terminal-clamp:L','terminal-clamp:N']
