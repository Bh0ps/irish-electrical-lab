"""Editable service-side assemblies from the manufacturer views in reference-map.json.

Coordinates are the authored Y-up workbench coordinates. The electrical IDs live
on the original orientated terminal empties. Their local +Z is the conductor
approach. No manufacturer's artwork or certification marking is reproduced.
"""
import math
import bpy
from mathutils import Vector

WALL = {'switch:single-rocker', 'switch2:single-rocker', 'intermediate:single-rocker',
        'switch:gang-module-left', 'switch:gang-module-right'}


def add_lighting_back(recipe, root, A, previous):
    key = recipe['galleryKey']
    if key not in WALL and key not in {'rose:default', 'lamp:bulb'}:
        return previous
    plastic = A.material('Warm white injection moulding', (.82, .81, .76), 0, .28)
    grey = A.material('Grey insulated switching cassette', (.25, .265, .26), .015, .40)
    edge = A.material('Raised field-marking contrast', (.44, .465, .45), 0, .47)
    brass = A.material('Rolled contact brass', (.60, .385, .13), .72, .28)
    copper = A.material('Contact pressure tongue', (.505, .245, .105), .70, .29)
    zinc = A.material('Zinc plated captive screw', (.51, .55, .56), .75, .23)
    dark = A.material('Recessed switch insulation', (.035, .044, .043), 0, .68)
    clear = A.material('Clear moulded rose polycarbonate', (.76, .83, .79), 0, .24, .48)
    ceramic = A.material('Lampholder ceramic insert', (.81, .80, .71), 0, .50)
    term_nodes = {o['terminalId']: o for o in root.children_recursive if o.get('terminalId')}
    for obj in list(root.children_recursive):
        if obj.type != 'MESH':
            continue
        owners = list(A.ancestors(obj))
        parts = [o['partId'] for o in owners if o.get('partId')]
        details = [o['detailId'] for o in owners if o.get('detailId')]
        remove = 'terminals' in parts or 'installation-details' in details
        if key in WALL:
            remove |= 'body' in parts and not details and 'cover' not in parts
            if 'contacts' in parts:
                # The old solid carrier occupies the same volume as the real
                # cassette. Keep the actual spring and contact blades inside.
                remove |= not details and not any(o.get('animation') for o in owners)
                obj['conceptualInternal'] = True
        elif key == 'rose:default':
            remove = True
        else:
            remove |= (not set(parts).intersection({'emitter','pins','electronics'}) and
                       not set(details).intersection({'lamp-internal-construction','tungsten-coiled-filament'}))
        if remove:
            bpy.data.objects.remove(obj, do_unlink=True)
    features = []
    def detail(id, purpose, owner):
        # An earlier construction pass may have left an empty group with this
        # name. A named inspection must lead to the replacement geometry.
        for old in root.children_recursive:
            if old.get('detailId')==id and not any(n.type=='MESH' for n in old.children_recursive):
                del old['detailId']
                if 'detailPurpose' in old:del old['detailPurpose']
        features.append(id)
        return A.empty('detail:'+id,owner,data={'detailId':id,'detailPurpose':purpose})
    body = A.semantic('body',root)
    mounting = A.semantic('mounting',root)

    # Keep the screw recess cut into the metal. A painted line would disappear
    # when viewed from the side and give the wrong screwdriver seating.
    def screw(owner, xy, z, radius=.023, cross=False, angle=0):
        x,y = xy
        head = A.cyl('Captive fastener head',(x,y,z),radius,.013,owner,zinc,vertices=28)
        for rot in ([angle,angle+math.pi/2] if cross else [angle]):
            cutter=A.box('Recess cutting tool',(x,y,z+.0065),(radius*2.12 if not cross else radius*1.52,
                         radius*.285,.008),owner,None,0)
            cutter.rotation_euler.z=rot
            A.boolean_difference(head,cutter)
        return head

    def ring(owner, xy, z, outer, inner, depth, mat, name):
        x,y=xy
        obj=A.cyl(name,(x,y,z),outer,depth,owner,mat)
        A.boolean_difference(obj,A.cyl('Through bore',(x,y,z),inner,depth+.04,owner,None))
        return obj

    def pocket(obj, owner, x,y,z, w,h,depth, tilt=0):
        cutter=A.box('Cable window cutting tool',(x,y,z),(w,h,depth),owner,None,.003)
        cutter.rotation_euler.z=tilt
        A.boolean_difference(obj,cutter)

    def clamp_owner(t, purpose):
        n=term_nodes[t['id']]
        g=next(o for o in n.children_recursive if o.get('detailId')=='terminal-clamp:'+t['id'])
        g.scale=(1,1,1)
        g['detailPurpose']=purpose
        return g

    if key in WALL:
        gang=recipe['component']['params'].get('gangModule')
        bg_single=key in {'switch:single-rocker','switch2:single-rocker'}
        plate_center=.23 if gang=='left' else 0
        if gang!='right':
            # The screw spacing is 60.3 mm on the 86 mm reference plate.
            ribs=detail('ribbed-switch-plate',
                'The moulded ribs stiffen the back of the faceplate. The two through bosses locate the plate fixing screws.',body)
            cy=.651; width=.965 if gang else .876; height=.955
            plate=A.box('Rear faceplate skin',(plate_center,cy,.069),(width,height,.035),ribs,plastic,.017)
            for side in [-1,1]:
                x=plate_center+side*width*.3506
                A.boolean_difference(plate,A.cyl('Fixing passage',(x,cy,.069),.022,.09,ribs,None))
                ring(ribs,(x,cy),.052,.038,.023,.050,plastic,'Full depth fixing boss')
                if side==1:
                    for y in [cy-height*.5+.012,cy+height*.5-.012]:
                        A.box('Top and bottom return',(plate_center,y,.050),(width-.024,.019,.050),ribs,plastic,.006)
                for delta in ([.194,.259] if bg_single else [-.145,.145]):
                    A.box('Faceplate seating lug',(plate_center+side*width*.415,cy+delta,.034),(.055,.018,.068),ribs,plastic,.006)
                if bg_single:
                    for delta in [-.175,-.263]:
                        cx=plate_center+side*width*.373
                        for dims in [(.057,.018,.049),(.018,.057,.049)]:
                            A.box('Cruciform locating rib',(cx,cy+delta,.032),dims,ribs,plastic,.005)
                A.box('Side return',(plate_center+side*(width*.5-.011),cy,.050),(.019,height-.04,.050),ribs,plastic,.005)
            for ratio in [-.29,-.10,.10,.29]:
                A.box('Longitudinal stiffener',(plate_center+width*ratio,cy,.050),(.012,height-.027,.035),ribs,plastic,.003)
            for delta in [-.244,-.049,.049,.244]:
                A.box('Transverse stiffener',(plate_center,cy+delta,.047),(width-.025,.014,.04),ribs,plastic,.004)
            for x in [-.33,.33]:
                for y in [-.153,.153]:
                    A.torus('Circular moulding witness',(plate_center+x,cy+y,.050),.024,.0016,ribs,plastic)
        # The 813 intermediate uses a wider block with two pairs of entries.
        inter = key.startswith('intermediate:')
        cassette=detail('recessed-switch-cassette',
            'The closed grey cassette separates the switching contacts. Recessed mouths admit the conductors and captive fasteners stay in the moulding.',body)
        if bg_single:cassette['preservePlanarLod']=True
        fixings=detail('switch-case-fixings',
            'These three screws hold the switch case together. The screws that grip the wires are reached from the ends.',cassette) if bg_single else cassette
        width=.295 if inter else .245; half=width/2
        core=A.box('Recessed cassette body',(0,.650,-.044),(width,.472,.188),cassette,grey,.019)
        top=.886; bottom=.414
        if bg_single:
            # The 811/812 photographs show three case fixings. The top two
            # sit on steps beside the COM entry. The lower fixing is visible
            # below the curved skirt between the two angled moulded feet.
            for side in [-1,1]:
                step=A.box('Tool for recessed upper ear',(side*.118,top,-.136),
                           (.140,.113,.110),cassette,None,.014)
                A.boolean_difference(core,step)
            relief=A.cyl('Lower skirt clearance tool',(0,bottom-.003,-.135),.048,.134,cassette,None)
            A.boolean_difference(core,relief)
            lower=A.empty('Lower case fixing seat',fixings,(0,bottom+.031,-.071))
            lower.rotation_euler.y=math.pi
            screw(lower,(0,0),.003,.018,True,-.13)
        for t in recipe['terminals']:
            x,y,z=t['anchor']; angle=0 if inter or t['id']=='COM' else (.17 if x>0 else -.17)
            pocket(core,cassette,x,y,-.12,.053,.039,.09,angle)
            g=clamp_owner(t,'The conductor enters this rectangular opening. A recessed contact tongue clamps the core inside the insulated cassette.')
            # Terminal coordinates point out of the moulding. Recess the metal.
            g.rotation_euler.z=-angle
            A.box('Inner brass floor',(0,-.010,-.023),(.048,.012,.039),g,copper,.002)
            for side in [-1,1]:
                A.box('Rolled terminal side',(side*.022,.002,-.036),(.008,.032,.042),g,brass,.002)
            A.box('Recessed clamping tongue',(0,.010,-.039),(.038,.008,.040),g,zinc,.0016)
            # The screw is captured along the length of the cassette, outside
            # the aperture. Its tip is visible only down the cable window.
            A.cyl('Captive clamp screw tip',(0,.016,-.048),.010,.024,g,zinc,False,20)
            field_mark = t['label'].split(' (')[0]
            A.label(field_mark,(x,y+(.043 if y>.65 else -.044),-.142),cassette,edge,.030,rear=True)
            # Separate screwdriver access on the ends of the moulding, as on
            # the manufacturer's rear/oblique photographs. This recess leads
            # down to the screw, unlike the rear-facing conductor mouth.
            sign = 1 if y>.65 else -1
            end = .65 + sign*.236
            cutter=A.box('Screwdriver access core',(x,end,-.078),(.045,.116,.048),cassette,None,.004)
            A.boolean_difference(core,cutter)
            tool=A.empty('Axial screwdriver recess',cassette,(x,end-sign*.042,-.078))
            tool.rotation_euler.x=-sign*math.pi/2
            screw(tool,(0,0),0,.019,False,.32)
        for side in [-1,1]:
            for y in [.52,.78]:
                A.box('Latch shoulder',(side*(half+.005),y,.006),(.022,.076,.053),cassette,grey,.003)
                A.box('Recess below spring latch',(side*(half+.018),y,-.001),(.004,.035,.026),cassette,dark,.002)
            for y in ([top,bottom] if inter else [top]):
                x=side*(half-.039)
                lug=A.cyl('Rounded retaining ear',(x,y+.006,-.063 if bg_single else -.067),.047,.082 if bg_single else .126,cassette,grey)
                collar=A.empty('Case fixing',fixings,(x,y+.006,-.105 if bg_single else -.14))
                collar.rotation_euler.y=math.pi
                screw(collar,(0,0),.004,.027,True,.14*side)
        name='INTERMEDIATE' if inter else '2 WAY' if key.startswith('switch2:') else '1 WAY'
        if inter:
            for side in [-1,1]:
                A.box('Raised horizontal insulating shoulder',(side*.072,.667,-.145),(.122,.065,.023),cassette,grey,.007)
                A.box('Narrow guide extension',(side*.104,.704,-.147),(.054,.064,.023),cassette,grey,.005)
            A.box('Crossing mechanism cover',(0,.615,-.154),(.232,.065,.026),cassette,grey,.011)
            A.label(name,(0,.615,-.169),cassette,edge,.021,rear=True)
        elif bg_single:
            # BG moulds the rating vertically along one side. Retain the
            # terminal markings in Economy and load the fine print up close.
            rating=A.material('Switch close-up rating',(.44,.465,.45),0,.47)
            margin=A.empty('Vertical switch rating',cassette,(-.083,.662,-.141))
            margin.rotation_euler.z=math.pi/2
            A.box('Raised rating surround',(0,0,0),(.177,.034,.004),margin,grey,.004)
            A.label('20 A 16AX 250 V~',(0,0,-.003),margin,rating,.017,rear=True)
            A.label(name,(0,.646,-.141),cassette,edge,.019,rear=True)
        else:
            A.box('Raised specification surround',(0,.643,-.140),(.188,.064,.009),cassette,grey,.007)
            A.label('20A   16AX',(0,.650,-.146),cassette,edge,.020,rear=True)
            A.label('250V~',(0,.626,-.146),cassette,edge,.018,rear=True)
            A.label(name,(0,.689,-.141),cassette,edge,.019,rear=True)
        A.box('Recessed mould parting land',(0,.612,-.140),(width*.71,.006,.003),cassette,grey,.001)

    elif key=='rose:default':
        # BG 661 photo A6, viewed with its screw cap removed. The base is
        # clear moulding; a central removable knockout and offsets take cable.
        cy=.449; rr=.439
        base=detail('cable-entry-knockouts','A central wiring aperture and removable knockout admit the fixed cables through the clear mounting base.',body)
        base['preservePlanarLod']=True
        disc=A.cyl('Clear mounting base',(0,cy,-.025),rr,.045,base,clear)
        # A6 shows an open rectangular entry above a second, still-attached
        # knockout marked REMOVE. The two have different surfaces and edges.
        pocket(disc,base,0,.326,-.025,.328,.213,.13)
        A.box('Retained cable-entry knockout',(0,.266,-.021),(.316,.083,.029),base,clear,.004)
        for x in [-.114,.114]:
            A.box('Knockout moulding bridge',(x,.221,-.024),(.020,.018,.017),base,clear,.002)
        A.label('REMOVE',(0,.265,-.005),base,edge,.028)
        for x,y,slotted in [(-.270,.530,False),(.296,.559,False),(-.277,.343,True),(.261,.365,False)]:
            hole=A.cyl('Round mounting hole tool',(x,y,-.025),.026,.13,base,None)
            if slotted:
                hole.scale.x=1.7;hole.rotation_euler.z=.26
            A.boolean_difference(disc,hole)
            boss=ring(base,(x,y),.003,.045,.026,.041,clear,'Raised locating boss')
            if slotted:
                boss.scale.x=1.7;boss.rotation_euler.z=.26
        ring(base,(0,cy),.020,rr,.419,.072,clear,'Clear perimeter lip')
        for y in [.214,.439]:A.box('Cable opening lip',(0,y,.006),(.353,.010,.019),base,clear,.003)
        for x in [-.173,.173]:A.box('Cable opening side',(x,.326,.006),(.009,.226,.019),base,clear,.003)
        links=detail('three-insulated-terminal-groups','Three insulated groups hold the neutral link, permanent loop link and switched lamp-line link. Insulating fins separate their copper bars.',body)
        links['serviceChamber']=True
        for ids,mark in [(['N','NOUT','N3'],'N'),(['LOOP1','LOOP2','LOOP3'],'LOOP'),(['L','LOUT'],'L')]:
            xs=[t['anchor'][0] for t in recipe['terminals'] if t['id'] in ids];middle=(min(xs)+max(xs))/2;size=max(xs)-min(xs)+.070
            A.box('Terminal backing separator',(middle,.677,.057),(size+.015,.143,.052),links,dark,.006)
            A.box('Continuous terminal bar',(middle,.698,.094),(size,.064,.049),links,brass,.005)
            for x in [min(xs)-.039,max(xs)+.039]:
                A.box('Clear insulated group partition',(x,.681,.09),(.014,.153,.084),links,clear,.004)
            A.label(mark,(middle,.585,.018),links,grey,.030)
        for t in recipe['terminals']:
            earth=t['id'] in ('PE','PEOUT')
            g=clamp_owner(t,'A conductor enters the brass bore. The captive screw presses the conductor into its group’s common brass block.')
            cell=A.box('Solid drilled brass terminal',(0,.015,-.018),(.059 if earth else .065,.070,.076),g,brass,.005)
            A.boolean_difference(cell,A.cyl('Cable bore',(0,0,-.015),.016,.115,g,None,True,24))
            A.box('Conductor bed',(0,-.012,-.018),(.024,.006,.050),g,copper,.002)
            if not earth:screw(g,(0,.043),.019,.024,False,.28)
            else:A.box('PE block support',(0,-.032,-.046),(.048,.014,.035),g,grey,.002)
        A.box('Earth clamping block',(0,.191,.108),(.106,.065,.048),links,brass,.006)
        screw(links,(0,.19),.137,.035,False,.23)
        A.label('PE',(.095,.153,.018),links,grey,.027)
        cover=A.semantic('cover',root,(0,cy,.151),{'restPosition':[0,cy,.151],'restRotation':[0,0,0]})
        rim=detail('cover-fixing','The circular cap spins onto the base. Its rounded central opening protects the pendant flex.',cover)
        wall=ring(rim,(0,0),.026,rr+.005,rr-.013,.111,plastic,'Spin-on skirt')
        lid=ring(rim,(0,0),.083,rr+.005,.040,.035,plastic,'Pendulum flex exit')
        ring(rim,(0,0),.11,.068,.039,.044,plastic,'Rolled cord exit')
        for z in [-.009,.009]:A.torus('Internal thread crest',(0,0,z),rr-.012,.004,rim,plastic)
    else:
        # S. Lilley 3015E: fixing centres / base diameter = 40/48.
        base=detail('lamp-mounting','The brass angled batten holder attaches at two fixing holes. The earth block is mechanically bonded to the metal base.',mounting)
        c=.270;rad=.254
        flange=ring(base,(0,c),-.141,rad,.168,.040,brass,'Spun brass flange')
        for x in [-rad*40/48,rad*40/48]:
            A.boolean_difference(flange,A.cyl('Mounting clearance',(x,c,-.14),.021,.095,base,None))
        A.torus('Rolled brass mounting rim',(0,c,-.15),rad-.006,.007,base,brass)
        # Keep both the external bulb envelope and its cutaway filament in
        # the same assembly when pitching the lampholder toward its opening.
        lampaxis=A.empty('Angled holder axis',root,(0,.306,-.068),data={'partId':'body'})
        lampaxis.rotation_euler.x=math.pi/4
        for name in ['Authored Blender fixture','Detailed family construction']:
            frame=next(o for o in root.children if o.name.startswith(name))
            frame.parent=lampaxis
            # The old uniform catalogue envelope was independently scaled on
            # each axis. Restore a circular B22 cap of 22 mm and size the
            # A55 glass separately to the 55 × 97 mm reference lamp.
            frame.scale=(1.148,1.424,1.148)
            frame.location.y=.11-.367*1.424
        glass=A.material('Clear blown GLS envelope',(.88,.94,.93),.015,.13,.18)
        for mesh in root.children_recursive:
            if mesh.get('lampEnvelope'):
                mesh.scale.x*=1.071
                mesh.scale.z*=1.071
                mesh.data.materials.clear()
                mesh.data.materials.append(glass)
        # The removable upper ring retains the bayonet holder when assembled.
        cap=next(o for o in root.children_recursive if o.get('partId')=='cover' and o.get('restPosition'))
        A.torus('Machined retaining collar',(0,.042,0),.139,.009,cap,brass,False)
        A.cyl('Angled brass socket throat',(0,.057,0),.142,.288,lampaxis,brass,False)
        for y,r in [(-.056,.148),(.013,.164),(.169,.147)]:
            A.torus('Union and shade ring rolled rim',(0,y,0),r,.009,lampaxis,brass,False)
        for i in range(32):
            angle=i*math.tau/32
            A.box('Shade ring grip flute',(.161*math.sin(angle),.012,.161*math.cos(angle)),(.010,.034,.010),lampaxis,brass,.002).rotation_euler.y=angle
        insert=detail('ceramic-terminal-insert','The two current-carrying terminals are insulated by a ceramic insert. A separate brass tag connects the earth block to the shell.',body)
        backing=A.cyl('Ceramic interior',(0,c,-.120),.167,.089,insert,ceramic)
        for t in recipe['terminals']:
            x,y,z=t['anchor'];earth=t['id']=='PE'
            if earth:A.box('Brass earth continuity tongue',(0,.413,-.146),(.050,.105,.017),insert,brass,.004)
            g=clamp_owner(t,'A screw clamps the copper in the brass terminal. Line and neutral are insulated from the brass mounting flange.')
            block=A.box('Brass wire clamp',(0,.012,-.014),(.064,.082,.073),g,brass,.006)
            A.boolean_difference(block,A.cyl('Real cable entry',(0,0,-.016),.017,.106,g,None,True,24))
            screw(g,(0,.035),.021,.022,False,-.16 if earth else .25)
            A.box('Insulating partition',(.039,.015,-.030),(.010,.092,.062),g,ceramic,.003)
            A.label(t['label'],(x+.046,y-.026,-.163),insert,grey,.025,rear=True)
    # Some historic meshes have been physically replaced. Expose only detail
    # groups that actually contain geometry in the revised editable source.
    existing={}
    for o in root.children_recursive:
        if o.get('detailId') and any(c.type=='MESH' for c in o.children_recursive):
            existing[o['detailId']]=True
    return list(dict.fromkeys(f for f in previous+features if f in existing or f=='individual-electrical-terminations'))
