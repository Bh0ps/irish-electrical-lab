"""Original NBN, CDA and ADA study devices. All dimensions below are mm.

Hager Ireland publishes the outside dimensions and product photography.
Small mouldings follow those photographs; the trip parts are teaching cutaways.
Local Y is up, Z faces the person operating a fitted device.
"""
import math
import bpy

UNIT = .014
LIFT = .52


def build_din_protection(recipe, root, api):
    kind = recipe['component']['type']
    rccb = kind in ('rcd', 'rcd3')
    rcbo = kind == 'rcbo'
    differential = rccb or rcbo
    poles = len(recipe['terminals']) // 2
    width, depth = 17.5 * poles, 68 if rcbo else 70
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj, do_unlink=True)
    root['detailRevision'] = 3
    root['detailFamily'] = 'protection'
    frame = api.empty('Device millimetre datum', root, (0, LIFT, -30*UNIT))

    def mm(p):
        return tuple(x * UNIT for x in p)

    def part(key):
        return api.semantic(key, frame)

    def detail(key, description, owner, **data):
        return api.empty(key, owner, data={'detailId': key, 'detailPurpose': description, **data})

    def box(name, p, s, parent, mat, r=.35):
        return api.box(name, mm(p), mm(s), parent, mat, r*UNIT)

    def cyl(name, p, r, h, parent, mat, axis='z', n=28):
        o = api.cyl(name, mm(p), r*UNIT, h*UNIT, parent, mat, vertices=n)
        if axis == 'y':
            o.rotation_euler.x = math.pi/2
        elif axis == 'x':
            o.rotation_euler.y = math.pi/2
        return o

    def cut(block, cutter):
        bpy.context.view_layer.update()
        api.boolean_difference(block, cutter)

    def words(text, p, owner, material, size):
        # These are printed marks. Flat glyphs keep the small diagrams legible
        # and avoid thousands of bevel faces on letters smaller than a screw.
        curve=bpy.data.curves.new('Printed legend','FONT')
        curve.body=text
        curve.size=size*UNIT
        curve.align_x='CENTER'
        curve.align_y='CENTER'
        curve.resolution_u=5
        obj=bpy.data.objects.new('Print '+text,curve)
        bpy.context.collection.objects.link(obj)
        obj.location=mm(p)
        obj.parent=owner
        curve.materials.append(material)
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        bpy.ops.object.convert(target='MESH')
        obj.select_set(False)
        return obj

    def profile(name, yz, left, right, owner, mat, radius=.35):
        vertices = [mm((x,y,z)) for x in (left,right) for y,z in yz]
        n = len(yz)
        faces = [tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        obj = bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        api.setmesh(obj,owner,mat)
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = False
        bevel=obj.modifiers.new('Mould tool radius','BEVEL')
        bevel.width=radius*UNIT
        bevel.segments=3
        bevel=obj.modifiers.new('Flat side faces','WEIGHTED_NORMAL')
        bevel.keep_sharp=True
        return obj

    ivory = api.material('Light ivory thermoplastic',(.77,.79,.76),0,.38)
    side = api.material('Injection moulded case',(.61,.635,.62),0,.43)
    dark = api.material('Deep recess',(.038,.043,.041),0,.64)
    grey = api.material('Grey switch lever',(.35,.38,.40),0,.34)
    turquoise = api.material('Blue test button',(.035,.25,.48),0,.34)
    accent = api.material('Blue face marking',(.02,.31,.47),0,.48)
    ink = api.material('Printed marking',(.057,.068,.073),0,.46)
    fine_ink = api.material('DIN diagram close-up print',(.067,.073,.070),0,.46)
    raised = api.material('Moulded terminal legend',(.36,.39,.37),0,.46)
    paper = api.material('Circuit label insert',(.82,.86,.82),0,.66)
    window = api.material('Pale blue transparent label flap',(.54,.76,.79),0,.19,.30)
    glass_edge = api.material('Tinted flap edge',(.39,.63,.65),0,.27,.69)
    zinc = api.material('Plated steel',(.46,.51,.53),.84,.31)
    brass = api.material('Current cage',(.54,.34,.11),.77,.31)
    copper = api.material('Copper conductor',(.51,.24,.089),.75,.34)
    body, mounting, ports = part('body'), part('mounting'), part('terminals')
    cover = api.semantic('cover',frame,data={'restPosition':[0,0,0],'fittedDin':True})
    # A real rail passes through the 35 mm re-entrant saddle. There is no
    # piece of rail moulded into the protection device.
    shell = [(0,0),(23,0),(24.1,6.6),(58.9,6.6),(60,0),(83,0),
             (83,18.7),(68.4,18.7),(68.4,44.1),(64.2,47.2),
             (61.8,53.7),(21.2,53.7),(18.8,47.2),(14.6,44.1),
             (14.6,18.7),(0,18.7)]
    for i in range(poles):
        x = (i-(poles-1)/2)*17.5
        pole=profile('Moulded pole shell and rail socket',shell,x-8.73,x+8.73,body,side)
        if abs(x)<(17.5+14.85)/2:
            cut(pole,box('Channel behind the sprung rail clip',(0,12.1,0),
                         (14.85,25.5,7.2),body,None,.38))
        for y in (5,78):
            box('End case locating tongue',(x,y,18.7),(9,4,.9),body,ivory)
    for edge in (-1,1):
        x=edge*(width/2-.04)
        for y,z in ((7,8),(76,8),(23,42),(60,42)):
            cyl('Flush assembly rivet',(x,y,z),1.45,.18,body,zinc,'x',18)
        for y in (8,65):
            box('Mould seam on end wall',(x,y+4,11.5),(.14,12,.54),body,side,.1)
    # The central operating nose fills the 45 mm aperture in the front of
    # the board. The screw rows stay behind that aperture.
    nose = [(19.2,44),(19.2,57.9),(20.3,60.4),(32,60.4),(34,58.8),
            (47,59.2),(48.4,60.5),(62.9,60.5),(63.8,59),(63.8,44)]
    front = profile('Operating bezel',nose,-width/2+.12,width/2-.12,cover,ivory,.55)
    lever_x=-width/2+8.75
    lever_count = poles if kind=='mcb3' else 1
    domestic = kind in ('mcb','rcd')
    for n in range(lever_count):
        x=lever_x+n*17.5
        cut(front,box('Travel opening',(x,41,57),(12.7,16.8,12),cover,None,1.7))
        box('Lever travel well',(x,41,52.7),(12.6,16.6,1.7),cover,dark,1.3)
    label=detail('installation-details','The label flap holds the circuit name. The rating above the handle follows the device settings in this exercise.',cover)
    if domestic:
        # Broad, flat transparent label covers and the recessed flag must
        # retain their normals when a phone uses the Economy mesh.
        label['preservePlanarLod']=True
    box('Printed upper band',(0,61.2,60.52),(width-1.9,1.1,.16),label,accent,.12)
    descriptor='RCBO' if rcbo else 'RCCB' if rccb else 'MCB'
    words(descriptor,(-width/2+5.8,58.5,60.63),label,ink,2.0)
    # Front and side connection diagrams use the same markings as the housed
    # terminals. Leave manufacturer logos and certification marks off the label.
    def pole_diagram(parent, pitch, terminal_height, stroke, print_mat=fine_ink):
        half = terminal_height/2
        def line(x1,y1,x2,y2):
            segment = box('Printed diagram line',((x1+x2)/2,(y1+y2)/2,0),
                          (math.hypot(x2-x1,y2-y1),stroke,.07),parent,print_mat,.025)
            segment.rotation_euler.z=math.atan2(y2-y1,x2-x1)
        for i in range(poles):
            x=(i-(poles-1)/2)*pitch
            line(x,half,x,1.7)
            line(x,-half,x,-1.2)
            line(x,-1.2,x-1.0,1.4)
            cyl('Fixed contact mark',(x,1.7,.01),stroke*1.15,.08,parent,print_mat,n=12)
            upper=next(t for t in recipe['terminals'] if t['entryDirection'][1]>0 and abs(t['anchor'][0]/UNIT-(i-(poles-1)/2)*17.5)<.02)
            lower=next(t for t in recipe['terminals'] if t['entryDirection'][1]<0 and abs(t['anchor'][0]/UNIT-(i-(poles-1)/2)*17.5)<.02)
            for y,terminal in ((half+1.15,upper),(-half-1.15,lower)):
                words(terminal['label'],(x,y,0),parent,print_mat,max(1.2,stroke*7))
        for i in range(1,poles):
            x=(i-(poles-1)/2-.5)*pitch
            line(x-pitch*.27,.2,x+pitch*.18,.2)
    if differential:
        diagram=api.empty('Contact diagram on operating face',label,mm((-width/2+24.6,40.4,59.35)))
        face_print=api.material('DIN front schematic marking',(.062,.069,.065),0,.46) if kind=='rcd' else fine_ink
        pole_diagram(diagram,2.65,5.4,.16,face_print)
    sides=part('body')
    for sign in (-1,1):
        printing=api.empty('Side circuit identification',sides,mm((sign*(width/2-.002),47,20)))
        printing.rotation_euler.y=sign*math.pi/2
        words(descriptor,(0,14,0),printing,fine_ink,3.6)
        pole_diagram(printing,4.2,11,.22)
    rating_w=min(width-2,25 if rcbo else 15.2)
    rating=api.empty('Current exercise rating',label,mm((-width/2+rating_w/2+1.1,54.8,60.52)),data={'ratingPlate':True})
    rating.scale=(rating_w*UNIT/.268, .62,.63)
    # The test button position and label window differ between the RCBO and
    # the RCCBs. A 4-pole RCCB still has just one operating lever.
    w=15.2 if rcbo else width-2.0
    flap_x=-width/2+w/2+1
    box('Circuit designation slip',(flap_x,25.5,60.6),(w-1,9.0,.18),label,paper)
    box('Hinged transparent label cover',(flap_x,25.55,61.4),(w,10.8,1.6),label,window,.62)
    for y in (20.1,31):
        box('Clear rolled cover edge',(flap_x,y,61.4),(w,1.15,1.7),label,glass_edge,.30)
    if differential:
        tx=-width/2+24.9
        ty=21.6 if rcbo else 52.2
        test=part('test')
        box('Separate test button opening',(tx,ty,60.64),(11.3,5.2,.45),test,dark,.6)
        key=box('Blue test pushbutton',(tx,ty,61.25),(10.5,4.55,2.55),test,turquoise,.58)
        if kind=='rcd':
            # The photograph shows a recessed T in the blue plastic.
            # Keep its moulded recess in Economy, where a bevel is subpixel.
            cap=detail('rccb-test-key','The blue T pushbutton trips the powered test loop. It is a separate control from the grey operating handle.',test,preservePlanarLod=True)
            key.parent=cap
            shade=api.material('Blue test-key recess',(.026,.090,.14),0,.56)
            for y,sx,sy in ((ty+.99,2.85,.56),(ty-.24,.56,2.06)):
                cut(key,box('T deboss',(tx,y,62.50),(sx,sy,.73),cap,None,.06))
                box('Bottom of recessed test mark',(tx,y,62.18),(sx-.06,sy-.04,.035),cap,shade,.014)
        else:
            words('T',(tx,ty,62.57),test,ivory,2.8)
        if rccb:
            words('TEST',(tx,56.8,60.62),label,ink,1.6)
        # Indicator follows the actual solver switch/trip state at runtime.
        fx,fy=(tx,30.8) if rcbo else (lever_x,50.4)
        box('Indicator bezel',(fx,fy,60.65),(10.5,2.6,.46),label,side,.48)
        flag=detail('contact-indicator','The small window shows the position of the main contacts. The test button can open them while the supply is on.',part('contacts'),contactFlag=True)
        if kind=='rcd':
            flag['keepDistanceSurface']=True
        box('Contact state flag',(fx,fy,60.94),(9.15,1.6,.23),flag,api.material('Mechanical contact flag',(.55,.079,.043),0,.55),.25)
        if kind=='rcd':
            # The lower right optical flag is independent of the upper left
            # contact flag. Only a differential trip exposes its yellow face.
            trip_x,trip_y=7.5,33.5
            bezel=box('Trip window rim',(trip_x,trip_y,60.40),(11.35,3.32,1.05),label,ivory,.56)
            cut(bezel,box('Recessed trip window',(trip_x,trip_y,60.40),(10.15,2.12,2.40),label,None,.43))
            trip=detail('residual-trip-window','The lower window turns yellow when the residual trip releases the latch. It stays grey when someone switches the lever off by hand.',part('contacts'),residualTripFlag=True,keepDistanceSurface=True)
            box('Mechanical trip shutter',(trip_x,trip_y,60.41),(10.1,2.07,.32),trip,api.material('Mechanical residual trip shutter',(.085,.089,.090),0,.52),.35)
    for n in range(lever_count):
        x=lever_x+n*17.5
        # Physically offset the pad from the axle. Up/down moves the entire
        # operating lever between the two ends of its travel slot.
        if n==0:
            actuator=api.semantic('actuator',frame,mm((0,41.1,56.3)),{'animation':'rotate','axis':'x','onAngle':-.52,'offAngle':.56})
            actuator.rotation_euler.x=-.52
        if domestic:
            paddle=detail('din-paddle','The moving drum reveals I below the raised handle or O above the lowered handle. This is a mechanical contact position, not a voltage reading.',actuator,preservePlanarLod=True)
            drum_radius=8.1
            drum_colour=api.material('MCB drum graphite',(.17,.19,.19),0,.44) if kind=='mcb' else grey
            drum=cyl('Operating drum',(x,0,0),drum_radius,10.7,paddle,drum_colour,'x',72)
            if kind=='mcb':
                # Across the narrow pole the broad forward grip sits on two
                # pierced cheeks. Leave a true transverse hole, including at LOD.
                wing=[(-3.4,4.6),(-4.3,9.6),(-4.0,11.7),(-2.8,13.4),(2.9,13.4),(3.7,12.35),(3.5,9.5),(2.15,6.55)]
                for direction in (-1,1):
                    cheek_x=x+direction*5.8
                    cheek=profile('Pierced paddle cheek',wing,cheek_x-1.77,cheek_x+1.77,paddle,grey,.42)
                    cut(cheek,cyl('Open accessory eye',(cheek_x,-.25,9.9),1.45,5.2,paddle,None,'x',32))
                profile('Wide moulded operating lip',[(-3.75,11.65),(-3.23,13.02),(-2.60,13.6),(2.95,13.6),(3.85,12.6),(3.60,10.7),(2.10,10.35)],x-7.66,x+7.66,paddle,grey,.42)
            else:
                grip=profile('Tapered RCCB lever',[(-3.5,4.8),(-3.52,10.8),(-2.5,13.5),(2.9,13.5),(3.65,12.25),(2.30,5.85)],x-5.75,x+5.75,paddle,grey,.52)
                cut(grip,cyl('Locking pin passage',(x,-.15,9.6),1.18,14,paddle,None,'x',32))
                notch=.63
                slot=box('Slot beside the operating neck',(x,drum_radius*math.sin(notch),drum_radius*math.cos(notch)),(4.4,1.15,2.0),paddle,None,.15)
                slot.rotation_euler.x=-notch
                cut(drum,slot)
            # Markings conform to the moving drum. In the opposite position
            # the corresponding mark rolls under the edge of the fixed fascia.
            def mark(name, points, faces, material, offset=.05):
                radius=drum_radius+offset
                verts=[mm((x+dx,radius*math.sin(a),radius*math.cos(a))) for dx,a in points]
                mesh=bpy.data.meshes.new(name)
                mesh.from_pydata(verts,[],faces)
                mesh.update()
                obj=bpy.data.objects.new(name,mesh)
                bpy.context.collection.objects.link(obj)
                return api.setmesh(obj,paddle,material)

            def sector(name,half_width,low,high,mat,offset):
                steps=12
                pts=[(dx,low+(high-low)*i/steps) for i in range(steps+1) for dx in (-half_width,half_width)]
                quads=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)]
                mark(name,pts,quads,mat,offset)
            closed_ink=api.material('Raised I marking',(.89,.90,.87) if kind=='mcb' else (.055,.065,.061),0,.52)
            open_ink=api.material('Lowered O marking',(.88,.89,.85) if kind=='mcb' else (.055,.065,.061),0,.52)
            if kind=='mcb':
                sector('Green open position sector',4.6,.96,1.69,api.material('Green OFF sector',(.035,.16,.093),0,.52),.042)
            sector('I on moving drum',.58,-1.56,-1.01,closed_ink,.084)
            samples=40
            pts=[]
            for i in range(samples):
                a=2*math.pi*i/samples
                pts.extend([(math.cos(a)*w,1.30+math.sin(a)*h/drum_radius) for w,h in ((2.04,2.35),(1.22,1.51))])
            mark('O on moving drum',pts,[(2*i+1,2*i,2*((i+1)%samples),2*((i+1)%samples)+1) for i in range(samples)],open_ink,.085)
            continue
        cyl('Pivot barrel',(x,0,0),5,11.2,actuator,grey,'x')
        profile('Curved handle arm',[(-3.4,1.5),(-3.6,10.1),(-2.3,12),(2.9,12),(3.4,10.7),(2.25,1.5)],x-3.85,x+3.85,actuator,grey,.65)
        grip_margin=1.5 if lever_count==3 else 2.0
        box('Operating grip',(x,0,depth-57.9),(17.5-grip_margin,5.5,3.0),actuator,grey,1.05)
        if n==0:
            words('I',(x,4.9,4.3),actuator,ink,2.4)
            words('O',(x,-4.6,4.2),actuator,ink,2.5)
    if lever_count==3:
        box('Three-pole handle link',(0,.25,depth-57.7),(width-3.0,3.5,2.7),actuator,grey,.56)
    for term in recipe['terminals']:
        upper=term['entryDirection'][1]>0
        sign=-1 if upper else 1
        x=term['anchor'][0]/UNIT
        port=api.empty('port:'+term['id'],ports,mm((x,83 if upper else 0,26)),data={
            'terminalId':term['id'],'fieldMarking':term['label'],'fieldLegendModelled':True,
            'contactForm':'pressure plate','entryDirection':term['entryDirection']})
        port.rotation_euler.x=(-1 if upper else 1)*math.pi/2
        clamp=detail('terminal-clamp:'+term['id'],'The wire enters at the end of the case. A screwdriver reaches the clamp screw through the round hole on the front.',port)
        local=api.empty('Installer access chamber',clamp)
        local.rotation_euler.x=-port.rotation_euler.x
        tower=box('Finger-safe terminal shroud',(0,sign*7.5,5.4),(17.12,15,24.8),local,ivory,.6)
        cut(tower,box('Open conductor tunnel',(0,sign*5.8,0),(8.2,13.8,7.6),local,None,.74))
        cut(tower,cyl('Recessed screwdriver access',(0,sign*7.7,12.5),3.9,15.8,local,None))
        cage=box('Folded terminal cage',(0,sign*6.6,0),(8.25,8.0,7.4),local,brass,.38)
        cut(cage,box('Wire space inside cage',(0,sign*6.6,0),(6.7,10.1,5.7),local,None,.42))
        box('Captive pressure tongue',(0,sign*6.8,2.45),(6.1,5.7,.76),local,zinc,.21)
        cyl('Screw shank',(0,sign*7.7,5.6),1.45,5.4,local,zinc)
        head=cyl('Captive combination head',(0,sign*7.7,9.1),3.05,1.9,local,zinc)
        for dims in ((5.25,.72,1.15),(.86,3.1,1.15)):
            cut(head,box('Driver recess',(0,sign*7.7,9.91),dims,local,None,.09))
        words(term['label'],(-6.0,sign*3.6,17.83),local,raised,2.85)
    latch=detail('din-latch','Hook the upper lip over the rail. The sprung lower clip holds the case against the rail until it is pulled down.',mounting)
    profile('Upper fixed rail hook',[(57.8,1.8),(59.6,.4),(61.9,.4),(61.9,6.5),(58.5,6.5)],-width/2+.8,width/2-.8,latch,side,.27)
    box('Lower sliding rail latch',(0,15.3,1.8),(12.2,18.7,2.25),latch,grey,.55)
    profile('Sprung lower flange catch',[(21.8,1.3),(25.1,1.3),(25.2,4.5),
            (23.1,6.2),(21.8,5.8)],-6.1,6.1,latch,grey,.29)
    for x in (-6.7,6.7):
        box('Clip retaining guide',(x,12.9,1.35),(1.35,15.3,2.65),body,side,.34)
    clip=box('Screwdriver release tab',(0,3.9,1.2),(13.8,7.2,2.0),latch,grey,.56)
    cut(clip,box('Slot in release tab',(0,3.9,1.2),(7.9,2.65,3.8),latch,None,.38))
    for y in (12.3,14.2,16.1):
        box('Grip moulding',(0,y,.62),(8.6,.48,.35),latch,grey,.15)
    # A removable stand supports a loose bench example. A fitted example uses
    # the board's own rail. Never move the device or its ports for inspection.
    stand=detail('bench-rail-support','This bench stand leaves room for wires under a loose device. A device fitted in a board uses the rail inside the board.',mounting,benchOnly=True)
    stand_width=width+4.5
    support={}
    for key in ['leg','foot','rail']:
        support[key]=api.semantic('mounting',stand,data={'standMember':key})
    box('Rear stand leg',(0,(41.5-LIFT/UNIT)/2,-4),(width-1,41.5+LIFT/UNIT,2.3),support['leg'],zinc)
    box('Folded stand foot',(0,-LIFT/UNIT+1.2,2.4),(stand_width,2.4,18),support['foot'],zinc,.55)
    box('Top hat base',(0,41.5,-1.95),(stand_width,28,1.5),support['rail'],zinc)
    for s in (-1,1):
        box('Rail web',(0,41.5+s*13.5,1.7),(stand_width,1.45,8.1),support['rail'],zinc,.24)
        box('Rail flange',(0,41.5+s*15.5,5.15),(stand_width,4,1.4),support['rail'],zinc,.2)
    # Internal layout is an illustration of the applicable trip principles.
    inside=detail('protection-mechanism','Inside this teaching cutaway the contacts open when the trip latch releases. The trip parts are drawn to explain how they work.',part('contacts'),conceptualInternal=True)
    thermal=api.semantic('thermal',inside) if not rccb else None
    magnetic=api.semantic('magnetic',inside) if not rccb else None
    for i in range(poles):
        x=(i-(poles-1)/2)*17.5
        box('Fixed contact arm',(x,49,28),(3.6,11,1.9),inside,copper,.3)
        arm=box('Moving contact blade',(x,39.9,31),(3.3,13.2,2),inside,copper,.25)
        arm.rotation_euler.x=-.50
        for y,z in ((44.4,28.9),(44.6,29.9)):
            box('Silver contact pad',(x,y,z),(3.6,2.5,.8),inside,zinc,.2)
        if not rccb and (not rcbo or i==0):
            for j in range(7):
                box('Arc splitter lamination',(x,57.8+j*1.05,26),(11.5,.43,10.5),inside,zinc,.10)
            for j in range(9):
                ring=api.torus('Magnetic trip winding',mm((x,37+j*.90,20)),3.15*UNIT,.39*UNIT,magnetic,copper)
                ring.rotation_euler.x=math.pi/2
            box('Thermal trip strip',(x,26,23),(3.4,11.8,.9),thermal,copper,.18)
    if differential:
        ring_x=width/2-8.75
        core=api.semantic('toroid',inside)
        api.torus('Differential sensing core',mm((ring_x,40,37)),6.1*UNIT,1.58*UNIT,core,dark)
        for x in (-2.3,2.3):
            cyl('Current path through core',(ring_x+x,40,37),.98,13.0,inside,copper)
        box('Test path resistor',(ring_x,50.3,34),(9,2.1,2.4),inside,brass)
    return ['individual-electrical-terminations','protection-mechanism','din-latch','installation-details','bench-rail-support']+(['contact-indicator'] if differential else [])+(['din-paddle'] if domestic else [])+(['residual-trip-window','rccb-test-key'] if kind=='rcd' else [])
