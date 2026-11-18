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
    grey=api.material('Warm grey moulded cassette',(.32,.34,.33),0,.43)
    raised=api.material('Raised moulding legend',(.43,.46,.44),0,.47)
    dark=api.material('Contact recess',(.028,.033,.031),0,.46)
    steel=api.material('Zinc plated steel',(.54,.59,.60),.84,.29)
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
            poly.use_smooth=1<=poly.index<=count*3
        return obj
    tray=faceplate()
    for x in (-pitch/2,pitch/2):
        cut(tray,cyl('Fixing clearance',(x,0,-2),2.15,33,cover,None))
        washer=cyl('Brass fixing bush',(x,0,1.45),2.9,2.1,mount,brass)
        cut(washer,cyl('Tapped fixing bore',(x,0,1.45),1.9,4,mount,None))
        cyl('Recess round face cap',(x,0,-front_depth+.02),3.9,.37,cover,grey)
        cyl('Flush white screw cap',(x,0,-front_depth-.10),3.73,.30,cover,white)
    for side in (-1,1):
        x=side*(width/2-5.4)
        for y in (-25,-18,17,24):
            box('Cross rib stem',(x,y,-1.3),(1.3,4.5,3.1),body,white,.22)
            box('Cross rib arm',(x,y,-1.3),(4.4,1.3,3.1),body,white,.22)
        for y in (-30,29):
            box('Horizontal rear reinforcing web',(side*(width/2-12),y,-1.15),(20,1.65,3.1),body,white,.35)
    feet=(-56,-26,26,56) if socket else (-32,0,32)
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
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);api.setmesh(obj,owner,steel)
        for poly in mesh.polygons: poly.use_smooth=False
        return obj
    strap=detail('linked-earth-strap','This strip joins both earth terminals and the metal fixing bushes.',mount)
    for x in (-pitch/2,pitch/2):
        eye=cyl('Rolled eye of earthing strap',(x,0,.1),4.35,1.05,strap,steel)
        cut(eye,cyl('Fixing eye centre',(x,0,.1),2.55,3,strap,None))
    if socket:
        contact=detail('socket-contact-system','Shutters sit in front of the line and neutral contacts at both outlets.',part('pins'))
        for x in (-37.5,37.5):
            for dx,y,w,h in ((0,7,5.25,8.8),(-11,-15,8.0,4.75),(11,-15,8.0,4.75)):
                cut(tray,box('Pin aperture',(x+dx,y,-4),(w,h,14),cover,None,.4))
                box('Recessed shutter' if dx else 'Earth contact well',(x+dx,y,-front_depth+2.8),(w+.3,h+.3,.8),contact,grey if dx else dark,.3)
                if not dx:
                    for edge in (-1,1):
                        box('Earth spring jaw',(x+edge*1.8,y,-front_depth+2.1),(.65,7,1.15),contact,brass,.15)
            box('Contact spring housing',(x,-16,3.5),(35,20,12),body,grey,1.55)
            for offset in (-13,13):
                box('Folded shutter cassette leg',(x+offset,-21,8.5),(8,13,10),body,grey,.95)
            box('Recessed cassette web',(x,-21,5),(24,2.4,7),body,grey,.35)
            screw('Lower case fixing',(x*.84,-28,6.3),body,2.5)
        for x in (-17.5,17.5):
            box('Separated terminal cassette cheek',(x,9,7.8),(32.7,28,15.1),body,grey,1.5)
        for sign in (-1,1):
            box('Integral cheek under outer terminal',(sign*37.5,10.7,6.7),(11.3,21.5,12.9),body,grey,1)
            ribbon('Bonding lug below outer earth entry',
                   [(sign*39,0,14),(sign*37.5,4.5,17),(sign*37.5,8.8,18.1),
                    (sign*37.5,10,16.8)], [5.8,5.8,5.3,4.4],strap)
        for caption,y in [('50/60 Hz',15.3),('13 A',11.7),('250 V~',8.1)]:
            words(caption,(11.3,y,15.47),body,raised,2.7)
        for y in (2,10,17):
            box('Tie across central moulded slot',(0,y,7),(6,1.8,4),body,grey,.38)
        box('Rear retaining bridge',(0,25,7.7),(49,4.1,4.2),body,grey,1)
        for x in (-22,22): screw('Upper case fixing',(x,25,10),body,2.45)
        ribbon('Formed bonding strip between the fixing eyes',
               [(-60.3,0,.3),(-53,0,.3),(-49,-5,6),(-39,0,14),(-30,-6,16),(30,-6,16),(39,0,14),(49,-5,6),(53,0,.3),(60.3,0,.3)],
               [5,5,5,6,3.4,3.4,6,5,5,5],strap)
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
    box('Upper bank retaining ledge',(0,22 if socket else 19,5),(84 if socket else 41,3,5),body,grey,.6)
    # Each port owns the whole local cage so the learner can pick the screw,
    # moulded legend or lip as well as the actual entry. Wires end at the mouth.
    for term in recipe['terminals']:
        anchor=term['anchor'];tid=term['id'];earth=tid in ('PE','PE2')
        x,y,z=-anchor[0]*100,(anchor[1]-.46)*100,-anchor[2]*100
        node=api.empty('port:'+tid,ports,mm((x,y,z)),data={'terminalId':tid,'contactForm':'pressure plate',
            'fieldMarking':term['label'],'fieldLegendModelled':True,'entryDirection':term['entryDirection']})
        cage=detail('terminal-clamp:'+tid,'The conductor enters from the rear. The screw bears down through the separate tool opening.',node)
        side=not socket and tid in ('PE','PE2','LOUT','NIN')
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
        if not socket and not earth:
            box('Printed terminal colour',(3.7,2.4,.22),(1.35,3.6,.16),cage,blue if tid.startswith('N') else red,.06)
            words('IN' if tid.endswith('IN') else 'LOAD',(-.8,-3.9,.35),cage,raised,1.85)
    return ['individual-electrical-terminations','socket-contact-system','linked-earth-strap']+([] if socket else ['accessory-strain-relief'])
