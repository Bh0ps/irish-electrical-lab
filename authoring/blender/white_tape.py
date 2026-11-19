"""One 100 mm cut section of LEDVANCE LS V -500/830/5, at 100 mm per bench unit.

The maker's drawing supplies the envelope, cut spacing and seven LED positions.
The photograph supplies the round-ended copper lands, print, white mask, backing
and chip appearance. Small package and solder dimensions follow the photograph.
"""
import math
import bpy


def build_white_tape(recipe, root, api):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailRevision'] = 3
    root['detailFamily'] = 'lamp'
    frame = api.empty('One cut section', root, (0, .43, 0))
    body = api.semantic('body', frame)
    lamp = api.semantic('emitter', frame)
    ends = api.semantic('terminals', frame)

    def feature(key, parent, purpose):
        return api.empty(key, parent, data={'detailId': key, 'detailPurpose': purpose})

    def mm(p):
        return tuple(v / 100 for v in p)

    def box(name, centre, size, parent, mat, radius=.05):
        return api.box(name, mm(centre), mm(size), parent, mat, radius / 100)

    laminate = api.material('Amber flexible circuit', (.50,.30,.12), 0, .62)
    mask = api.material('Warm white printed mask', (.86,.85,.80), 0, .48)
    foil = api.material('Exposed copper lands', (.76,.40,.16), .70, .28)
    solder = api.material('Tinned solder joint', (.57,.59,.57), .86, .28)
    ink = api.material('Tape polarity marking', (.030,.036,.032), 0, .68)
    ceramic = api.material('White chip package', (.94,.92,.85), 0, .38)
    phosphor = api.material('Warm LED phosphor', (.92,.65,.12), 0, .38)
    resistor = api.material('Thick film resistor', (.051,.055,.051), 0, .44)

    flex = feature('flexible-copper-tracks', body, 'Follow the two supply tracks along the tape. The white coating leaves the copper bare at the cut mark.')
    packages = feature('surface-mount-bodies', body, 'The small white packages hold the LEDs. The dark parts between them are resistors.')
    lenses = feature('smd-led-packages', lamp, 'Each yellow window gives off warm white light when current flows through the strip.')
    box('Backing and flexible base', (0,0,.095), (100,8,.19), flex, laminate)
    box('White insulating mask', (0,0,.225), (100,8,.07), flex, mask)
    for i in range(7):
        x = (i-3) * 100/7
        for sign in (-1,1):
            box('LED solder fillet', (x,sign*1.55,.45), (2.12,.85,.38), packages, solder, .17)
        box('Moulded LED package', (x,0,.85), (2.8,3.48,1.18), packages, ceramic, .19)
        box('Phosphor window', (x,0,1.41), (2.21,2.62,.18), lenses, phosphor, .14)
    for x in (-35.7,21.4):
        box('Resistor body', (x,0,.63), (1.62,3.10,.65), packages, resistor, .12)
        for sign in (-1,1):
            box('Resistor end cap', (x,sign*1.40,.61), (1.66,.46,.66), packages, solder, .12)

    def land(parent, side):
        # The cut divides each oblong in half. Adjoining sections make a full land.
        radius = .84
        edge = side * 1.2
        centre = -side * .45
        curve = [(centre-side*radius*math.cos(a*math.pi/16), radius*math.sin(a*math.pi/16))
                 for a in range(-8,9)]
        outline = [(edge,-radius)] + curve + [(edge,radius)]
        if side > 0:
            outline.reverse()
        vertices = [mm((x,y,z)) for z in (-.09,0) for x,y in outline]
        n = len(outline)
        faces = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
        mesh = bpy.data.meshes.new('Cut copper land')
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        obj = bpy.data.objects.new('Bare copper at cut',mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.data.materials.append(foil)

    for t in recipe['terminals']:
        positive = t['id']=='L'
        x,y,z = t['anchor']
        node = api.empty('port:'+t['id'], ends, (x,y-.43,z), data={
            'terminalId':t['id'], 'fieldMarking':t['label'], 'fieldLegendModelled':True,
            'contactForm':'solder pad', 'entryDirection':t['entryDirection']})
        pad = feature('terminal-clamp:'+t['id'],node,'The probe touches bare copper here. The white coating beside it insulates the track.')
        pad['preservePlanarLod'] = True
        land(pad,-1)
        opposite = api.empty('Continuation land',flex,(-x,y-.43,z))
        land(opposite,1)
        for side in (-1,1):
            api.label('+24V' if positive else '−', mm((side*45.6,1.9 if positive else -1.9,.30)), flex, ink, size=.0125)
    for side in (-1,1):
        for y in (-3.5,0,3.5):
            box('Broken cut line', (side*49.92,y,.29), (.16,.76,.055), flex, ink, .01)
    return ['individual-electrical-terminations','flexible-copper-tracks','surface-mount-bodies','smd-led-packages',
            'terminal-clamp:L','terminal-clamp:N']
