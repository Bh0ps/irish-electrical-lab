"""Original reconstructions from BG's 824 and 851 rear photographs and drawings.

Geometry is laid out in millimetres looking at the wiring side. The published
outer dimensions and fixing pitch are known. Small mouldings follow the photo.
The recipe terminal centres are the same ones used by the wire router.
"""
import math
import bpy
from mathutils import Vector

def build_power_accessory(recipe, root, api):
    root['detailRevision'] = 3
    root['detailFamily'] = 'socket'
    socket = recipe['component']['type'] == 'socket'
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    frame = api.empty('Accessory rear elevation', root, (0,.46,0))
    frame.rotation_euler.y = math.pi
    def mm(p):
        return tuple(v * .01 for v in p)
    def part(key):
        return api.semantic(key, frame)
    def detail(key, purpose, parent):
        return api.empty(key,parent,data={'detailId':key,'detailPurpose':purpose})
    def box(name,p,s,parent,mat,r=.5):
        return api.box(name,mm(p),mm(s),parent,mat,r*.01)
    def cyl(name,p,r,h,parent,mat,n=32):
        return api.cyl(name,mm(p),r*.01,h*.01,parent,mat,vertices=n)
    def cut(target,cutter):
        bpy.context.view_layer.update()
        api.boolean_difference(target,cutter)
    def words(text,p,parent,mat,size,front=False):
        return api.label(text,mm(p),parent,mat,size*.01,rear=front)
    white=api.material('Moulded ivory faceplate',(.83,.84,.82),0,.31)
    grey=api.material('Warm grey moulded cassette',(.44,.445,.43) if socket else (.32,.34,.33),0,.43)
    raised=api.material('Raised moulding legend',(.57,.58,.56) if socket else (.43,.46,.44),0,.47)
    dark=api.material('Contact recess',(.028,.033,.031),0,.46)
    steel=api.material('Zinc plated steel',(.54,.59,.60),.84,.29)
    strap_metal=api.material('Satin zinc earth strap',(.65,.69,.69),.66,.42) if socket else steel
    brass=api.material('Brass lining',(.55,.33,.095),.79,.31)
    red=api.material('Printed line marking',(.40,.065,.047),0,.40)
    blue=api.material('Printed neutral marking',(.045,.24,.49),0,.40)
    body,cover,mount,ports=part('body'),part('cover'),part('mounting'),part('terminals')
    pitch,width,front_depth=(120.6,146.5,7) if socket else (60.3,86,13.5)
    def faceplate():
        # The face slopes gently into the rolled perimeter. These loops also
        # form the inside lip and recessed back without cutting the corners off.
        rings=[(1.6,3.2,-front_depth),(.65,3.7,-front_depth+.55),
               (.12,4,-front_depth+1.75),(0,4,0),(1.7,2.3,0),
               (1.9,2.2,-front_depth+2.6),(2.6,2,-front_depth+2)]
        if socket:
            rings=[(10,3,-7),(5,3.3,-6.91),(2.7,3.6,-6.52),
                   (1.23,3.8,-5.79),(.42,3.96,-4.8),(.10,4,-3.75),
                   (0,4,0),(1.7,2.3,0),(1.9,2.2,-3.75),(3.2,2,-4.5)]
        vertices=[]
        for inset,r,z in rings:
            for corner,(sx,sy) in enumerate(((1,1),(-1,1),(-1,-1),(1,-1))):
                cx=sx*(width/2-inset-r)
                cy=sy*(43-inset-r)
                for step in range(9):
                    angle=math.pi*(corner/2+step/16)
                    vertices.append(mm((cx+r*math.cos(angle),cy+r*math.sin(angle),z)))
        count=36
        faces=[tuple(reversed(range(count)))]
        for ring in range(len(rings)-1):
            for i in range(count):
                a=ring*count+i; b=ring*count+(i+1)%count
                faces.append((a,b,b+count,a+count))
        faces.append(tuple(range(len(vertices)-count,len(vertices))))
        mesh=bpy.data.meshes.new('Accessory shell');mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new('Tapered face and recessed back',mesh)
        bpy.context.collection.objects.link(obj);api.setmesh(obj,cover,white)
        for poly in mesh.polygons:
            poly.use_smooth=1<=poly.index<=count*(6 if socket else 3)
        return obj
    tray=faceplate()
    for x in (-pitch/2,pitch/2):
        cut(tray,cyl('Fixing clearance',(x,0,-2),2.15,33,cover,None))
        washer=cyl('Brass fixing bush',(x,0,1.45),2.9,2.1,mount,brass)
        cut(washer,cyl('Tapped fixing bore',(x,0,1.45),1.9,4,mount,None))
        cyl('Recess round face cap',(x,0,-front_depth+.02),3.9,.37,cover,grey)
        cyl('Flush white screw cap',(x,0,-front_depth-.10),3.73,.30,cover,white)
    if socket:
        for x in (-67,-57.5):
            for y in (9,18):
                box('Cruciform plate rib',(x,y,-1.1),(2.1,6.4,6.2),body,white,.48)
                box('Cruciform plate rib',(x,y,-1.1),(6.2,2.1,6.2),body,white,.48)
        for y in (-23,26.8):
            box('Moulded cross rail',(0,y,-2.35),(142.4,1.7,4.2),body,white,.55)
        for x in (-59,68):
            for y in (-30,-23):
                box('Rounded rail end',(x,y,-.65),(5.0,1.9,6.1),body,white,.72)
    else:
        for side in (-1,1):
            x=side*(width/2-5.4)
            for y in (-25,-18,17,24):
                box('Cross rib stem',(x,y,-1.3),(1.3,4.5,3.1),body,white,.22)
                box('Cross rib arm',(x,y,-1.3),(4.4,1.3,3.1),body,white,.22)
            for y in (-30,29):
                box('Horizontal rear reinforcing web',(side*(width/2-12),y,-1.15),(20,1.65,3.1),body,white,.35)
    # Keep the stiffening ribs between the plug apertures. A rib at x=26
    # crosses one shutter in each outlet and is visible from the front.
    feet=(-59,-17,0,17,59) if socket else (-32,0,32)
    for x in feet:
        box('Plate stiffening rib',(x,0,-front_depth+3.15),(1.8,81,2.8),body,white,.42)
    def screw(name,p,parent,r,style='cross',direction=(0,0,1)):
        pivot=api.empty(name,parent,mm(p))
        pivot.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
        head=cyl('Plated head',(0,0,0),r,1.15,pivot,steel)
        cut(head,box('Driver slot',(0,0,.53),(r*1.62,.65,.82),pivot,None,.06))
        if style=='cross':
            cut(head,box('Transverse driver slot',(0,0,.53),(.65,r*1.62,.82),pivot,None,.06))
        cyl('Screw shank',(0,0,-2.23),r*.50,3.5,pivot,steel)
    def ribbon(name,points,widths,owner):
        if socket:
            # Small bends in stamped sheet catch softer highlights than a
            # single sharp edge at every change of direction.
            rounded=[points[0]];spans=[widths[0]]
            for i in range(1,len(points)-1):
                prev,corner,nxt=(Vector(p) for p in points[i-1:i+2])
                before=min(.27,.95/(corner-prev).length)
                after=min(.27,.95/(nxt-corner).length)
                a=corner.lerp(prev,before);b=corner.lerp(nxt,after)
                wa=widths[i]+before*(widths[i-1]-widths[i])
                wb=widths[i]+after*(widths[i+1]-widths[i])
                for t in (0,.25,.5,.75,1):
                    rounded.append(tuple(a*(1-t)**2+corner*(2*t*(1-t))+b*t*t))
                    spans.append(wa*(1-t)**2+widths[i]*(2*t*(1-t))+wb*t*t)
            points=rounded+[points[-1]];widths=spans+[widths[-1]]
        vertices=[]
        for i,(x,y,z) in enumerate(points):
            a=Vector(points[max(0,i-1)][:2]);b=Vector(points[min(len(points)-1,i+1)][:2])
            d=(b-a).normalized(); half=widths[i]/2
            for zz in (z-.45,z+.45):
                for sign in (-1,1):
                    vertices.append(mm((x-sign*d.y*half,y+sign*d.x*half,zz)))
        faces=[(0,2,3,1)]
        for i in range(0,len(vertices)-4,4):
            for a,b in ((0,1),(1,3),(3,2),(2,0)):
                faces.append((i+a,i+b,i+4+b,i+4+a))
        n=len(vertices);faces.append((n-4,n-3,n-1,n-2))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);api.setmesh(obj,owner,strap_metal)
        for poly in mesh.polygons: poly.use_smooth=False
        return obj
    strap=detail('linked-earth-strap','This strip joins both earth terminals and the metal fixing bushes.',mount)
    for x in (-pitch/2,pitch/2):
        eye=cyl('Rolled eye of earthing strap',(x,0,.1),4.35,1.05,strap,strap_metal)
        cut(eye,cyl('Fixing eye centre',(x,0,.1),2.55,3,strap,None))
    if socket:
        def moulding(name,outline,back,face,parent,radius):
            # Closed extrusion of the traced rear silhouette. Its planar end
            # faces stay flat, including the deep open slot between the banks.
            n=len(outline)
            vertices=[mm((x,y,z)) for z in (back,face) for x,y in outline]
            faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
            for i in range(n):
                j=(i+1)%n
                faces.append((i,j,j+n,i+n))
            mesh=bpy.data.meshes.new(name)
            mesh.from_pydata(vertices,[],faces);mesh.update()
            obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
            api.setmesh(obj,parent,grey)
            bevel=obj.modifiers.new('Mould radius','BEVEL')
            bevel.width=radius*.01;bevel.segments=3
            obj.modifiers.new('Flat moulded faces','WEIGHTED_NORMAL')
            return obj

        cover['keepDistanceSurface']=True
        contact=detail('socket-contact-system','Shutters sit in front of the line and neutral contacts at both outlets.',part('pins'))
        contact['keepDistanceSurface']=True
        shutter=api.material('Ivory shutter slide',(.55,.53,.49),0,.41)
        trigger=api.material('Shutter actuator inside earth guide',(.30,.29,.27),0,.49)
        def aperture(x,y,w,h):
            cut(tray,box('Pin aperture',(x,y,-4),(w+.65,h+.65,14),cover,None,.22))
            # Four moulded lead-in faces run from the plate surface to the
            # parallel guide. Their changing normals catch the light at the lip.
            verts=[]
            for width,height,z in ((w+.65,h+.65,-7),(w-.1,h-.1,-6.18),(w-.1,h-.1,-5.25)):
                for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
                    verts.append(mm((x+sx*width/2,y+sy*height/2,z)))
            faces=[]
            for layer in (0,4):
                for i in range(4):
                    j=(i+1)%4
                    faces.append((layer+j,layer+i,layer+i+4,layer+j+4))
            mesh=bpy.data.meshes.new('Pin entry bevel')
            mesh.from_pydata(verts,[],faces);mesh.update()
            obj=bpy.data.objects.new('Moulded lead-in around pin',mesh);bpy.context.collection.objects.link(obj)
            api.setmesh(obj,cover,white)
            for face in mesh.polygons:face.use_smooth=False
        for x in (-37.5,37.5):
            for dx,y,w,h in ((0,7,5.25,8.8),(-11,-15,8.0,4.75),(11,-15,8.0,4.75)):
                aperture(x+dx,y,w,h)
                if dx:
                    slide=box('Ivory shutter slide',(x+dx,y,-5.15),(w+.65,h+.65,.64),contact,shutter,.19)
                    slide.rotation_euler.x=.13
                else:
                    box('Dark earth pin well',(x,y,-2.5),(w+1,h+1,1),contact,dark,.35)
                    leaf=box('Earth shutter actuator',(x,y-1.52,-4.2),(2.55,5,.47),contact,trigger,.16)
                    leaf.rotation_euler.x=.27
            # The two feet have a narrow exposed web between them. The
            # contact housing is much shallower behind the web.
            box('Lower contact housing',(x,-15.7,-.35),(35,18.7,7.6),body,grey,1.3)
            box('Shutter case neck',(x,-5.6,1.0),(22,12.1,5.6),body,grey,.7)
            for offset in (-11.8,11.8):
                box('Spring housing foot',(x+offset,-18.9,6.0),(10.8,11.0,13.2),body,grey,1.05)
                box('Side latch on spring housing foot',(x+offset+(-5.8 if offset<0 else 5.8),-18.7,3.1),(1.5,6.5,4.7),body,grey,.45)
            box('Web between contact feet',(x,-19.1,6),(16,1.55,8.5),body,grey,.36)
            cyl('Lower case fixing boss',(x,-24.9,1.35),3.55,8.6,body,grey)
            screw('Lower case fixing',(x,-24.9,6.15),body,2.5)
        outline=[(-42.7,7.85),(-42.7,2.0),(-30.1,-6.9),(-26.4,-7.15),
                 (-24.5,-8.2),(24.5,-8.2),(26.4,-7.15),(30.1,-6.9),
                 (42.7,2.0),(42.7,7.85),(21.1,7.85),(21.1,22.2),
                 (2.35,22.2),(2.35,2.1),(-2.35,2.1),(-2.35,22.2),
                 (-21.1,22.2),(-21.1,7.85)]
        cassette=detail('socket-rear-cassette','The central moulding separates the contact banks. A slot between them exposes the cross ties.',body)
        cassette['preservePlanarLod']=True
        moulding('Stepped cassette with open central slot',outline,-.7,16.05,cassette,.7)
        box('Recessed case back',(0,12.7,1.75),(86.6,25.6,5.6),body,grey,1)
        for y in (4.3,12.2,20):
            box('Moulded cross tie in the slot',(0,y,10.8),(6.8,1.25,2.2),body,grey,.28)
        box('Mounting ledge for upper terminal bank',(0,23.55,3.35),(91,5.2,6.6),body,grey,.8)
        box('Case retaining bridge',(0,25,8.6),(47.2,2.65,4.45),body,grey,.72)
        for x in (-20.6,20.6):
            cyl('Upper case fixing boss',(x,25,6.9),3.6,10.2,body,grey)
            screw('Upper case fixing',(x,25,12.35),body,2.6)
        for x in (-9.3,9.3):
            box('Rib below retaining bridge',(x,22.7,9.15),(1.25,5.7,6.3),body,grey,.4)
        # The batch exporter omits fine rear legends in the distance model.
        # The larger L, N and earth symbols stay on both versions.
        rating=api.material('Rear terminal legend · socket moulded rating',(.56,.57,.55),0,.47)
        def rating_line(caption,x,y,size):
            curve=bpy.data.curves.new('Moulded rating','FONT')
            curve.body=caption;curve.size=size*.01;curve.resolution_u=4
            curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.0006
            obj=bpy.data.objects.new('Rating '+caption,curve)
            bpy.context.collection.objects.link(obj);obj.parent=body;obj.location=mm((x,y,16.10))
            curve.materials.append(rating)
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True);bpy.context.view_layer.objects.active=obj
            bpy.ops.object.convert(target='MESH')
        rating_line('BS1363-2',-11.6,15.1,2.65)
        for caption,y in [('50/60 Hz',18.0),('13 A',14.7),('250 V~',11.4)]:
            rating_line(caption,11.5,y,2.75)
        for sign in (-1,1):
            def formed(name,points,widths):
                return ribbon(name,[(sign*x,y,z) for x,y,z in points],widths,strap)
            formed('Pressed strip between fixing eye and cassette',
                   [(60.3,0,.4),(52.5,0,.4),(50.2,.1,1.2),(47.9,-3.1,6.3),
                    (45.4,-4.7,8.3),(37.5,1.9,17.0),(29.0,-5.8,16.85),
                    (26.2,-6.9,16.05)], [4.9,4.9,5.2,5.2,5.25,5.75,2.1,1.55])
            lug=ribbon('Bonding lug below outer earth entry',
                   [(sign*37.5,1.8,16.95),(sign*37.5,4.8,18.6),
                    (sign*37.5,8.55,18.6),(sign*37.5,10.0,17.8),
                    (sign*37.5,10.5,15.2)], [6.6,6.5,6.05,5.5,5.4],strap)
            cut(lug,box('Punched window in bonding lug',(sign*37.5,5.6,18.6),(2.3,1.05,3.5),strap,None,.14))
            box('Contact visible through punched lug',(sign*37.5,5.6,17.9),(2.65,1.4,.5),strap,brass,.12)
        ribbon('Thin visible return below the case',
               [(-26.4,-6.9,16.05),(-24.7,-7.65,16.05),(24.7,-7.65,16.05),
                (26.4,-6.9,16.05)], [1.55,1.45,1.45,1.55],strap)
    else:
        contact=detail('socket-contact-system','The switch operates the line and neutral contacts. The fuse sits in the line path.',part('contacts'))
        box('Stepped rear mechanism',(0,0,2.2),(44,52,8.2),body,grey,2)
        box('Lower fuse chamber',(-1,-11,6.4),(28,18,6.4),body,grey,1)
        for x,y in ((-23,19),(-2,-24)):
            screw('Retaining screw and boss',(x,y,4.5),body,2.2)
        ribbon('Folded earthing bridge',[(-30.15,0,1),(-23,0,1),(-20,-4,9),(19,-4,9),(23,0,1),(30.15,0,1)], [4,4,4.7,5,4,4],strap)
        for sign in (-1,1):
            box('Earth terminal shoulder',(24,sign*7,-.2),(9.6,10.7,5.9),body,grey,.8)
            ribbon('Return to earth terminal',[(25.7,0,1.2),(27,sign*2.5,3.5),(27,sign*5.3,3.5)],[4,4,3.8],strap)
        words('13 A   250 V~',(-1,-13.8,9.72),body,raised,2.8)
        for x in (10.8,-10.8):
            cut(tray,box('Front rocker or fuse recess',(x,0,-6),(14.6,27,21),cover,None,1.5))
            box('Dark insert seam',(x,0,-7),(14.8,27.7,3),contact,dark,1.5)
        rocker=api.semantic('actuator',frame,mm((-10.8,0,-12.6)),{'animation':'rotate','axis':'x','onAngle':-.1,'offAngle':.1})
        box('Rocker paddle',(0,0,0),(13.6,25.3,2.7),rocker,white,1.2)
        fuse=part('fuse')
        box('Fuse carrier',(10.8,0,-12.3),(13.3,25.4,2.7),fuse,white,1.1)
        for i,ch in enumerate('FUSE'):
            words(ch,(10.8,8.1-5.5*i,-13.7),fuse,grey,3.5,True)
        ceramic=cyl('Ceramic cartridge',(10.8,0,-5),2.5,18,fuse,white);ceramic.rotation_euler.x=math.pi/2
        for y in (-9,9):
            cap=cyl('Fuse end cap',(10.8,y,-5),2.6,3.4,fuse,brass);cap.rotation_euler.x=math.pi/2
        grip=detail('accessory-strain-relief','The two screws secure the clamp around the outer sheath of the flex.',mount)
        block=box('Lower flex exit',(16,-32,-.4),(19,19,8.5),grip,white,1.6)
        bore=cyl('Cord passage',(16,-33,1.2),3.3,24,grip,None);bore.rotation_euler.x=math.pi/2;cut(block,bore)
        bridge=box('Two-screw cord grip',(16,-29,4.3),(20.5,5.6,4),grip,grey,1)
        for x in (8.3,23.7):screw('Cord grip screw',(x,-29,6.55),grip,2.1)
    if not socket:
        box('Upper bank retaining ledge',(0,19,5),(41,3,5),body,grey,.6)
    # Each port owns the whole local cage so the learner can pick the screw,
    # moulded legend or lip as well as the actual entry. Wires end at the mouth.
    for term in recipe['terminals']:
        anchor=term['anchor'];tid=term['id'];earth=tid in ('PE','PE2')
        x,y,z=-anchor[0]*100,(anchor[1]-.46)*100,-anchor[2]*100
        node=api.empty('port:'+tid,ports,mm((x,y,z)),data={'terminalId':tid,'contactForm':'pressure plate',
            'fieldMarking':term['label'],'fieldLegendModelled':True,'entryDirection':term['entryDirection']})
        cage=detail('terminal-clamp:'+tid,'The conductor enters from the rear. The screw bears down through the separate tool opening.',node)
        if socket:
            crown=detail('socket-entry:'+tid,'The cable passes through the rounded rear window. The recessed screw is reached from the top.',cage)
            crown['preservePlanarLod']=True
            housing=box('Terminal tower and crown',(0,2.55,-6.2),(10.7,14.8,12.4),crown,grey,.78)
            cut(housing,box('Rounded cable window',(0,-.18,-.6),(7.8,6.8,4.8),cage,None,1.42))
            cut(housing,box('Wire bore into clamp',(0,-.18,-6.9),(6.65,5.65,14.5),cage,None,1.03))
            cut(housing,box('Open screwdriver pocket',(0,8.95,-6.1),(8.25,10.1,10.9),cage,None,.86))
            cross_bore=cyl('Clamp screw passage',(0,3.95,-4.4),2.45,5.4,cage,None)
            cross_bore.rotation_euler.x=math.pi/2
            cut(housing,cross_bore)
            collar=box('Brass terminal inside the cable window',(0,-.18,-6.8),(6.7,5.65,5.3),cage,brass,.4)
            cut(collar,box('Brass tunnel',(0,-.18,-6.8),(5.3,4.05,7.6),cage,None,.68))
            box('Captive clamp tongue',(0,1.2,-6),(5.25,.74,3.8),cage,steel,.21)
            box('Back of terminal pocket',(0,-.16,-10.9),(6.05,4.4,.95),cage,dark,.32)
            screw('Captive terminal screw',(0,7.85,-4.1),cage,2.38,'slot',(0,1,0))
            box('White insert in terminal crown',(0,9.25,-9.45),(7.5,1.42,4.25),cage,white,.46)
            if earth:
                api.torus('Moulded protective earth circle',mm((0,6.4,.09)),.0251,.00145,cage,raised)
                box('Earth marking stem',(0,7.31,.16),(.30,1.7,.25),cage,raised,.075)
                for i,w in enumerate((3.25,2.18,1.05)):
                    box('Earth marking stroke',(0,6.42-i*.62,.16),(w,.29,.25),cage,raised,.075)
            else:
                words(tid,(0,6.3,.13),cage,raised,5.55)
            continue
        side=tid in ('PE','PE2','LOUT','NIN')
        axis=(1,0,0) if tid!='NIN' else (-1,0,0)
        if not side: axis=(0,1,0)
        housing=box('Moulded terminal tower',(0,1.4,-3.8),(9.9,11.8,7.8),cage,grey,1)
        cut(housing,box('Conductor entry bore',(0,0,-3.35),(5.9,4.9,10),cage,None,.60))
        collar=box('Folded brass cage',(0,-.2,-4.2),(5.95,4.87,6.0),cage,brass,.38)
        cut(collar,box('Brass tunnel',(0,0,-4),(4.9,3.9,7.8),cage,None,.32))
        box('Captive pressure tongue',(0,1.12,-4.6),(4.8,.68,4.3),cage,steel,.2)
        at=(axis[0]*5.1,2 if side else 7.3,-3.9)
        entry=cyl('Driver recess',at,2.6,4.5,cage,None)
        entry.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();cut(housing,entry)
        screw('Captive slotted terminal screw',tuple(at[i]-axis[i]*.8 for i in range(3)),cage,2.1,'slot',axis)
        if earth:
            # Three horizontal strokes and an upright, raised in the mould.
            for i,w in enumerate((3.1,2.1,1.1)):
                box('Earth marking',(0,4.7-i*.55,.2),(w,.22,.18),cage,raised,.05)
            box('Earth marking stem',(0,5.45,.2),(.24,1.4,.18),cage,raised,.05)
        else:
            words('N' if tid.startswith('N') else 'L',(0,4.9,.26),cage,raised,3.6)
        if not earth:
            box('Printed terminal colour',(3.7,2.4,.22),(1.35,3.6,.16),cage,blue if tid.startswith('N') else red,.06)
            words('IN' if tid.endswith('IN') else 'LOAD',(-.8,-3.9,.35),cage,raised,1.85)
    return ['individual-electrical-terminations','socket-contact-system','linked-earth-strap']+([] if socket else ['accessory-strain-relief'])
