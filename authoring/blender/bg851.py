"""British General 851-01, from the maker's rear photograph and NXSWFCUIL-H.

All dimensions here are millimetres in rear elevation. Fixing pitch and overall
dimensions are published. The small mouldings, captive drawer travel and screw
seats are original study geometry fitted to the photographs, not factory CAD.
"""
import math
import bpy
from mathutils import Vector


def build_851(recipe,frame,body,cover,mount,ports,strap,tray,A):
    api=A.api
    white,grey,raised,steel,brass=A.white,A.grey,A.raised,A.steel,A.brass
    box,cyl,cut,screw=A.box,A.cyl,A.cut,A.screw
    detail=A.detail
    cover['keepDistanceSurface']=True
    body['preservePlanarLod']=True
    strap['preservePlanarLod']=True
    # Taken from the actual red edge on the top of the moving rocker.
    copper=api.material('851 seated wire copper',(.62,.27,.10),.78,.32)
    flag=api.material('851 mechanical rocker stripe',(.25,.028,.034),0,.36)
    shade=api.material('851 recessed apertures',(.21,.213,.207),0,.68)
    lettering=api.material('851 embossed drawer marking',(.63,.64,.62),0,.43)
    plating=api.material('851 earth clamp zinc',(.58,.63,.65),.78,.35)
    fuse_white=api.material('BS1362 ceramic barrel',(.80,.77,.69),0,.54)
    cap_metal=api.material('BS1362 nickel end cap',(.60,.61,.60),.78,.34)
    features=['individual-electrical-terminations','linked-earth-strap']
    def family(key,purpose,owner):
        features.append(key)
        return detail(key,purpose,owner)
    def words(caption,p,owner,mat,size,front=False):
        # The small raised inscriptions need few curve segments, especially
        # on the phone. Keep the terminal names legible on both mesh levels.
        curve=bpy.data.curves.new('Moulded inscription','FONT')
        curve.body=caption;curve.size=size*.01;curve.align_x='CENTER';curve.align_y='CENTER'
        curve.resolution_u=4;curve.extrude=.00058
        obj=bpy.data.objects.new('Relief '+caption,curve);bpy.context.collection.objects.link(obj)
        obj.parent=owner;obj.location=A.mm(p)
        if front:obj.rotation_euler.y=math.pi
        curve.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
        return obj
    def extrusion(name,outline,behind,front,owner,mat,rounding=0.6):
        vertices=[A.mm((x,y,z)) for z in (behind,front) for x,y in outline]
        n=len(outline);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        for i in range(n):
            j=(i+1)%n;faces.append((i,j,j+n,i+n))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);api.setmesh(obj,owner,mat)
        if rounding:
            bevel=obj.modifiers.new('Moulded edge radius','BEVEL');bevel.width=.01*rounding;bevel.segments=3
            obj.modifiers.new('Planar moulded face','WEIGHTED_NORMAL')
        return obj
    def crossbore(name,p,r,length,owner,axis):
        tool=cyl(name,p,r,length,owner,None,36)
        tool.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
        return tool
    def crown(name,w,h,owner,mat):
        # Slightly domed die-moulded paddle; stepped, rounded perimeter loops.
        rings=[(.0,.0,1.75,1.45),(.02,.04,1.78,.13),(.14,.28,1.81,-.58),
               (.38,.62,1.79,-.94),(.77,1.12,1.68,-1.07)]
        points=[];faces=[];sides=32
        for a,b,r,z in rings:
            for corner,(sx,sy) in enumerate([(1,1),(-1,1),(-1,-1),(1,-1)]):
                cx=sx*(w/2-a-r);cy=sy*(h/2-b-r)
                for step in range(8):
                    ang=math.pi*(corner/2+step/14)
                    points.append(A.mm((cx+r*math.cos(ang),cy+r*math.sin(ang),z)))
        faces.append(tuple(range(sides)))
        for row in range(len(rings)-1):
            for i in range(sides):
                j=(i+1)%sides
                faces.append((row*sides+j,row*sides+i,(row+1)*sides+i,(row+1)*sides+j))
        faces.append(tuple(reversed(range(len(points)-sides,len(points)))))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(points,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);api.setmesh(obj,owner,mat)
        for f in mesh.polygons:
            if abs(f.normal.z)>.96:f.use_smooth=False
        return obj

    contact=family('socket-contact-system',
        'The rocker opens the line and neutral together. A fuse in the line supplies the appliance. The two earth entries stay joined.',A.part('contacts'))
    # Rear yoke: broad top, chamfered upper corners, lower neutral extension
    # and a clear recess between the two upper cable-entry banks.
    outline=[(-23,-22),(-22,-26),(-4,-26),(-1,-22),(18,-22),(21,-20),
             (21,15),(20,20),(16,24),(-17,24),(-23,18)]
    extrusion('Keyed grey mechanism back',outline,-5.5,1.10,body,grey,1.2)
    bank=family('851-in-load-markings',
        'The upper row is marked LOAD, IN and LOAD. The incoming neutral is separate at the lower left. Read the letters as well as the colour strips.',body)
    bank['preservePlanarLod']=True
    extrusion('Raised labelled back edge',[(-23,15),(-22,19),(-17,23),(17,23),(20,20),(20,15)],.4,4.45,bank,grey,.58)
    box('Upper centre guard',(-1.0,17.9,5.4),(9.5,7.7,5.6),bank,grey,1.12)
    for x,title in [(-19,'LOAD'),(-9,'IN'),(13,'LOAD')]:
        words(title,(x,20.55,4.52),bank,raised,3.05)
    case=box('Lower raised switch chamber',(-.1,-6.2,4.3),(39.1,24.1,8.65),body,grey,1.82)
    # Leave each cable throat genuinely clear of adjacent raised casing.
    for x in (-19,-9):
        cut(case,box('Space below upper conductor entry',(x,9.2,7),(7.3,9.4,14),body,None,1.12))
    words('50/60Hz',(-11.1,-1.25,8.67),body,raised,2.45)
    rating=detail('851-case-rating','The housing identifies the fitting’s 13 amp, 250 volt AC rating. A cartridge inside the drawer protects the appliance line.',body)
    features.append('851-case-rating')
    rating['preservePlanarLod']=True
    box('Shallow moulding around case rating',(6.7,-13.1,8.67),(21.35,7.1,.37),rating,grey,.5)
    words('BS 1363-4',(6.7,-11.50,8.93),rating,raised,2.38)
    words('13A 250V~',(6.7,-14.45,8.93),rating,raised,2.38)
    bolts=detail('851-case-fixings','These recessed steel screws fasten the grey switch body to its backing. They do not carry the appliance wires.',body)
    for x,y in [(-25,15.6),(-2,-21.0)]:
        cyl('Side mechanism fixing boss',(x,y,-.18),3.7,5.75,body,grey)
        screw('Fixed case screw',(x,y,2.97),bolts,2.28)
    # The real folded earth strip passes in front of the cassette face.
    A.ribbon('Folded bonding strip',[(-30.15,0,.35),(-24.2,0,.35),(-22.4,-.45,1.15),
        (-19.5,-3.0,9.0),(-17.9,-3.75,10.25),(17.8,-3.75,10.25),
        (20.0,-3.4,9.45),(23.2,-.30,1.45),(25.1,0,.36),(30.15,0,.36)],
        [4.25,4.25,4.55,4.68,4.7,4.7,4.64,4.55,4.25,4.25],strap)
    for side in [-1,1]:
        A.ribbon('Return to exposed earth clamp',[(27.0,0,.55),(27.0,side*3.5,2.3),(27.0,side*6.75,3.7)],[4.5,4.45,4.05],strap)
    # Embossed protective earth mark on the strip near its lower clamp.
    for r,(length,dy) in enumerate([(2.5,.15),(1.75,-.30),(1,-.75)]):
        box('Earth symbol on bonding strip',(15,-3.77+dy,10.75),(length,.14,.12),strap,plating,.03)
    box('Earth mark upright',(15,-2.91,10.75),(.16,1.4,.12),strap,plating,.03)

    # The front plate carries a flush captive drawer on its left and an
    # independent tilting rocker on its right (rear elevation X is mirrored).
    for x in [-10.8,10.8]:
        cut(tray,box('Real front operating aperture',(x,0,-10.2),(14.45,27.0,12.8),cover,None,1.95))
        recess=box('Shallow internal bezel',(x,0,-9.25),(15.65,28.3,2.25),contact,shade,1.62)
        cut(recess,box('Open centre of bezel',(x,0,-9),(13.95,26.2,4.0),contact,None,1.65))
    box('Back of the drawer pry notch',(18.3,0,-9.60),(2.60,11.1,2.0),contact,grey,.30)
    # This guard keeps the operating apertures separate from the fixed
    # conductor wells. A notch for the front carrier is not a rear wire bore.
    back_wall=box('Back wall of the drawer channel',(11.1,0,2.9),(16.8,28.4,1.63),body,grey,.64)
    cut(back_wall,box('Clearance for the adjacent L LOAD wire well',(13,13,3.0),(6.2,6.1,4.7),body,None,.53))
    cut(tray,box('Pry slot at left of drawer',(18.35,0,-12),(2.35,10.5,7.5),cover,None,.24))
    rocker=api.semantic('actuator',frame,A.mm((-10.8,0,-13.15)),{
        'animation':'rotate','axis':'x','onAngle':-.20,'offAngle':.20})
    rock=family('851-rocker','The raised red edge indicates the rocker is in its on position. It is a painted strip, so it can show even when the circuit has no power.',rocker)
    rock['keepDistanceSurface']=True
    crown('Rounded double-pole rocker',13.70,25.8,rock,white)
    box('Mechanical red flag on top edge',(0,12.82,.60),(11.30,.13,3.45),rock,flag,.035)
    # The rear of the flag surrounds a moulded paddle wall rather than
    # floating when viewed from above with the handle down.
    box('Moving upper rocker skirt',(0,12.47,1.10),(12.35,.79,3.95),rock,white,.24)
    fuse=api.empty('Captive fuse drawer',frame,A.mm((10.8,0,-13.50)),data={'partId':'fuse','captiveFcuCarrier':True})
    drawer=family('851-fuse-drawer','The recess at the side lets the captive carrier draw out far enough to expose the fuse. The black line around it separates the drawer from the fixed faceplate.',fuse)
    drawer['keepDistanceSurface']=True
    crown('Moulded fuse carrier face',13.70,25.9,drawer,white)
    for i,ch in enumerate('FUSE'):
        words(ch,(0,9.65-6.42*i,-1.16),drawer,lettering,4.90,True)
    # The original drawer is captive. A representative runner and shallow
    # pocket keep the cartridge attached in both inspection positions.
    for side in [-1,1]:
        for y in (-10.65,10.65):
            box('Retained carrier end cheek',(side*5.6,y,8.6),(1.5,3.6,14.1),drawer,white,.50)
        box('Side guide behind cartridge window',(side*5.6,0,14.65),(1.5,22.5,3.20),drawer,white,.45)
    box('Carrier stop',(0,0,17.3),(13.5,19.0,2.65),drawer,white,.66)
    cartridge=family('851-cartridge','The ceramic cartridge sits between two metal end caps. It is in the line to the appliance; both its ends remain inside a closed carrier.',fuse)
    fuse_axis=api.empty('Cartridge axis',cartridge,A.mm((0,0,5.6)))
    fuse_axis.rotation_euler.x=math.pi/2
    cyl('BS1362 ceramic cartridge',(0,0,0),3.06,25.15,fuse_axis,fuse_white,44)
    for sign in [-1,1]:
        cyl('Plated end cap',(0,0,sign*10.74),3.15,3.92,fuse_axis,cap_metal,42)
        api.torus('Crimped cap rim',A.mm((0,0,sign*8.9)),.0305,.0013,fuse_axis,cap_metal)
    stamp=api.empty('Longitudinal cartridge print',cartridge,A.mm((-3.08,0,5.6)))
    stamp.rotation_euler=(0,-math.pi/2,0)
    mark=words('BS1362',(0,0,.03),stamp,shade,1.76)
    mark.rotation_euler.z=math.pi/2

    # Only the inscription of the fitted cartridge is shown by the renderer.
    # The outside housing's maximum rating remains independent of this value.
    for value in (1,2,3,5,7,10,13):
        ink=api.material('Cartridge ink '+str(value),(.25,.032,.025) if value==3
                         else (.21,.104,.053) if value==13 else (.11,.112,.105),0,.51)
        row=detail('851-rating-'+str(value),'The printed ampere value identifies the cartridge fitted in the training circuit.',stamp)
        row['fuseAmps']=value
        mark=words(str(value)+'A',(-1.45,0,.06),row,ink,1.95)
        mark.rotation_euler.z=math.pi/2

    grip=family('accessory-strain-relief','Two screws draw the grip over the outer sheath of the flex. The lower knockout is open in this cable-outlet example.',mount)
    grip['preservePlanarLod']=True
    # Model a prepared bottom knockout and show the channel behind it. The
    # fixed lower edge is opened in the front plate itself, not a dark mark.
    cut(tray,box('Open lower cable knockout',(16,-42.35,-4.65),(8.15,7.95,9.4),cover,None,.80))
    grip_fasteners=detail('851-grip-fixings','These two crosshead screws hold the flex clamp. They bear on the outer sheath, away from the copper cores.',grip)
    for side in [-1,1]:
        box('Open knockout side wall',(16+side*4.45,-36.7,-4.70),(1.50,11.85,8.25),grip,white,.48)
        x=16+side*8.20
        cyl('Cord grip mounting post',(x,-29.15,-4.35),3.05,9.4,grip,white)
        screw('Plated grip fixing',(x,-29.15,3.25),grip_fasteners,2.18)
    bed=box('Rounded cable saddle',(16,-29.15,-5.35),(21.4,7.95,11.2),grip,white,1.72)
    cut(bed,crossbore('Flex channel behind saddle',(16,-29.15,-5),3.49,10.7,grip,(0,1,0)))
    box('Cord clamp bridge',(16,-29.15,1.52),(20.8,5.35,2.85),grip,grey,1.12)
    box('Raised grip bar',(16,-29.15,3.15),(7.70,2.15,1.23),grip,grey,.59)

    for t in recipe['terminals']:
        tid=t['id'];x,y,z=-t['anchor'][0]*100,(t['anchor'][1]-.46)*100,-t['anchor'][2]*100
        node=api.empty('port:'+tid,ports,A.mm((x,y,z)),data={'terminalId':tid,'contactForm':'pressure plate',
            'fieldMarking':t['label'],'fieldLegendModelled':True,'entryDirection':t['entryDirection']})
        cage=detail('terminal-clamp:'+tid,'The cable enters this opening in the back. The separate captive screw presses metal against the conductor.',node)
        earth=tid in ('PE','PE2')
        if earth:
            sign=1 if tid=='PE' else -1
            # Open metal saddle clamped against the yoke. No fictitious
            # coloured plastic earth tower or spare earth bore on the front.
            angle=-sign*math.radians(39)
            housing=api.empty('Angled earthing clamp',cage)
            housing.rotation_euler.z=angle
            shell=box('Folded steel earthing clamp',(0,.1,-2.15),(6.85,7.95,4.45),housing,plating,.73)
            cut(shell,box('Earth cable throat',(0,.05,-2.25),(4.65,5.45,6.60),housing,None,.57))
            box('Pressure tab visible at rear',(0,1.94,-3.20),(4.35,1.12,3.44),housing,steel,.28)
            box('Earth clamp seat',(0,0,-5.4),(5.84,5.55,1.36),housing,brass,.21)
            axis=(.777,sign*.629,0)
            at=(3.60,sign*2.92,-2.85)
        else:
            vertical=tid in ('LIN','NOUT')
            side=-1 if tid=='NIN' else 1
            tower=api.empty('Vertically or laterally accessible clamp',cage)
            if not vertical:tower.rotation_euler.z=-side*math.pi/2
            surf=detail('851-cable-mouth:'+tid,'The rectangular opening in the grey case guides this wire into its recessed brass clamp.',tower)
            surf['preservePlanarLod']=True
            housing=box('Cable and driver housing',(0,1.8,-4.25),(9.92,13.4,8.50),surf,grey,1.30)
            cut(housing,box('Rounded entry lip',(0,0,-1.25),(6.25,5.82,3.55),surf,None,.95))
            cut(housing,box('Conductor passage',(0,0,-5.35),(5.55,5.02,10.8),surf,None,.67))
            cut(housing,box('Separate screwdriver well',(0,7.28,-4.55),(6.69,6.2,7.2),surf,None,1.6))
            lining=box('Recessed brass cage',(0,-.05,-4.95),(5.7,5.25,4.65),cage if vertical else tower,brass,.55)
            cut(lining,box('Through opening in the cage',(0,-.05,-4.95),(4.67,4.13,7.15),cage if vertical else tower,None,.49))
            box('Pressure plate',(0,1.26,-5.15),(4.50,.91,3.86),tower,steel,.18)
            box('Far end of wire throat',(0,0,-7.95),(4.90,4.18,1.1),tower,brass,.27)
            box('Insulating end stop',(0,8.15,-7.35),(7.0,1.29,2.25),tower,white,.45)
            axis=(0,1,0) if vertical else (side,0,0)
            at=(0,6.25,-4.30) if vertical else (side*6.25,0,-4.30)
            col=A.blue if tid.startswith('N') else A.red
            if vertical:
                box('Horizontal terminal identification',(0,3.78,.10),(5.2,1.12,.14),cage,col,.045)
                words('N' if tid=='NOUT' else 'L',(0,5.98,.18),cage,raised,3.30)
            else:
                box('Vertical terminal identification',(side*4.44,0,.10),(1.13,4.9,.14),cage,col,.045)
                words('N' if tid=='NIN' else 'L',(side*7.03,0,.18),cage,raised,3.15)
                if tid=='NIN':words('IN',(4.55,0,.17),cage,raised,2.23)
        driver=api.empty('Screw access '+tid,cage,A.mm(at),data={'detailId':'851-probe:'+tid,
            'detailPurpose':'The probe touches the slotted metal screw head. The wire remains seated in the adjacent cable opening.',
            'probeTerminal':tid})
        screw('Captive terminal screw',(0,0,0),driver,2.20 if earth else 2.27,'slot',axis)
        seat=detail('851-occupied:'+tid,'The stripped end continues inside this conductor opening when the circuit has a wire landed here.',cage)
        seat['occupiedTerminal']=tid;seat['keepDistanceSurface']=True
        cyl('Copper continuation inside the clamp',(0,0,-2.75),.73,5.5,seat,
            copper,24)
    return features
