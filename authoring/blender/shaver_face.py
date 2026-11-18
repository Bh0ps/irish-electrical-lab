"""Original lesson model of the MK K701WHI output face.

Envelope, fixing pitch and voltage positions follow MK's catalogue and front
photograph. Exposed secondary tags are a study cutaway of the output carrier.
The isolating winding is a separate electrical component on the workbench.
"""
import bpy
import math


def build_shaver_face(recipe, root, api):
    for child in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(child, do_unlink=True)
    root['detailRevision'] = 3
    root['detailFamily'] = 'socket'
    centre = api.empty('Vertical shaver supply face', root, (0, .76, 0))
    cover = api.semantic('cover', centre)
    body = api.semantic('body', centre)
    hardware = api.semantic('mounting', centre)
    pins = api.semantic('pins', centre)
    ports = api.semantic('terminals', root)
    white = api.material('Pressed ivory thermoset', (.83, .85, .84), 0, .29)
    grey = api.material('Moulded shutter carrier', (.24, .26, .24), 0, .42)
    ink = api.material('Face inscription', (.24, .25, .23), 0, .5)
    dark = api.material('Interlocked pin shutter', (.047, .052, .048), 0, .46)
    brass = api.material('Contact spring alloy', (.53, .33, .12), .78, .32)
    tin = api.material('Tinned joint', (.61, .65, .61), .79, .31)
    steel = api.material('Plated oval head screws', (.57, .60, .58), .89, .24)

    def mm(p):
        return tuple(v / 100 for v in p)

    def block(name, p, s, group, material, radius=.4):
        return api.box(name, mm(p), mm(s), group, material, radius / 100)

    def cyl(name, p, radius, depth, group, material, n=32):
        return api.cyl(name, mm(p), radius/100, depth/100, group, material, vertices=n)

    def detail(key, purpose, parent):
        return api.empty(key, parent, data={'detailId': key, 'detailPurpose': purpose})

    def cut(target, tool):
        bpy.context.view_layer.update()
        api.boolean_difference(target, tool)

    def stroke(a, b, z, width, owner, material):
        x, y = (a[0]+b[0])/2, (a[1]+b[1])/2
        line = block('Printed pictogram stroke', (x,y,z), (math.dist(a,b)+width,width,.12), owner, material, .055)
        line.rotation_euler.z = math.atan2(b[1]-a[1], b[0]-a[0])

    plate = block('Rounded face with two shutter positions', (0,0,3.8), (86,146,7.6), cover, white, 3)
    cavity = block('Recess inside the cover', (0,0,.45), (81.8,141.8,7.2), cover, None, 2)
    cut(plate,cavity)
    shutters = detail('interlocked-shaver-outlets',
        'The two shutter positions admit one shaver plug at a time. The 230 V position uses the winding studied in this circuit.', pins)
    # Each pair accepts vertically spaced round pins. The side slots meet
    # the circles for flat blades, as in the front elevation.
    for side, voltage in ((-1,'115V'),(1,'230V')):
        x = 14.1*side
        for y, wing in ((34.1,-1),(17.5,1)):
            cut(plate,cyl('Round shaver pin bore',(x,y,5),2.9,15,cover,None))
            cut(plate,block('Flat blade extension',(x-side*2.35,y+wing*1.85,5),
                              (5.2,1.9,15),cover,None,.25))
            shutter = block('Shutter slide behind the aperture',(x,y,2.3),(9,8.4,2.6),shutters,dark,.7)
            shutter.rotation_euler.z=side*.035
            for offset in (-1,1):
                spring=block('Bent plug contact jaw',(x+offset*2.55,y,-2.5),(1.1,8,7),shutters,brass,.35)
                spring.rotation_euler.y=offset*.1
        api.label(voltage,mm((x,25.5,7.65)),cover,ink,.043)
    # Two recessed fixings on the centreline, 120.6 mm apart.
    for y in (-60.3,60.3):
        cut(plate,cyl('Fixing bore',(0,y,4),3.55,12,cover,None))
        head=cyl('Slotted fixing screw',(0,y,6.9),3.08,1.35,hardware,steel)
        slot=block('Screwdriver recess',(0,y,7.58),(4.8,.75,1),hardware,None,.12)
        slot.rotation_euler.z=.36
        cut(head,slot)
        api.torus('Fixing seat',mm((0,y,6.25)),.032,.0035,hardware,white)
        cyl('Fixing shaft',(0,y,.2),1.55,12,hardware,steel)
    # Printed line symbols identify the light appliance connection.
    for a,b in [((-3,-28),(3,-28)),((-3,-28),(-3,-33)),((3,-28),(3,-33)),
                ((-3,-33),(-1,-35)),((-1,-35),(1,-35)),((1,-35),(3,-33)),
                ((0,-35),(0,-37)),((0,-37),(2,-38)),((2,-38),(5,-36)),
                ((-7,-44),(6,-44)),((-7,-44),(-7,-42)),((-7,-42),(-2,-42))]:
        stroke(a,b,7.67,.46,cover,ink)
    carrier=detail('insulated-output-carrier',
        'Ribs in the insulating carrier separate the isolated contact strips behind the shaver face.',body)
    block('Contact chamber back',(0,25,-1.8),(51,36,4.5),carrier,grey,2)
    for x in (-25,-4,4,25):
        block('Vertical insulation partition',(x,25,-5.4),(1.65,37,9),carrier,grey,.45)
    for y in (6,44):
        block('Return lip on shutter cassette',(0,y,-4.5),(51,1.5,6.6),carrier,grey,.4)
    for x in (-31,31):
        for y in (-46,49):
            boss=cyl('Backplate locating boss',(x,y,-2.3),3.4,6.9,body,white)
            cut(boss,cyl('Pilot bore',(x,y,-4.6),1.5,7,body,None))
    for term in recipe['terminals']:
        tid = term['id']
        port=api.empty('Secondary contact '+tid,ports,tuple(term['anchor']),data={
            'terminalId':tid,'fieldMarking':term['label'],'fieldLegendModelled':True,
            'entryDirection':term['entryDirection'],'contactForm':'solder pad'})
        port.rotation_euler.y=math.pi
        joint=detail('terminal-clamp:'+tid,
            'The internal tag is an exposed study connection to the isolated winding. It is separate from the external mains connections.',port)
        tag=block('Tinned secondary solder tab',(0,0,-.6),(6.5,9.8,1.45),joint,tin,.65)
        cut(tag,cyl('Lead eyelet',(0,0,-.7),1.5,5,joint,None))
        block('Copper return strap',(0,4.2,-3.75),(5.4,1.2,7.4),joint,brass,.32)
        api.label(term['label'],mm((0,-7.1,-.62)),joint,ink,.025)
    return ['individual-electrical-terminations','interlocked-shaver-outlets','insulated-output-carrier']
