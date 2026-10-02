"""Original, editable family construction details in recipe Y-up coordinates.

Dimensions are illustrative training proportions, not replacement-part CAD.
Every assembly owns a detailId and a purpose; actual electrical ports stay in
their original nodes. The source .blend keeps assemblies separate and editable.
"""
import math
import bpy
from mathutils import Vector

REVISION=2
FAMILY_REQUIREMENTS={
 'supply':['sealed-service-entry','cable-termination'], 'meter':['meter-current-path','meter-isolation'],
 'panel':['din-rail-profile','comb-busbar','enclosure-bond'], 'bar':['copper-current-bar','insulating-support'],
 'protection':['protection-mechanism','din-latch'], 'switch':['switch-contact-mechanism','faceplate-fixing'],
 'socket':['socket-contact-system','accessory-strain-relief'], 'plug':['plug-contact-system','accessory-strain-relief'],
 'junction':['cable-entry-knockouts','cover-fixing'], 'lamp':['lamp-internal-construction','lamp-mounting'],
 'sensor':['sensor-transducer','sensor-interface'], 'controller':['control-relay','control-board'],
 'heater':['heat-transfer-construction','thermal-protection'], 'appliance':['appliance-process-assembly','appliance-control'],
 'valve':['valve-gearing','valve-end-switch'], 'pump':['pump-impeller-seal','motor-bearing'],
 'fan':['fan-bearing-hub','fan-control-board'], 'motor':['motor-bearing','motor-application-mechanism'],
 'contactor':['double-break-contacts','laminated-magnetic-core'], 'overload':['three-bimetal-trips','compensated-trip-bar'],
 'vfd':['rectifier-dc-link-inverter','thermal-power-module'], 'plc':['isolated-io-bank','processor-board'],
 'inverter':['energy-converter','energy-isolation'], 'alarm':['alarm-transducer','alarm-backup-or-solenoid'],
 'charger':['ev-double-pole-contactor','ev-residual-current-sensor'], 'transformer':['converter-specific-core','converter-isolation-barrier'],
 'cable':['stranded-copper-cores','sheath-cutaway'], 'conduit':['cable-management-construction','cable-management-fixing'],
 'instrument':['instrument-sensing','instrument-input-protection'],
}

def enrich(recipe,root,api):
    global A,M
    A=api
    M={
      'steel':A.material('Detail brushed stainless steel',(.49,.54,.58),.92,.26),
      'zinc':A.material('Detail zinc plated fixing',(.56,.59,.61),.83,.31),
      'copper':A.material('Detail oxygen-free copper',(.59,.25,.10),.9,.28),
      'brass':A.material('Detail machined brass',(.56,.36,.12),.86,.3),
      'silver':A.material('Detail silver alloy contact',(.72,.74,.73),.94,.22),
      'black':A.material('Detail moulded engineering polymer',(.026,.034,.033),0,.48),
      'white':A.material('Detail porcelain white',(.81,.83,.79),0,.38),
      'pcb':A.material('Detail FR4 solder mask',(.026,.16,.072),0,.54),
      'ceramic':A.material('Detail alumina ceramic',(.82,.79,.68),0,.63),
      'blue':A.material('Detail blue identification',(.045,.18,.45),0,.46),
      'red':A.material('Detail red identification',(.43,.035,.02),0,.48),
      'brown':A.material('Detail brown line insulation',(.18,.057,.020),0,.48),
      'grey':A.material('Detail grey phase insulation',(.30,.34,.33),0,.48),
      'yellow':A.material('Detail yellow earth stripe',(.78,.61,.024),0,.51),
      'green':A.material('Detail green earth insulation',(.02,.30,.09),0,.51),
      'rubber':A.material('Detail rubber gasket',(.019,.021,.023),0,.76),
      'brick':A.material('Detail refractory storage core',(.30,.16,.09),0,.91),
      'ferrite':A.material('Detail ferrite magnetic core',(.10,.12,.13),.36,.56),
    }
    model=recipe['definition']['model'];kind=recipe['component']['type'];key=recipe['galleryKey']
    features=[]
    frame=A.empty('Detailed family construction',root,scale=tuple(a/b for a,b in zip(recipe['definition']['size'],(1.3,1.45,.85))))
    declared={p['id'] for p in recipe['definition']['parts']}
    aliases={'sensingcore':'toroid' if kind in ('rcd','rcbo','rcd3') else 'sensing','safetycutout':'thermal','heater':'element','busbar':'terminals','cable':'sheath','gland':'mounting','converter':'electronics','coil':'coil' if 'coil' in declared else 'winding'}
    def canonical(name):
        mapped=name if name in declared else aliases.get(name,name)
        return mapped if mapped in declared else next((candidate for candidate in ('electronics','winding','thermal','contacts','sensing','body') if candidate in declared),'body')
    def part(name):
        node=A.semantic(canonical(name),frame)
        if name in ('electronics','coil','winding','thermal','magnetic'):node['conceptualInternal']=True
        return node
    def feature(code,purpose,owner=None,position=(0,0,0)):
        if code not in features:features.append(code)
        return A.empty('detail:'+code,owner or part('electronics'),position,data={'detailId':code,'detailPurpose':purpose,'detailRevision':REVISION})
    def existing(name):return next((o for o in root.children_recursive if o.get('partId')==name),None)
    def rotating(assembly):
        motion=next((o for o in root.children_recursive if o.get('animation')=='rotor'),None)
        if not motion:raise ValueError('Missing rotor motion '+key)
        bpy.context.view_layer.update();world=assembly.matrix_world.copy();assembly.parent=motion;assembly.matrix_world=world
    def remove_bare_fixings():
        bpy.context.view_layer.update()
        for mesh in list(root.children_recursive):
            if mesh.type!='MESH' or mesh.dimensions.length>.13:continue
            parents=list(A.ancestors(mesh))
            if any(p.get('terminalId') or p.get('detailId') or p.get('animation') for p in parents):continue
            owner=next((p.get('partId') for p in parents if p.get('partId')),'')
            if owner and owner!='mounting':continue
            bpy.data.objects.remove(mesh,do_unlink=True)
    def remove_cover_fixings(cover,points):
        if not cover:return
        bpy.context.view_layer.update();inverse=cover.matrix_world.inverted()
        for mesh in list(cover.children_recursive):
            if mesh.type!='MESH' or mesh.dimensions.length>.15 or any(p.get('detailId') for p in A.ancestors(mesh)):continue
            if next((p.get('partId') for p in A.ancestors(mesh) if p.get('partId')),'') not in ('cover','mounting'):continue
            p=inverse@mesh.matrix_world.translation
            if any(abs(p.x-x)<.065 and abs(p.y-y)<.065 for x,y in points):bpy.data.objects.remove(mesh,do_unlink=True)
    def remove_parts(names):
        # Removal must never use the picking fallback: an undeclared electronic
        # part can resolve to Housing for selection, but does not authorize
        # deleting the equipment enclosure.
        targets={name if name in declared else aliases.get(name,name) for name in names}
        for o in list(root.children_recursive)[::-1]:
            if o.type=='MESH' and not any(p.get('terminalId') for p in A.ancestors(o)) and any(p.get('partId') in targets for p in A.ancestors(o)):
                bpy.data.objects.remove(o,do_unlink=True)
    # All rear ports receive real cage/pressure plate/shank construction. Their
    # parent matrix, ID, rotation and local wire-bore origin are never changed.
    for terminal in recipe['terminals']:
        node=next(o for o in root.children_recursive if o.get('terminalId')==terminal['id'])
        for child in list(node.children_recursive)[::-1]:bpy.data.objects.remove(child,do_unlink=True)
        clamp=feature('terminal-clamp:'+terminal['id'],'Screw and captive pressure plate clamp the conductor against a brass current cage. Bore origin is the immutable connection anchor.',node)
        scale=float(terminal.get('scale',1));clamp.scale=(scale,scale,scale)
        # Split insulated sidewalls expose the actual conductor entry, never a
        # fictitious terminal on the front of the equipment.
        for x in (-.058,.058):A.box('Insulated cage side',(x,.025,-.055),(.017,.11,.112),clamp,M['black'],.004)
        A.box('Insulated cage floor',(0,-.025,-.052),(.13,.015,.112),clamp,M['black'],.004)
        A.box('Brass conductor bed',(0,-.012,-.033),(.09,.015,.075),clamp,M['brass'],.003)
        for x in (-.044,.044):A.box('Folded brass current cage',(x,.018,-.032),(.012,.058,.075),clamp,M['brass'],.002)
        A.box('Captive conductor pressure plate',(0,.019,-.033),(.072,.009,.064),clamp,M['zinc'],.002)
        ring('Rear conductor funnel',(0,0,.004),.030,.022,.010,clamp,M['brass'])
        fixing((0,.049,.024),clamp,.026,'slot',washer=False,shaft=.059)
        role=terminal['role'];color='green' if role=='PE' else 'blue' if role=='N' else 'black' if role in ('L2','DC-') else 'grey' if role=='L3' else 'red' if role=='DC+' else 'brown'
        A.box('Moulded conductor identification',(0,-.043,-.014),(.13,.022,.032),clamp,M[color],.003)
        if role=='PE':A.box('Protective green yellow stripe',(-.020,-.043,.003),(.027,.022,.003),clamp,M['yellow'],.001)
    if recipe['terminals']:features.append('rear-pressure-plate-terminals')

    if model in ('supply','meter'):
        p=part('electronics')
        if model=='supply':
            f=feature('sealed-service-entry','Contextual service boundary: insulated tails, sealed cut-out cartridge and enclosure seals, shown as a representative supply interface.',p)
            for x in (-.24,-.06,.12) if kind=='source3' else (-.19,):
                A.box('Service fuse cartridge',(x,.78,.02),(.14,.37,.10),f,M['ceramic'],.012)
                for y in (.60,.96):A.box('Cut-out contact cap',(x,y,.03),(.15,.037,.11),f,M['brass'],.003)
            neutral_x=.31 if kind=='source3' else .19
            A.box('Unfused neutral solid link',(neutral_x,.78,.025),(.07,.38,.040),f,M['brass'],.004)
            for y in (.62,.94):fixing((neutral_x,y,.050),f,.017,'slot')
            for x in (-.35,.35):fixing((x,1.1,.17),part('mounting'),.022,'hex',seal=True)
            f=feature('cable-termination','Insulated service tails enter through separate strain relieved bushings.',p)
            for x in (-.22,.22):tube('Service tail',[(x,.38,-.04),(x,.47,.01),(x,.59,.01)],.035,f,M['red' if x>0 else 'blue'])
        else:
            f=feature('meter-current-path','Conceptual energy measurement board separates current sensing, voltage sensing and the insulated output path.',p)
            pcb(f,(0,.75,.02),(.63,.66),chips=3)
            for x in (-.19,.19):A.box('Meter current busbar',(x,.51,.07),(.05,.43,.018),f,M['copper'],.003)
            A.box('Current measurement shunt',(0,.41,.075),(.28,.022,.03),f,M['steel'],.002)
            f=feature('meter-isolation','Insulation barrier and optically isolated pulse interface are conceptual, not a fiscal meter implementation.',p)
            A.box('Isolation shield',(0,.64,.04),(.018,.54,.12),f,M['ceramic'],.004)
            package(f,(.19,.96,.073),(.17,.08,.027),8)
    elif model=='panel':
        f=feature('din-rail-profile','Rolled DIN35 rail with raised return flanges and slotted mounting holes.',part('mounting'))
        for y in ((.35,.75,1.12) if 'industrial' in key else (.61,.94)):
            for dy in (-.028,.028):A.box('DIN rail flange',(0,y+dy,-.095),(.93,.017,.025),f,M['zinc'],.002)
            for x in (-.37,.37):fixing((x,y,-.08),f,.018,'slot')
        f=feature('comb-busbar','Insulated copper comb distributes the line feed; tooth spacing is illustrative.',part('busbar'))
        A.box('Copper feed bar',(0,.94,.005),(.79,.024,.023),f,M['copper'],.003)
        for x in (-.34,-.22,-.10,.02,.14,.26,.38):A.box('Comb busbar tooth',(x,.89,.005),(.024,.12,.024),f,M['copper'],.002)
        A.box('Touch protection busbar sleeve',(0,.97,.008),(.86,.052,.05),f,M['black'],.006)
        f=feature('enclosure-bond','Dedicated bonding lug and serrated washer maintain enclosure protective continuity.',part('mounting'))
        ring('Earth bonding eye',(-.48,.2,-.12),.035,.018,.011,f,M['copper']);fixing((-.48,.2,-.1),f,.022,'hex')
        tube('Enclosure bond',[(-.48,.2,-.12),(-.38,.2,-.11),(-.32,.30,-.10)],.014,f,M['green'])
    elif model=='bar':
        f=feature('copper-current-bar','Continuous machined copper bar carries all connections on this busbar. Individual clamps remain at the authoritative rear anchors.',part('busbar'))
        A.box('Conductive current bar',(0,.44,-.072),(1.02,.085,.035),f,M['brass'],.003)
        for x in (-.43,.43):fixing((x,.44,-.04),f,.025,'slot')
        f=feature('insulating-support','Raised insulating feet separate the bar from the DIN rail; an earth bar uses its dedicated bonding arrangement.',part('mounting'))
        for x in (-.42,.42):A.box('Insulating standoff',(x,.39,-.13),(.1,.15,.11),f,M['blue' if kind=='neutralbar' else 'green' if kind=='earthbar' else 'white'],.009)
    elif model=='protection':
        # Replace the old shared internals instead of leaving an illustrative
        # MCB bimetal/arc stack inside an RCCB, fuse or MOV cartridge.
        bpy.context.view_layer.update();inverse=frame.matrix_world.inverted()
        for mesh in list(root.children_recursive):
            if mesh.type!='MESH':continue
            parents=list(A.ancestors(mesh))
            if any(p.get('detailId') or p.get('terminalId') or p.get('partId')=='cover' for p in parents):continue
            owner=next((p.get('partId') for p in parents if p.get('partId')),'');p=inverse@mesh.matrix_world.translation
            internal_owner=owner in ('contacts','thermal','magnetic','toroid','winding','coil','fuse')
            small_generic=.43<p.y<1.19 and -.22<p.x<.29 and -.001<p.z<.17 and max(mesh.dimensions)<.35
            if internal_owner or small_generic:bpy.data.objects.remove(mesh,do_unlink=True)
        p=part('electronics');f=feature('protection-mechanism','Family-specific protective element with simplified contacts and trip coupling; no manufacturer-specific trip geometry or timing.',p)
        if kind=='fuse':
            ceramic_fuse(f,(0,.75,.035),.36,.075)
            for y in (.52,.97):spring_contact(f,(0,y,.04),.10)
        elif kind=='spd':
            for x in (-.13,.13):
                A.cyl('MOV suppression disc',(x,.74,.03),.11,.035,f,M['blue']);tube('MOV lead',[(x,.63,.03),(x,.52,.03)],.01,f,M['copper'])
            A.box('Thermal disconnect link',(0,.52,.08),(.3,.017,.025),f,M['silver'],.002)
            A.box('Status linkage',(0,.87,.075),(.032,.27,.025),f,M['red'],.002)
        else:
            if kind in ('rcd','rcbo','rcd3'):
                toroidal_winding(f,(0,.72,.04),.16,.045,16)
                for x in (-.08,.08):tube('Live neutral through sensing core',[(x,.43,.04),(x,.95,.04)],.015,f,M['copper'])
                package(f,(.23,.71,.04),(.12,.17,.07),4)
                A.box('Test resistor',(0,1.04,.03),(.20,.055,.04),f,M['ceramic'],.006)
            if kind in ('mcb','mcb3','rcbo'):
                for y in [1.01+i*.018 for i in range(8)]:A.box('Separated arc splitter plate',(-.18,y,.02),(.19,.009,.16),f,M['steel'],.001)
                helix('Magnetic trip solenoid',(.19,.80,.02),.06,.21,9,.005,f,M['copper'])
                A.box('Bimetal trip strip',(.16,.51,.03),(.038,.28,.01),f,M['copper'],.001)
            A.box('Common trip latch',(0,.68,.10),(.3,.034,.03),f,M['steel'],.003)
            spring_contact(f,(-.05,.81,.07),.15)
        f=feature('din-latch','Captive spring latch secures the protective device to the rail.',part('mounting'))
        A.box('DIN spring slider',(0,.20,-.21),(.30,.05,.07),f,M['black'],.006);helix('Latch return spring',(0,.24,-.2),.019,.10,6,.003,f,M['steel'])
    elif model=='switch':
        f=feature('switch-contact-mechanism','Push, rotary or rocker mechanism operates a distinct contact cassette. Switching is animated by the existing operating nodes.',part('contacts'))
        if kind=='dimmer':
            pcb(f,(0,.69,-.015),(.43,.50),chips=2)
            A.box('Power triac heatsink',(.10,.62,.055),(.17,.19,.035),f,M['steel'],.004)
            package(f,(.10,.62,.079),(.074,.09,.025),3)
            toroidal_winding(f,(-.10,.62,.06),.061,.021,10)
            A.box('Suppression capacitor',(0,.88,.044),(.20,.065,.075),f,M['blue'],.007)
        else:
            poles=3 if kind=='isolator3' else 2 if kind in ('isolator','intermediate','changeover') else 1
            for i in range(poles):spring_contact(f,((i-(poles-1)/2)*.13,.7,.028),.13)
            helix('Snap action spring',(0,.72,.065),.027,.13,8,.0035,f,M['steel'])
            A.box('Insulating cam follower',(0,.78,.067),(.10,.15,.075),f,M['black'],.01)
        right='gang-module-right' in key;left='gang-module-left' in key
        if not right:remove_cover_fixings(existing('cover'),[(-.49 if left else -.425,0),(.49 if left else .425,0)])
        f=feature('faceplate-fixing','The left module owns the shared two-gang faceplate; this module has captive contact-cassette retainers.' if right else 'Countersunk accessory screws with recessed heads, captive washers and threaded shanks.',part('contacts') if right else existing('cover') or part('mounting'))
        if right:
            for x in (-.135,.135):fixing((x,.7,.037),f,.012,'cross')
        else:
            for x in ((-.49,.49) if left else (-.425,.425)):fixing((x,0,.058),f,.026,'cross')
    elif model in ('socket','plug'):
        if kind=='socket3':
            # Replace the old solid female brass faces with apertured sleeves.
            bpy.context.view_layer.update();inverse=frame.matrix_world.inverted()
            for mesh in list(root.children_recursive):
                if mesh.type!='MESH' or not mesh.data.materials or any(p.get('detailId') or p.get('terminalId') for p in A.ancestors(mesh)):continue
                shader=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF');color=shader.inputs['Base Color'].default_value;p=inverse@mesh.matrix_world.translation
                if shader.inputs['Metallic'].default_value>.5 and color[0]>color[2]*1.7 and p.z>.30:bpy.data.objects.remove(mesh,do_unlink=True)
        f=feature('socket-contact-system' if model=='socket' else 'plug-contact-system','Spring contact sockets, insulating partitions and protective contact construction appropriate to the accessory family.',part('contacts'))
        if kind in ('socket3','plug3'):
            for i in range(5):
                a=i*math.tau/5;p=(math.sin(a)*.13,.7+math.cos(a)*.13,.328)
                if model=='socket':ring('Female contact sleeve',p,.037,.023,.085,f,M['brass'])
                else:ring('Pin retention shoulder',(p[0],p[1],.27),.031,.025,.025,f,M['brass'])
            A.box('CEE keyway rib',(0,.46,.27),(.038,.07,.06),f,M['black'],.004)
        elif kind=='fcu' or model=='plug':
            ceramic_fuse(f,(.20,.69,.02),.27,.041)
            for y in (.51,.87):spring_contact(f,(.2,y,.018),.07)
            A.box('Insulating fuse barrier',(.1,.69,.02),(.018,.40,.13),f,M['black'],.005)
        else:
            for x in (-.315,.315):
                for dx,dy in ((0,.13),(-.115,-.08),(.115,-.08)):spring_contact(f,(x+dx,.62+dy,.07),.075)
                A.box('Earth operated safety shutter',(x,.61,.092),(.30,.047,.019),f,M['white'],.003)
                helix('Shutter return spring',(x,.49,.07),.012,.12,7,.002,f,M['steel'])
        f=feature('accessory-strain-relief','Captive cord grip and partition retain cables independently of electrical clamps.',part('cable'))
        A.box('Cord grip bridge',(0,.31,-.055),(.24,.06,.04),f,M['black'],.007)
        for x in (-.08,.08):fixing((x,.31,-.025),f,.016,'cross')
    elif model=='junction':
        f=feature('cable-entry-knockouts','Cable entry membranes and rounded internal wire guides in the rear base.',part('body'))
        for x in (-.26,.26):ring('Cable entry grommet',(x,.52,-.11),.060,.034,.022,f,M['rubber'])
        if kind=='rose':
            f=feature('cover-fixing','The rose cover engages a threaded rim; base fixings remain behind it.',part('mounting'))
            for x in (-.24,.24):fixing((x,.65,-.08),f,.017,'cross')
        else:
            cover=existing('cover');points=[(-.36,.29),(.36,-.29)];remove_cover_fixings(cover,points)
            f=feature('cover-fixing','Captive fixing bosses and recessed screws separate the cover from the wiring base.',cover or part('mounting'))
            for x,y in points:fixing((x,y,.042),f,.022,'cross')
    elif model=='lamp':
        f=feature('lamp-internal-construction','Emitter construction is representative; its visible output follows this lamp’s solved real power.',part('electronics'))
        if 'bulb' in key:
            for mesh in root.children_recursive:
                if mesh.type=='MESH' and any(p.get('partId')=='emitter' for p in A.ancestors(mesh)):
                    mesh['lampEnvelope']=True
            # Real tungsten filament assembly and glass stem, exposed through
            # the conceptual cutaway without changing the bayonet holder.
            glass=A.material('Glass support stem',(.68,.78,.81),0,.11,.35)
            A.cyl('Glass support stem',(0,.55,0),.023,.23,f,glass,False)
            for x in (-.035,.035):tube('Filament lead-in',[(x,.43,0),(x,.73,0),(x*2,.79,0)],.004,f,M['steel'])
            emitter=part('emitter');emitter['emitterKind']='filament'
            filament=feature('tungsten-coiled-filament','Coiled filament on two supported lead-in conductors.',emitter)
            helix('Tungsten filament',(0,.79,0),.011,.13,18,.0015,filament,M['steel'],axis='x')
        elif kind=='indicator':
            A.box('Indicator LED carrier',(0,.61,.12),(.20,.17,.026),f,M['pcb'],.008)
            A.box('Indicator limiting resistor',(0,.5,.10),(.09,.028,.024),f,M['ceramic'],.004)
        else:
            linear='batten' in key
            pcb(f,(0,.74,.07),(.91,.11) if linear else (.33,.26),chips=0)
            A.box('Aluminium thermal spreader',(0,.74,.045),(.95,.14,.014) if linear else (.34,.27,.014),f,M['steel'],.005)
            if kind=='emergency':
                A.box('Emergency charging controller',(-.30,.86,.02),(.21,.10,.04),f,M['pcb'],.005)
                ceramic_fuse(f,(.36,.63,.01),.10,.019)
        f=feature('lamp-mounting','Family-specific retaining brackets, locknut or mounting-flange hardware.',part('mounting'))
        if 'bulb' in key:
            for x in (-.2,.2):fixing((x,.18,.07),f,.019,'cross')
        elif kind=='indicator':ring('Panel indicator retaining locknut',(0,.61,-.11),.31,.265,.026,f,M['black'])
        elif 'batten' in key:
            for x in (-.38,.38):fixing((x,.72,-.185),f,.016,'cross')
        else:
            for x in (-.33,.33):fixing((x,.7,.018),f,.015,'cross')
    elif model=='sensor':
        p=part('electronics');f=feature('sensor-interface','Low-voltage sensor interface PCB and electrically isolated switching interface, conceptually simplified.',p)
        pcb(f,(0,.71,.035),(.40,.37),chips=2)
        f=feature('sensor-transducer','A distinct physical transducer for the selected sensing mode.',part('sensingcore'))
        mode=recipe['component']['params'].get('mode','PIR').lower()
        if mode=='pir':
            A.cyl('Dual element pyroelectric can',(0,.65,.09),.055,.035,f,M['steel']);A.box('Infrared window',(0,.65,.11),(.061,.035,.008),f,M['black'],.002)
        elif mode=='photocell':
            A.cyl('Light sensitive disc',(0,.88,.06),.073,.022,f,M['ceramic'])
            for i in range(7):A.box('Photoresistor interdigitated track',(-.04+i*.013,.88,.073),(.006,.10,.003),f,M['steel'],0)
        elif mode=='pressure':
            remove_bare_fixings()
            A.cyl('Pressure diaphragm',(0,.87,.028),.16,.015,f,M['steel']);helix('Pressure calibration spring',(0,.90,.075),.033,.11,6,.004,f,M['steel'])
            retainer=feature('gauge-bezel-retainers','Captive bezel screws follow the round pressure gauge perimeter.',part('mounting'))
            for x in (-.17,.17):
                for y in (.70,1.04):fixing((x,y,.125),retainer,.017,'cross')
        elif mode=='float':
            package(f,(-.25,.96,.08),(.11,.16,.05),3);A.box('Float pivot lever',(-.19,.84,.07),(.17,.03,.05),f,M['steel'],.005)
        elif mode=='temperature':
            A.box('Thermistor bead',(.30,.40,-.22),(.018,.025,.016),f,M['black'],.006)
        elif mode=='humidity':
            for i in range(6):A.box('Capacitive comb electrode',(-.054+i*.021,.57,.092),(.008,.082,.003),f,M['steel'],0)
        else:toroidal_winding(f,(0,.64,.30),.16,.02,16)
    elif model=='controller':
        f=feature('control-board','Control board with discrete input conditioning, timing/controller package and output isolation. Conceptual electronics.',part('electronics'))
        pcb(f,(0,.73,.03),(.56,.52),chips=2)
        f=feature('control-relay','Separate coil and changeover output contact stack, or thermal trip coupling on a manual-reset cut-out.',part('contacts'))
        if kind=='cutout':
            A.cyl('Thermal snap disc',(0,.72,.06),.11,.025,f,M['steel']);spring_contact(f,(0,.75,.09),.13)
        else:
            A.box('Relay bobbin',(.12,.58,.055),(.13,.16,.07),f,M['black'],.005);helix('Relay coil',(.12,.58,.055),.041,.13,12,.003,f,M['copper']);spring_contact(f,(-.14,.62,.08),.13)
    elif model=='heater':
        f=feature('heat-transfer-construction','Family-specific heating element, storage core or mat construction; heat transfer remains an educational block model.',part('heater'))
        if 'storage' in key:
            remove_parts({'heater'})
            for x in (-.34,0,.34):
                for y in (.38,.61,.84):A.box('Grooved refractory energy cell',(x,y,-.015),(.29,.20,.17),f,M['brick'],.008)
                tube('Sheathed storage element',[(x-.10,.31,.09),(x-.1,1.03,.09),(x+.1,1.03,.09),(x+.1,.31,.09)],.011,f,M['steel'])
            for x in (-.50,.50):A.box('Core insulation panel',(x,.67,0),(.035,.87,.28),f,M['ceramic'],.004)
        elif 'immersion' in key:
            ring('Immersion flange gasket',(0,.97,0),.30,.19,.035,f,M['rubber']).rotation_euler.x=math.pi/2
            helix('Immersion threaded boss',(0,.90,0),.32,.075,5,.008,f,M['brass'])
            A.cyl('Thermostat pocket sleeve',(0,.52,.04),.026,.78,f,M['brass'],False)
        else:
            for x in (-.52,-.26,0,.26,.52):A.box('Mat glass fibre backing',(x,.115,0),(.007,.004,.69),f,M['white'],0)
            A.box('Cold tail sealed splice',(.54,.14,.28),(.09,.027,.046),f,M['rubber'],.009)
        if 'mat' in key:
            f=feature('thermal-protection','The floor thermistor is sealed in a probe on the mat. Temperature limiting and disconnection are performed by the separate thermostat/control equipment, not a floating cut-out fitted to the mat.',part('sensing'))
            A.cyl('Sealed floor thermistor tip',(.21,.145,-.10),.018,.040,f,M['black'],False)
        else:
            f=feature('thermal-protection','Separate thermal sensor and manual-reset cut-out prevents uncontrolled heating.',part('safetycutout'))
            A.cyl('Thermal cut-out disc',(.29,1.05,.06),.047,.025,f,M['steel']);spring_contact(f,(.29,1.05,.08),.07)
    elif model=='appliance':
        remove_parts({'electronics','heater','pipe'} if kind!='cooker' else {'electronics','pipe'})
        f=feature('appliance-process-assembly','Representative physical process assembly with distinct heat, flow and mechanical paths; it is not a service drawing.',part('heater'))
        if kind=='shower':
            A.cyl('Copper heater can',(-.23,.82,.022),.12,.54,f,M['copper'],False)
            for y in (.56,1.08):ring('Heater can crimp',(-.23,y,.022),.12,.103,.02,f,M['brass']).rotation_euler.x=math.pi/2
            for x in (-.28,-.18):tube('Immersed shower element',[(x,.62,.02),(x,.98,.02)],.011,f,M['steel'])
            A.box('Flow stabiliser inlet',(.03,.51,.04),(.19,.14,.14),f,M['black'],.013);helix('Inlet solenoid coil',(.03,.53,.04),.052,.12,10,.004,f,M['copper'])
            tube('Water outlet',[(-.23,.54,.02),(-.23,.40,.025),(-.12,.36,.04)],.029,f,M['copper'])
        elif kind=='cooker':
            for y in (.40,.66):
                tube('Oven sheathed heating element',[(-.34,y,-.08),(-.34,y,.16),(.34,y,.16),(.34,y,-.08)],.015,f,M['steel'])
            for y in (.41,.54,.67):
                tube('Oven rack perimeter',[(-.37,y,-.18),(-.37,y,.21),(.37,y,.21),(.37,y,-.18),(-.37,y,-.18)],.006,f,M['steel'])
                for x in [ -.33+i*.06 for i in range(12)]:tube('Individual oven rack wire',[(x,y,-.18),(x,y,.21)],.004,f,M['steel'])
        elif kind=='heatpump':
            A.cyl('Hermetic compressor',(.28,.54,-.03),.12,.40,f,M['black'],False)
            for y in [ .38+i*.047 for i in range(15)]:A.box('Finned outdoor heat exchanger',(-.16,y,-.11),(.55,.011,.09),f,M['steel'],.001)
            tube('Refrigerant pipe',[(.28,.73,.04),(.27,1.1,.04),(-.31,1.1,.04),(-.31,.40,.04)],.013,f,M['copper'])
        else:
            for y in [ .46+i*.035 for i in range(13)]:A.box('Heat exchanger plate',(0,y,-.015),(.39,.013,.20),f,M['steel'],.002)
            A.box('Circulator block',(-.28,.39,.025),(.17,.22,.14),f,M['black'],.03)
            tube('Hydronic flow pipe',[(-.27,.17,.04),(-.27,.40,.04),(-.13,.58,.04),(0,1.04,.04),(.29,1.04,.04),(.29,.17,.04)],.026,f,M['copper'])
        f=feature('appliance-control','Separated control PCB, sensor and thermal cut-out. Electronic functions are conceptual.',part('electronics'))
        pcb(f,(.28,.88,.08),(.18,.37),chips=2);A.box('Overtemperature switch',(-.16,1.10,.07),(.13,.064,.053),f,M['ceramic'],.008)
    elif model=='valve':
        f=feature('valve-gearing','Synchronous actuator motor, reduction gears and spring return drive the valve spindle.',part('coil'))
        for x,r in ((-.13,.062),(.015,.080),(.14,.10)):
            gear(f,(x,.86,.13),r,18);A.cyl('Gear spindle',(x,.86,.09),.012,.10,f,M['steel'])
        helix('Actuator motor winding',(-.17,.96,.03),.041,.08,12,.003,f,M['copper'])
        spiral('Spring return',(.12,.86,.16),.024,.095,4,.003,f,M['steel'])
        f=feature('valve-end-switch','Cam-operated auxiliary switch indicates the open position; manual lever and spring return are distinct from electrical terminals.',part('contacts'))
        package(f,(.17,.99,.11),(.13,.08,.04),3);A.box('End switch leaf',(.1,.98,.135),(.17,.012,.027),f,M['silver'],.002)
        for x in (-.49,.49):
            nut=A.cyl('Compression union nut',(x,.42,0),.145,.072,f,M['brass'],vertices=6);nut.rotation_euler.y=math.pi/2
            bore=A.cyl('Union through bore',(x,.42,0),.084,.12,f,None);bore.rotation_euler.y=math.pi/2;A.boolean_difference(nut,bore)
            ring('Compression olive',(x,.42,0),.105,.081,.030,f,M['copper']).rotation_euler.y=math.pi/2
    elif model in ('motor','pump','fan'):
        if model in ('motor','pump') and (':motor' in key or model=='pump'):remove_bare_fixings()
        p=part('winding');f=feature('motor-bearing' if model!='fan' else 'fan-bearing-hub','Rolling bearing races, seal, shaft and laminated stator support the rotating assembly. Details are representative.',p)
        if model=='fan':
            for z in (-.035,.07):bearing(f,(0,.75,z),.055,.023)
        elif model=='pump':
            for x in (-.44,.23):bearing(f,(x,.64,-.02),.082,.030,axis='x')
        elif ':motor' in key:
            for x in (-.44,.23):bearing(f,(x,.64,-.02),.115,.043,axis='x')
            for x in [ -.43+i*.038 for i in range(16)]:
                ring('Stator steel lamination',(x,.64,-.02),.255,.195,.013,f,M['ferrite']).rotation_euler.y=math.pi/2
            cage=feature('motor-rotor-cage','Rotor copper bars and shorting end rings rotate with the existing shaft state while bearings and stator laminations remain fixed.',part('rotor'))
            for i in range(12):
                a=i*math.tau/12;A.box('Squirrel cage rotor bar',(-.12,.64+math.cos(a)*.17,-.02+math.sin(a)*.17),(.59,.018,.018),cage,M['copper'],.002)
            for x in (-.41,.17):ring('Rotor shorting end ring',(x,.64,-.02),.176,.147,.025,cage,M['copper']).rotation_euler.y=math.pi/2
            rotating(cage)
        else:bearing(f,(0,.70,.04),.076,.029)
        if model=='pump':
            # The original procedural volute was tagged as Rotor. It is a fixed
            # casing, so expose it as a cutaway housing while retaining the
            # actual moving impeller on the original shaft animation node.
            casing=part('body')
            for mesh in list(root.children_recursive):
                if mesh.type!='MESH' or not mesh.data.materials or any(p.get('detailId') for p in A.ancestors(mesh)):continue
                if next((p.get('partId') for p in A.ancestors(mesh) if p.get('partId')),'')!='rotor':continue
                shader=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF');color=shader.inputs['Base Color'].default_value
                if color[1]>color[0]*1.5 and color[1]>color[2]*1.2:
                    bpy.context.view_layer.update();world=mesh.matrix_world.copy();mesh.parent=casing;mesh.matrix_world=world
            f=feature('pump-impeller-seal','Centrifugal impeller and mechanical shaft seal sit inside the volute, separate from the motor.',part('rotor'))
            impeller=feature('pump-rotating-impeller','The impeller rotates on the existing motor shaft; the volute and mechanical seal remain stationary.',part('rotor'))
            A.cyl('Impeller backplate',(.46,.64,-.02),.20,.033,impeller,M['steel']).rotation_euler.y=math.pi/2
            for i in range(7):
                a=i*math.tau/7;o=A.box('Curved impeller blade',(.47,.64+math.cos(a)*.10,-.02+math.sin(a)*.10),(.035,.14,.04),impeller,M['steel'],.015);o.rotation_euler.x=-a+.5
            ring('Mechanical shaft seal',(.29,.64,-.02),.067,.030,.044,f,M['ceramic']).rotation_euler.y=math.pi/2
            rotating(impeller)
            feet=feature('pump-foot-fixings','Threaded mounting bolts are seated on the actual motor foot.',part('mounting'))
            for x in (-.36,.10):fixing((x,.31,.24),feet,.024,'hex')
        elif model=='fan':
            f=feature('fan-control-board','Timing/humidity interface and isolated switching board behind the removable fascia.',part('electronics'));pcb(f,(.29,.75,-.02),(.15,.40),chips=2)
        else:
            f=feature('motor-application-mechanism','Application-specific transmission or induction motor end-ring construction.',part('electronics'))
            if 'gate' in key:
                gear(f,(-.10,.60,.18),.16,28);helix('Worm reduction shaft',(.12,.67,.15),.03,.26,8,.006,f,M['steel'],axis='x')
            elif 'shutter' in key:
                for x in (-.32,-.19,-.06):gear(f,(x,.70,.10),.095,20)
                A.box('Travel limit microswitch',(-.4,.94,.13),(.10,.075,.047),f,M['black'],.006)
            elif 'compressor' in key:
                A.cyl('Reciprocating piston',(.19,.94,.08),.078,.11,f,M['steel'],False);A.box('Connecting rod',(.19,.80,.08),(.034,.21,.024),f,M['steel'],.006)
                for y in (.99,1.04):ring('Cylinder piston ring',(.19,y,.08),.079,.071,.007,f,M['steel']).rotation_euler.x=math.pi/2
            else:
                A.box('Motor terminal link strap',(-.08,1.03,.13),(.27,.019,.008),f,M['brass'],.002)
                for x in (-.36,.10):fixing((x,.31,.24),part('mounting'),.025,'hex')
    elif model in ('contactor','overload'):
        p=part('electronics')
        if model=='overload':
            f=feature('three-bimetal-trips','Three independent heated bimetal elements act on a common overload trip mechanism.',p)
            for x in (-.22,0,.22):
                A.box('Bimetal sensing strip',(x,.72,.04),(.043,.40,.012),f,M['copper'],.002)
                helix('Bimetal heater',(x,.73,.035),.027,.27,11,.0028,f,M['steel'])
            f=feature('compensated-trip-bar','Common trip bar includes ambient compensation and a manual reset linkage.',part('contacts'))
            A.box('Common trip slider',(0,.91,.06),(.61,.043,.06),f,M['black'],.004);A.box('Compensation bimetal',(.28,.64,.06),(.034,.28,.014),f,M['copper'],.002)
        else:
            f=feature('double-break-contacts','Three segregated double-break main poles with silver-alloy contact faces and arc partitions.',p)
            for x in (-.22,0,.22):
                for y in (.56,.99):
                    A.box('Fixed main contact',(x,y,.10),(.066,.12,.025),f,M['copper'],.003);A.cyl('Silver main contact tip',(x,y,.116),.025,.010,f,M['silver'])
                for y in (.52,1.04):A.box('Arc containment partition',(x,y,.04),(.12,.018,.16),f,M['ceramic'],.002)
            f=feature('laminated-magnetic-core','Laminated E-shaped magnet, shading ring, wound bobbin and spring-loaded armature.',part('coil'))
            for z in [ -.07+i*.016 for i in range(10)]:
                for x in (-.15,.15):A.box('E core lamination leg',(x,.59,z),(.07,.27,.010),f,M['ferrite'],.001)
                A.box('E core lamination web',(0,.49,z),(.37,.047,.010),f,M['ferrite'],.001)
            helix('Armature return spring',(.27,.66,.04),.018,.13,8,.003,f,M['steel'])
            ring('AC shading ring',(-.15,.73,.04),.045,.030,.008,f,M['copper'])
    elif model in ('vfd','plc','inverter'):
        remove_parts({'electronics','converter'})
        p=part('electronics')
        if model=='plc':
            f=feature('processor-board','CPU/controller PCB with crystal, memory and segregated input conditioning. Safety processing remains explicitly abstract.',p)
            pcb(f,(0,.79,.045),(.70,.66),chips=4)
            A.box('Quartz oscillator',(-.2,.97,.075),(.09,.036,.025),f,M['steel'],.006)
            f=feature('isolated-io-bank','Separate optocoupler channels and removable keyed terminal connector sockets.',p)
            channels=6 if kind=='plc' else 4
            for i in range(channels):
                x=-.26+i*.10;package(f,(x,.51,.073),(.065,.09,.022),4)
                A.box('Keyed removable connector',(x,.41,.038),(.078,.075,.09),f,M['green' if kind=='plc' else 'yellow'] if 'yellow' in M else M['white'],.005)
            if kind=='safetyRelay':
                for x in (-.19,.19):A.box('Force guided relay module',(x,.72,.085),(.20,.24,.10),f,M['ceramic'],.008)
        else:
            f=feature('rectifier-dc-link-inverter' if model=='vfd' else 'energy-converter','Rectifier, capacitive DC link and semiconductor bridge are distinct conceptual blocks; switching waveforms and firmware are abstract.',p)
            pcb(f,(0,.80,.035),(.71,.76),chips=2)
            if kind=='battery':
                for x in (-.26,-.087,.087,.26):
                    for y in (.39,.55):A.box('Prismatic cell module',(x,y,-.01),(.145,.13,.10),f,M['blue'],.008)
                    A.box('Cell interconnect strap',(x,.47,.064),(.10,.10,.01),f,M['copper'],.002)
            else:
                for x in (-.23,0,.23):
                    A.cyl('DC-link electrolytic capacitor',(x,.54,.085),.067,.14,f,M['black'],False)
                    A.cyl('Capacitor aluminium vent',(x,.62,.085),.058,.005,f,M['steel'],False)
                for x in (-.24,0,.24):package(f,(x,.87,.095),(.17,.21,.037),6)
            f=feature('thermal-power-module' if model=='vfd' else 'energy-isolation','Insulated power modules transfer heat through a thermal interface to a finned heatsink; battery modules include a disconnect and BMS.',p)
            A.box('Thermal power baseplate',(0,1.0,.053),(.71,.24,.017),f,M['steel'],.004)
            for x in (-.29,.29):fixing((x,1.02,.084),f,.021,'cross')
            if kind=='battery':ceramic_fuse(f,(0,1.03,.083),.28,.040)
    elif model=='alarm':
        f=feature('alarm-transducer','Optical smoke chamber and piezo sounder, or mechanical chime resonator, according to the equipment family.',part('sensingcore'))
        if kind=='chime':
            for x in (-.28,.28):
                A.box('Tuned chime bar',(x,.75,.105),(.067,.53,.02),f,M['steel'],.003)
                for y in (.59,.91):ring('Rubber resonator support',(x,y,.09),.018,.008,.012,f,M['rubber'])
        else:
            A.cyl('Optical chamber base',(.14,.85,.12),.13,.045,f,M['black'])
            for i in range(16):
                a=i*math.tau/16;o=A.box('Light baffle labyrinth',(.14+math.sin(a)*.115,.85+math.cos(a)*.115,.145),(.024,.052,.052),f,M['black'],.003);o.rotation_euler.z=-a+.3
            A.cyl('Piezo sounder',(-.15,.82,.10),.11,.012,f,M['brass'])
        f=feature('alarm-backup-or-solenoid','Separate backup cell and charging contacts, or wound chime solenoid and return spring.',part('electronics'))
        if kind=='chime':helix('Chime plunger return',(0,.74,.1),.025,.26,10,.003,f,M['steel'])
        else:
            pcb(f,(0,.72,.055),(.49,.36),chips=2);A.box('Backup battery clip',(-.23,.53,.16),(.11,.036,.028),f,M['brass'],.003)
    elif model=='charger':
        f=feature('ev-double-pole-contactor','Separate normally-open power contactor switches the charging feed; its geometry does not imply a specific EV safety certification.',part('contacts'))
        for x in (-.10,.10):spring_contact(f,(x,.55,.085),.18)
        A.box('Contactor insulated pole barrier',(0,.55,.085),(.025,.25,.15),f,M['white'],.004)
        f=feature('ev-residual-current-sensor','Core-balance sensor, controller PCB and separated low-voltage pilot interface are conceptual blocks.',part('electronics'))
        toroidal_winding(f,(0,.40,.085),.085,.026,16);pcb(f,(0,.94,.035),(.46,.39),chips=2)
    elif model=='transformer':
        f=feature('converter-specific-core','Line-frequency transformer uses stacked E/I laminations. Driver/DC supply instead uses a switched ferrite transformer and rectifier board.',part('winding'))
        if kind=='transformer':
            for z in [ -.13+i*.022 for i in range(13)]:
                for x in (-.28,.28):A.box('E/I laminated core leg',(x,.67,z),(.145,.69,.013),f,M['ferrite'],.001)
                A.box('E/I lamination bridge',(0,1.02,z),(.69,.13,.013),f,M['ferrite'],.001)
            for x in (-.14,.14):helix('Transformer insulated winding',(x,.68,0),.15,.47,22,.0045,f,M['copper'])
        else:
            remove_bare_fixings()
            remove_parts({'winding','body','cover'})
            body=part('body');A.box('Electronic converter chassis',(0,.69,-.02),(.85,.74,.25),body,M['white'],.025)
            cov=A.semantic('cover',frame,(0,.69,.13),{'restPosition':[0,.69,.13],'restRotation':[0,0,0]});A.box('Removable converter lid',(0,0,0),(.84,.73,.026),cov,M['white'],.018)
            pcb(f,(0,.69,.065),(.70,.56),chips=2)
            for x in (-.14,.14):A.box('Ferrite E-core half',(x,.73,.11),(.10,.23,.09),f,M['ferrite'],.003)
            helix('High frequency transformer coil',(0,.73,.11),.078,.17,14,.003,f,M['copper'])
            A.cyl('Input smoothing capacitor',(-.22,.51,.09),.052,.14,f,M['black'],False)
            A.box('Input common-mode choke',(.22,.89,.09),(.14,.11,.08),f,M['ferrite'],.005)
        f=feature('converter-isolation-barrier','Physical primary/secondary creepage slot and insulating barrier are illustrative, without an approval claim.',part('electronics'))
        A.box('Primary secondary barrier',(0,.69,.09),(.017,.51,.14),f,M['ceramic'],.003)
    elif model=='cable':
        # Replace the former solid copper tip with individual strands, so the
        # fine strands are actual visible construction rather than hidden noise.
        for mesh in list(root.children_recursive):
            if mesh.type!='MESH' or not mesh.data.materials or not any(p.get('partId')=='cable' for p in A.ancestors(mesh)):continue
            shader=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF');color=shader.inputs['Base Color'].default_value
            if shader.inputs['Metallic'].default_value>.5 and color[0]>.3 and color[1]<.3 and color[2]<.15:bpy.data.objects.remove(mesh,do_unlink=True)
        f=feature('stranded-copper-cores','Each exposed conductor is made from individual copper strands, with distinct core insulation and a protective conductor stripe.',part('cable'))
        count=5 if 'five' in key else 3
        for i in range(count):
            a=i*math.tau/count;y=.60+math.cos(a)*.09;z=math.sin(a)*.09
            for j in range(7):
                b=j*math.tau/6;dy=0 if j==6 else math.cos(b)*.013;dz=0 if j==6 else math.sin(b)*.013
                o=A.cyl('Individual stranded copper wire',(.565,y+dy,z+dz),.006,.16,f,M['copper'],vertices=12);o.rotation_euler.y=math.pi/2
        f=feature('sheath-cutaway','Outer sheath, bedding and filler remain physically distinct in the stripped cable section.',part('body'))
        ring('Cutaway cable outer sheath',(.02,.60,0),.18,.163,.017,f,M['rubber']).rotation_euler.y=math.pi/2
        ring('Cable bedding ring',(.04,.60,0),.163,.133,.016,f,M['white']).rotation_euler.y=math.pi/2
    elif model=='conduit':
        remove_bare_fixings()
        f=feature('cable-management-construction','Slotted duct includes lid retention lips; conduit glands include compression seal, locknut and threaded body.',part('gland'))
        if 'trunking' in key:
            for z in (-.16,.16):A.box('Lid snap retention lip',(0,.42,z),(1.16,.017,.03),f,M['white'],.003)
            A.box('Cable divider',(0,.28,0),(1.10,.09,.012),f,M['white'],.002)
        else:
            gland=A.empty('Compression gland assembly',f,(.30,1.13,0));gland.rotation_euler.x=math.pi/2
            for z,r,length in ((-.08,.11,.05),(0,.095,.10),(.073,.115,.06)):
                A.cyl('Gland body or hex nut',(0,0,z),r,length,gland,M['black'],vertices=6 if z!=0 else 48)
            ring('Compression rubber insert',(0,0,.047),.078,.047,.052,gland,M['rubber']);helix('Metric gland thread',(0,0,0),.093,.08,6,.003,gland,M['black'],axis='z')
        f=feature('cable-management-fixing','Mounting saddles/duct slots have captive hardware independent of conductors.',part('mounting'))
        if 'trunking' in key:
            for x in (-.37,.37):fixing((x,.24,0),f,.019,'slot').rotation_euler.x=-math.pi/2
        else:
            for x in (-.42,-.05):fixing((x,.32,-.098),f,.019,'slot')
    elif model=='instrument':
        f=feature('instrument-sensing','Current clamp has split magnetic jaws; multimeter has a calibrated current shunt and high impedance voltage divider, shown conceptually.',part('electronics'))
        if kind=='clamp':
            toroidal_winding(f,(0,1.02,0),.255,.039,26)
            A.box('Split core insulating gap',(0,1.28,0),(.032,.06,.15),f,M['ceramic'],.004)
        else:
            pcb(f,(0,.72,.035),(.52,.80),chips=3)
            A.box('Low value current shunt',(0,.40,.071),(.27,.04,.036),f,M['steel'],.003)
            for y in (.67,.78,.89):A.box('Voltage divider resistor',(-.20,y,.072),(.048,.068,.024),f,M['ceramic'],.003)
        f=feature('instrument-input-protection','Separate high-breaking-capacity input fuse, surge protection and insulating barriers. Instrument safety ratings are not simulated.',part('electronics'))
        ceramic_fuse(f,(.17,.63,.075),.27,.031)
        A.cyl('Input protection MOV',(-.13,.45,.07),.052,.014,f,M['blue'])
        A.box('Input insulation partition',(0,.50,.04),(.014,.38,.11),f,M['white'],.002)
        for x in (-.24,.24):fixing((x,1.20,-.08),part('mounting'),.018,'cross')
    else:raise ValueError('Uncovered equipment family '+model)
    if model in ('supply','meter','panel','protection','controller','appliance','vfd','plc','inverter','charger','transformer','instrument'):
        # Place sealing strips and captive screws from the actual cover bounds,
        # not arbitrary registry dimensions. Round luminaires and wall plates
        # already have their own purpose-built retaining hardware.
        for cover in [o for o in root.children_recursive if o.get('partId')=='cover' and o.get('restPosition')]:
            bpy.context.view_layer.update();inverse=cover.matrix_world.inverted();candidates=[]
            for mesh in cover.children_recursive:
                if mesh.type!='MESH' or any(p.get('detailId') for p in A.ancestors(mesh)):continue
                if next((p.get('partId') for p in A.ancestors(mesh) if p.get('partId')),'')!='cover':continue
                coords=[inverse@mesh.matrix_world@Vector(corner) for corner in mesh.bound_box]
                low=Vector(tuple(min(p[i] for p in coords) for i in range(3)));high=Vector(tuple(max(p[i] for p in coords) for i in range(3)))
                if high.x-low.x>.35 and high.y-low.y>.35:candidates.append(((high.x-low.x)*(high.y-low.y),low,high))
            if not candidates:continue
            _,low,high=max(candidates,key=lambda a:a[0]);w=high.x-low.x;h=high.y-low.y;cx=(low.x+high.x)/2;cy=(low.y+high.y)/2
            f=feature('enclosure-gasket-and-fixings','A retained elastomer perimeter seal and captive recessed fixings fit the removable enclosure cover. Seal geometry is illustrative, without an ingress-protection rating.',cover)
            for x in (low.x+.01,high.x-.01):A.box('Perimeter sealing gasket',(x,cy,low.z-.006),(.014,h-.025,.012),f,M['rubber'],.003)
            for y in (low.y+.01,high.y-.01):A.box('Perimeter sealing gasket',(cx,y,low.z-.006),(w-.025,.014,.012),f,M['rubber'],.003)
            for x in (low.x+w*.09,high.x-w*.09):
                for y in (low.y+h*.09,high.y-h*.09):fixing((x,y,high.z+.008),f,min(.018,w*.022),'cross',seal=model in ('appliance','charger'))
    missing=set(FAMILY_REQUIREMENTS[model])-set(features)
    if missing:raise ValueError(str(missing))
    # Earlier recipes include bare decorative screw/rail meshes and a few
    # authored mechanisms outside their declared selectable parts. Assign them
    # a valid existing owner without changing world-space geometry or motion.
    for obj in root.children_recursive:
        if obj.get('partId') and obj['partId'] not in declared:obj['partId']=canonical(str(obj['partId']))
    bpy.context.view_layer.update()
    unowned=[obj for obj in root.children_recursive if obj.type=='MESH' and not any(p.get('partId') or p.get('terminalId') for p in A.ancestors(obj))]
    if unowned:
        mounting=A.semantic('mounting',root);bpy.context.view_layer.update()
        for obj in unowned:
            if any(p.get('animation') for p in A.ancestors(obj)):raise ValueError('Unowned animated mesh '+obj.name)
            world=obj.matrix_world.copy();obj.parent=mounting;obj.matrix_world=world
    root['detailRevision']=REVISION;root['detailFamily']=model;root['detailFeatures']=features
    return features

def tube(name,points,radius,parent,mat):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=2;curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,coord in zip(spline.points,points):point.co=(*coord,1)
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.parent=parent;curve.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
    return obj

def helix(name,p,radius,length,turns,wire,parent,mat,axis='y'):
    points=[]
    for i in range(turns*16+1):
        t=i/(turns*16);a=t*turns*math.tau;xyz=(radius*math.cos(a),length*(t-.5),radius*math.sin(a))
        if axis=='z':xyz=(xyz[0],xyz[2],xyz[1])
        if axis=='x':xyz=(xyz[1],xyz[0],xyz[2])
        points.append(tuple(x+y for x,y in zip(p,xyz)))
    return tube(name,points,wire,parent,mat)

def spiral(name,p,inner,outer,turns,wire,parent,mat):
    points=[]
    for i in range(turns*24+1):
        t=i/(turns*24);a=t*turns*math.tau;r=inner+(outer-inner)*t;points.append((p[0]+math.cos(a)*r,p[1]+math.sin(a)*r,p[2]))
    return tube(name,points,wire,parent,mat)

def ring(name,p,outer,inner,depth,parent,mat,segments=40):
    verts=[];faces=[]
    for z in (-depth/2,depth/2):
        for r in (outer,inner):
            for i in range(segments):a=i*math.tau/segments;verts.append((r*math.cos(a),r*math.sin(a),z))
    for i in range(segments):
        n=(i+1)%segments
        faces.extend([(i,n,2*segments+n,2*segments+i),(segments+n,segments+i,3*segments+i,3*segments+n),(i,segments+i,segments+n,n),(2*segments+i,2*segments+n,3*segments+n,3*segments+i)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.location=p;return A.setmesh(obj,parent,mat)

def fixing(p,parent,radius=.024,head='cross',washer=True,shaft=.065,seal=False):
    assembly=A.empty('fixing:'+head,parent,p,data={'detailId':'fixing-'+head,'detailPurpose':'Recessed head, helical threaded shank and seating washer retain this assembly.'})
    headobj=A.cyl('Recessed screw head',(0,0,0),radius,.016,assembly,M['zinc'],vertices=6 if head=='hex' else 32)
    if head in ('cross','slot'):
        for size in ((radius*1.5,.004,.013),(.004,radius*1.5,.013)) if head=='cross' else ((radius*1.5,.005,.013),):
            A.boolean_difference(headobj,A.box('Actual screwdriver recess',(0,0,.008),size,assembly,None,0))
    A.cyl('Fastener shank',(0,0,-shaft/2),radius*.42,shaft,assembly,M['zinc'],vertices=16)
    helix('True helical screw thread',(0,0,-shaft/2),radius*.44,shaft*.8,6,radius*.08,assembly,M['zinc'],axis='z')
    if washer:ring('Flat seating washer',(0,0,-.012),radius*1.27,radius*.5,.005,assembly,M['steel'],24)
    if seal:ring('Elastomer sealing washer',(0,0,-.018),radius*1.32,radius*.5,.007,assembly,M['rubber'],24)
    return assembly

def package(parent,p,size,pins=8):
    A.box('IC or isolated interface package',p,size,parent,M['black'],.004)
    for i in range(max(2,pins//2)):
        y=p[1]-size[1]*.4+i*size[1]*.8/max(1,pins//2-1)
        for side in (-1,1):A.box('Individual package lead',(p[0]+side*(size[0]/2+.006),y,p[2]),(.013,.008,.006),parent,M['steel'],.001)

def pcb(parent,p,size,chips=3):
    A.box('FR4 control PCB',p,(*size,.014),parent,M['pcb'],.003)
    for x in (-size[0]*.40,size[0]*.40):
        for y in (-size[1]*.40,size[1]*.40):
            ring('Plated PCB mounting eye',(p[0]+x,p[1]+y,p[2]+.01),.014,.006,.003,parent,M['brass'],16)
    for i in range(chips):package(parent,(p[0]+(i-(chips-1)/2)*size[0]*.25,p[1]+size[1]*.15,p[2]+.025),(size[0]*.16,size[1]*.18,.023),8)
    for i in range(5):
        x=p[0]-size[0]*.35+i*size[0]*.17;A.box('Copper PCB trace',(x,p[1]-size[1]*.14,p[2]+.008),(.006,size[1]*.30,.001),parent,M['copper'],0)
        A.box('SMD resistor',(x,p[1]-size[1]*.2,p[2]+.018),(.019,.035,.009),parent,M['black'],.002)

def spring_contact(parent,p,width):
    for side in (-1,1):
        tube('Formed contact spring',[(p[0]+side*width*.30,p[1]-width*.4,p[2]-.03),(p[0]+side*width*.24,p[1],p[2]+.008),(p[0]+side*width*.12,p[1]+width*.25,p[2]+.024)],.007,parent,M['brass'])
        A.cyl('Silver alloy contact face',(p[0]+side*width*.13,p[1]+width*.24,p[2]+.03),.012,.007,parent,M['silver'],vertices=24)

def ceramic_fuse(parent,p,length,radius):
    A.cyl('Ceramic HRC fuse body',p,radius,length,parent,M['ceramic'],False)
    for side in (-1,1):A.cyl('Fuse metal end cap',(p[0],p[1]+side*length*.43,p[2]),radius*1.08,length*.15,parent,M['steel'],False)
    tube('Conceptual fuse element',[(p[0],p[1]-length*.4,p[2]+radius*.9),(p[0]+radius*.35,p[1],p[2]+radius*.9),(p[0],p[1]+length*.4,p[2]+radius*.9)],.003,parent,M['silver'])

def toroidal_winding(parent,p,radius,tube_radius,turns):
    A.torus('Toroidal ferrite core',p,radius,tube_radius,parent,M['ferrite'])
    for i in range(turns):
        a=i*math.tau/turns;points=[]
        for j in range(13):
            b=j*math.tau/12;r=radius+math.cos(b)*tube_radius*1.06;points.append((p[0]+math.cos(a)*r,p[1]+math.sin(a)*r,p[2]+math.sin(b)*tube_radius*1.06))
        tube('Individual toroid winding turn',points,.003,parent,M['copper'])

def gear(parent,p,radius,teeth):
    A.cyl('Reduction gear hub',p,radius*.88,.028,parent,M['brass'])
    for i in range(teeth):
        a=i*math.tau/teeth;obj=A.box('Individual gear tooth',(p[0]+math.sin(a)*radius,p[1]+math.cos(a)*radius,p[2]),(radius*.15,radius*.20,.028),parent,M['brass'],.002);obj.rotation_euler.z=-a
    ring('Gear spindle bore',p,radius*.3,radius*.14,.034,parent,M['steel'],24)

def bearing(parent,p,radius,width,axis='z'):
    assembly=A.empty('Rolling bearing',parent,p)
    if axis=='x':assembly.rotation_euler.y=math.pi/2
    ring('Bearing outer race',(0,0,0),radius,radius*.78,width,assembly,M['steel'])
    ring('Bearing inner race',(0,0,0),radius*.55,radius*.30,width,assembly,M['steel'])
    for i in range(9):
        a=i*math.tau/9;bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=radius*.12,location=(math.sin(a)*radius*.66,math.cos(a)*radius*.66,0));A.setmesh(bpy.context.object,assembly,M['steel']).name='Individual bearing ball'
    ring('Bearing retaining cage',(0,0,width*.35),radius*.76,radius*.58,.005,assembly,M['brass'])
