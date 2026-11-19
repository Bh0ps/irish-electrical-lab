"""Original D814 reconstruction. Bench scale is 1 unit to 50 mm.
Friedland's P814 fitting sheet shows the clip-off cover, removable cartridge,
two wall screws and two connections on the reverse. The smaller dimensions
follow the drawing and the front photograph. The sealed contacts stay enclosed.
"""
import math
import bpy


def build_sesame_push(recipe, root, api):
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
        return api.cyl(name,mm(p),r/50,h/50,parent,mat,vertices=segments)

    def cut(mesh,tool):
        bpy.context.view_layer.update()
        api.boolean_difference(mesh,tool)

    def detail(key,parent,text):
        return api.empty(key,parent,data={'detailId':key,'detailPurpose':text})

    white=api.material('White moulded cover',(.85,.86,.84),0,.30)
    carrier=api.material('Moulded switch base',(.69,.70,.65),0,.47)
    black=api.material('Black plunger surround',(.022,.025,.024),0,.38)
    cap=api.material('Ivory push cap',(.84,.83,.76),0,.34)
    brass=api.material('Terminal brass',(.56,.36,.13),.75,.32)
    zinc=api.material('Zinc screw head',(.53,.58,.57),.77,.30)
    shadow=api.material('Dark cartridge moulding',(.085,.090,.082),0,.50)
    body=api.semantic('body',frame)
    cover=api.semantic('cover',frame,data={'restPosition':[0,0,0],'restRotation':[0,0,0]})
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
    cut(back,box('Contact service recess',(0,0,1.25),(12.6,35.1,4.8),base,None,.54))
    # The two holes in the drawing above and below the switch are wall
    # fixings. They do not share an electrical identity with either wire.
    for sign in (-1,1):
        y=sign*21.35
        support=box('Solid fixing boss',(0,sign*19.5,5.4),(16.0,12.1,8.3),base,carrier,.70)
        cut(support,round_part('Clearance for mounting screw',(0,y,5),1.85,14,base,None))
        cut(back,round_part('Matching clearance through base',(0,y,1.3),1.85,6,base,None))
        washer=round_part('Seating for fixing screw',(0,y,9.50),3.05,.55,mount,zinc)
        cut(washer,round_part('Fixing clearance',(0,y,9.50),1.87,1.9,mount,None))
        round_part('Fixing shank',(0,y,5.0),1.54,9.4,mount,zinc)
        fixing=round_part('Face of wall fixing',(0,y,9.98),2.72,.83,mount,zinc)
        cut(fixing,box('Drive slot',(0,y,10.42),(5.50,.66,.83),mount,None,.06))
    # The carrier and sealed switch mechanism are separate from the cover.
    support=box('Contact block',(0,0,6.25),(12.15,34.6,6.10),base,shadow,.52)
    for y in (-12.5,12.5):
        cut(support,box('Rear terminal pad pocket',(0,y,3.10),(6.9,7.6,1.35),base,None,.25))
    barrel=round_part('Central cartridge barrel',(0,0,10.75),8.40,9.15,base,black,64)
    cut(barrel,round_part('Cartridge guide',(0,0,12.65),7.15,9.4,base,None,64))
    bezel=round_part('Dark retaining rim',(0,0,15.35),9.02,2.65,base,black,80)
    cut(bezel,round_part('Plunger clearance',(0,0,15.35),7.15,4.1,base,None,80))
    api.torus('Polished bezel edge',mm((0,0,16.43)),.174,.0055,base,black)
    plunger=api.empty('Spring return plunger',button,data={'animation':'translate','offPosition':[0,0,0],'onPosition':[0,0,-.045]})
    round_part('Guided stem',(0,0,11.8),6.35,9.0,plunger,cap,56)
    round_part('Rounded push face',(0,0,15.9),6.99,4.2,plunger,cap,80)

    for t in recipe['terminals']:
        ax,ay,az=t['anchor']
        node=api.empty('port:'+t['id'],contacts,(ax,ay-.55,az),
                       data={'terminalId':t['id'],'fieldMarking':t['label'],'markingSource':'bench position',
                             'fieldLegendModelled':True,'contactForm':'screw terminal','entryDirection':t['entryDirection']})
        node.rotation_euler.y=math.pi
        clamp=detail('terminal-clamp:'+t['id'],node,'The bell wire sits under this rear screw. Pressing the button joins the two screw terminals.')
        clamp['preservePlanarLod']=True
        # Node is the wire seat at the side of the shank, not the screwdriver slot.
        x=1.75
        pad=box('Stamped contact pad',(x,0,-.66),(6.40,6.85,1.12),clamp,brass,.38)
        cut(pad,round_part('Tapped screw hole',(x,0,-.66),1.08,2.6,clamp,None))
        round_part('Threaded clamp screw',(x,0,-1.05),.98,3.9,clamp,zinc)
        for j in range(4):
            api.torus('Clamp screw thread',mm((x,0,-1.8+j*.52)),.0195,.0028,clamp,zinc)
        head=round_part('Terminal screw head',(x,0,.94),2.44,1.23,clamp,zinc)
        for width,height in ((3.65,.67),(.63,2.58)):
            cut(head,box('Cross recess',(x,0,1.59),(width,height,1.00),clamp,None,.10))
        for edge in (-1,1):
            box('Insulating side rib',(x+edge*3.48,0,-.44),(.64,7.5,1.9),clamp,shadow,.22)
    return ['individual-electrical-terminations','sesame-cover','sesame-base','sesame-plunger']
