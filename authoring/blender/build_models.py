"""Original Irish Electrical Lab assets, Blender 4.5 LTS.

Reconstruct the original typed mesh recipes, refine normals/materials and merge
static meshes by semantic ownership. The initial switch, rose and bulb fixture
are rebuilt here as detailed Blender forms. Electrical IDs and rear ports remain
the recipe's authoritative shared-layout coordinates. Run with --background.
"""
import bpy, bmesh, json, math, sys, argparse
from types import SimpleNamespace
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from detail_library import enrich, REVISION, FAMILY_REQUIREMENTS
from png_metadata import strip_text_metadata

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
ASSETS=ROOT/'lab/public/models'
SOURCES=HERE/'models'
PREVIEWS=ROOT/'verification/blender'
for p in (ASSETS,SOURCES,PREVIEWS): p.mkdir(parents=True,exist_ok=True)

def empty(name,parent=None,position=(0,0,0),scale=(1,1,1),data=None):
    obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj)
    obj.parent=parent;obj.location=position;obj.scale=scale
    for k,v in (data or {}).items():
        if isinstance(v,(str,float,int,bool,list)): obj[k]=v
    return obj

def material(name,color,metal=0,rough=.4,alpha=1):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color[:3],1)
    shader.inputs['Metallic'].default_value=metal
    shader.inputs['Roughness'].default_value=rough
    shader.inputs['Coat Weight'].default_value=.15 if metal<.5 else .06
    shader.inputs['Coat Roughness'].default_value=.25
    shader.inputs['Alpha'].default_value=alpha
    if alpha<1:mat.surface_render_method='DITHERED'
    mat.diffuse_color=(*color[:3],alpha)
    return mat

def setmesh(obj,parent,mat):
    obj.parent=parent
    if mat:obj.data.materials.append(mat)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    return obj

def box(name,p,s,parent,mat,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);obj=bpy.context.object;obj.name=name;obj.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    setmesh(obj,parent,mat)
    if bevel:
        modifier=obj.modifiers.new('Manufactured edge radius','BEVEL');modifier.width=min(bevel,min(s)/3);modifier.segments=3
        modifier=obj.modifiers.new('Weighted manufactured normals','WEIGHTED_NORMAL');modifier.keep_sharp=True
    return obj

def cyl(name,p,radius,length,parent,mat,front=True,vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=length,location=p)
    obj=bpy.context.object;obj.name=name
    if not front:obj.rotation_euler[0]=math.pi/2
    setmesh(obj,parent,mat)
    modifier=obj.modifiers.new('Machined rim','BEVEL');modifier.width=min(.004,length/4);modifier.segments=2
    return obj

def torus(name,p,radius,tube,parent,mat,front=True):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tube,major_segments=48,minor_segments=8,location=p)
    obj=bpy.context.object;obj.name=name
    if not front:obj.rotation_euler[0]=math.pi/2
    return setmesh(obj,parent,mat)

def boolean_difference(obj,cutter):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Real recessed aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)

def label(text,p,parent,mat,size=.047,rear=False):
    curve=bpy.data.curves.new('Moulded marking','FONT');curve.body=text;curve.size=size;curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.00045;curve.bevel_depth=.00015
    obj=bpy.data.objects.new('mark:'+text,curve);bpy.context.collection.objects.link(obj);obj.parent=parent;obj.location=p
    if rear:obj.rotation_euler[1]=math.pi
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
    return obj

def screw(p,parent,metal,dark,radius=.029):
    head=cyl('Machined fixing screw',p,radius,.018,parent,metal)
    for horizontal in (True,False):
        s=(radius*1.5,.007,.017) if horizontal else (.007,radius*1.5,.017)
        cutter=box('Crosshead recess',(p[0],p[1],p[2]+.009),s,parent,None,0)
        boolean_difference(head,cutter)
    cyl('Fixing shank',(p[0],p[1],p[2]-.032),radius*.45,.07,parent,metal)
    for i in range(5):torus('Fixing thread',(p[0],p[1],p[2]-.014-i*.01),radius*.46,.0024,parent,metal)
    return head

def lathe(name,profile,parent,mat,position=(0,0,0),segments=64):
    # Smooth the vertical pear profile as well as its circumference. Sparse
    # linear rings caused visibly faceted lobes in the original hero bulb.
    curved=[]
    for index in range(len(profile)-1):
        p0=Vector(profile[max(0,index-1)]);p1=Vector(profile[index]);p2=Vector(profile[index+1]);p3=Vector(profile[min(len(profile)-1,index+2)])
        for step in range(6):
            t=step/6;point=(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)*.5
            curved.append((max(0,point.x),point.y))
    curved.append(profile[-1]);profile=curved
    verts=[];faces=[]
    for radius,y in profile:
        for i in range(segments):
            a=i*2*math.pi/segments;verts.append((radius*math.cos(a),y,radius*math.sin(a)))
    for row in range(len(profile)-1):
        for i in range(segments):
            a=row*segments+i;b=row*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.location=position;return setmesh(obj,parent,mat)

def semantic(name,parent,position=(0,0,0),data=None):return empty('part:'+name,parent,position,data={'partId':name,**(data or {})})

def reconstruct(recipe):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    root=empty('Electrical Lab '+recipe['key']);root.rotation_euler[0]=math.pi/2
    mats={};geometries={}
    for key,value in recipe['materials'].items():
        color=value['color'];metal=value['metalness'];alpha=value['opacity'] if value['transparent'] else 1
        mats[key]=material('Original '+key[:8],color,metal,.27 if metal>.5 else .37,alpha)
        emission=value.get('emissive',[0,0,0]);shader=mats[key].node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Color'].default_value=(*emission,1)
        shader.inputs['Emission Strength'].default_value=value.get('emissiveIntensity',0)
    def visit(node,parent,part=''):
        data=node.get('data',{});part=data.get('partId',part)
        geometry=node.get('geometry')
        if geometry:
            cache=(geometry,node.get('material'))
            if cache not in geometries:
                source=recipe['geometries'][geometry];coords=source['position'];verts=[coords[i:i+3] for i in range(0,len(coords),3)];indices=source['index'];faces=[indices[i:i+3] for i in range(0,len(indices),3)]
                mesh=bpy.data.meshes.new('Recipe mesh');mesh.from_pydata(verts,[],faces);mesh.update()
                bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
                for polygon in mesh.polygons:polygon.use_smooth=True
                mat=mats[node['material']]
                if part in ('body','cover') and recipe['materials'][node['material']]['opacity']<.4:
                    mat=material('Opaque moulded enclosure',(.79,.82,.79),0,.36)
                mesh.materials.append(mat);geometries[cache]=mesh
            obj=bpy.data.objects.new(node['name'],geometries[cache]);bpy.context.collection.objects.link(obj);obj.parent=parent
        else:obj=empty(node['name'],parent)
        obj.location=data.get('restPosition',node['position']);obj.rotation_euler=data.get('restRotation',node['rotation']);obj.scale=node['scale']
        for k,v in data.items():
            if isinstance(v,(str,float,int,bool,list)):obj[k]=v
        if geometry:
            # A real manufacturing radius on formerly sharp simple housings;
            # coils, wire tubes and already rounded/extruded shapes stay intact.
            source=recipe['geometries'][geometry]
            if len(source['position'])<=72 and part in ('body','cover','mounting'):
                mod=obj.modifiers.new('Small manufactured bevel','BEVEL');mod.width=.004;mod.segments=2
            if len(obj.data.polygons)<300:
                mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
        for child in node.get('children',[]):visit(child,obj,part)
    for node in recipe['nodes']:visit(node,root)
    return root

def detach_body(root):
    # Keep the original, once-only authoritative terminals/carriers. Rebuild the
    # first study fixtures in Blender, including actual seams and moving parts.
    keep=[obj for obj in root.children_recursive if obj.get('partId')=='terminals' and not any(p.get('partId')=='terminals' for p in ancestors(obj))]
    for obj in keep:
        world=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=world
    for obj in list(root.children):
        if obj in keep:continue
        for child in list(obj.children_recursive)[::-1]:bpy.data.objects.remove(child,do_unlink=True)
        bpy.data.objects.remove(obj,do_unlink=True)

def ancestors(obj):
    while obj.parent:obj=obj.parent;yield obj

def authored_first_fixture(recipe,root):
    component=recipe['component'];kind=component['type']
    if not (recipe['galleryKey'] in ('switch:single-rocker','rose:default','lamp:bulb')):return
    bpy.context.view_layer.update();detach_body(root)
    sx,sy,sz=recipe['definition']['size'][0]/1.3,recipe['definition']['size'][1]/1.45,recipe['definition']['size'][2]/.85
    bodyframe=empty('Authored Blender fixture',root,scale=(sx,sy,sz))
    white=material('Satin moulded white plastic',(.82,.84,.81),0,.3);black=material('Mechanism thermoplastic',(.025,.034,.04),0,.44)
    steel=material('Brushed nickel fixings',(.52,.58,.61),.88,.24);brass=material('Terminal contact brass',(.57,.35,.11),.86,.24);grey=material('Moulded recess',(.22,.27,.28),0,.5)
    dark=material('Moulded legend',(.13,.18,.18),0,.6)
    # Replace the generic full rectangular carrier with a shaped module around
    # the immutable rear clamps. Installer clamps themselves are kept once.
    terminal_root=next(obj for obj in root.children_recursive if obj.get('partId')=='terminals')
    for obj in list(terminal_root.children_recursive)[::-1]:
        if obj.type=='MESH' and not any(p.get('terminalId') for p in ancestors(obj)):
            bpy.data.objects.remove(obj,do_unlink=True)
    anchors=[terminal['anchor'] for terminal in recipe['terminals']]
    midpoint=sum(a[1] for a in anchors)/len(anchors)+.039
    rear=min(a[2] for a in anchors)
    if kind=='switch':
        box('Shaped rear switch mechanism',(0,midpoint,rear+.135),(.315,.68*sy,.19),terminal_root,black,.045)
        for anchor in anchors:box('Moulded connection shoulder',(anchor[0],anchor[1]+.039,anchor[2]+.083),(.175,.147,.052),terminal_root,black,.025)
    else:
        support=cyl('Circular integrated rear connection pod',(0,midpoint,rear+.10),.26 if kind=='lamp' else .322,.12,terminal_root,white)
        support.scale.y=.85 if kind=='lamp' else .55
        for anchor in anchors:box('Rounded connection seat',(anchor[0],anchor[1]+.039,anchor[2]+.075),(.155,.135,.055),terminal_root,white,.024)
    if kind=='switch':
        body=semantic('body',bodyframe)
        back=box('Pressed metal back-box',(0,.7,-.25),(.91,.94,.045),body,steel,.018)
        aperture=box('Mechanism access aperture',(0,.7,-.25),(.43,.79,.15),body,None,.025);boolean_difference(back,aperture)
        knockout=cyl('Rear cable knockout',(0,.41,-.25),.11,.1,body,None);boolean_difference(back,knockout)
        for x in (-.43,.43):box('Back-box side',(x,.7,-.09),(.045,.94,.30),body,steel,.01)
        for y in (.25,1.15):box('Back-box flange',(0,y,-.09),(.90,.045,.30),body,steel,.01)
        for x in (-.4,.4):box('Tapped faceplate lug',(x,.7,.055),(.10,.16,.037),body,steel,.012)
        contacts=semantic('contacts',bodyframe)
        box('Rear contact carrier',(0,.70,-.06),(.49,.68,.23),contacts,black,.04)
        for x,y in ((-.15,.84),(.15,.55)):box('Fixed contact',(x,y,.073),(.06,.13,.032),contacts,brass,.003)
        leaf=empty('motion:contact-leaf',contacts,(0,.7,.073),data={'animation':'contact','axis':'z','onAngle':-.12,'offAngle':.24})
        box('Spring switching blade',(0,0,0),(.36,.026,.025),leaf,brass,.003)
        cyl('Rocker bearing',(0,.7,.08),.04,.11,contacts,steel)
        cover=semantic('cover',bodyframe,(0,.7,.12),{'restPosition':[0,.7,.12],'restRotation':[0,0,0]})
        plate=box('Stepped rounded faceplate',(0,0,.01),(1.035,1.035,.055),cover,white,.034)
        hole=box('Rocker aperture',(0,0,.01),(.465,.67,.18),cover,None,.028);boolean_difference(plate,hole)
        box('Faceplate edge step',(0,0,-.025),(.995,.995,.018),cover,white,.026)
        recess=box('Rocker recessed surround',(0,0,.031),(.463,.668,.016),cover,grey,.026)
        hole=box('Rocker travel clearance',(0,0,.031),(.418,.622,.09),cover,None,.021);boolean_difference(recess,hole)
        actuator=semantic('actuator',cover,(0,0,.056))
        rocker=empty('motion:rocker',actuator,data={'animation':'rocker','axis':'x','onAngle':-.115,'offAngle':.115});rocker.rotation_euler.x=-.115
        box('Convex moulded rocker',(0,0,.026),(.414,.613,.081),rocker,white,.034)
        box('Rocker ON tactile notch',(0,.18,.068),(.11,.008,.003),rocker,grey,.002)
        mounting=semantic('mounting',cover)
        for x in (-.426,.426):
            torus('Recessed fixing seat',(x,0,.042),.039,.006,mounting,grey);screw((x,0,.047),mounting,steel,dark)
        label('10 AX',(0,-.402,.047),cover,dark,.035)
    elif kind=='rose':
        body=semantic('body',bodyframe)
        cyl('Rose mounting base',(0,.65,-.035),.422,.165,body,white)
        torus('Base moulded perimeter',(0,.65,.05),.405,.012,body,white)
        for x in (-.24,.24):
            cyl('Base moulded fixing boss',(x,.65,-.063),.055,.09,body,white)
        cover=semantic('cover',bodyframe,(0,.65,.125),{'restPosition':[0,.65,.125],'restRotation':[0,0,0]})
        cap=cyl('Domed rose cap',(0,0,.03),.421,.07,cover,white)
        hole=cyl('Pendant cord exit',(0,0,.03),.053,.15,cover,None);boolean_difference(cap,hole)
        torus('Cap seam',(0,0,-.009),.41,.007,cover,grey)
        mounting=semantic('mounting',cover);torus('Cord exit strain-relief',(0,0,.067),.054,.014,mounting,white)
        for i in range(4):torus('Cap thread',(0,0,-.027-i*.008),.393,.003,cover,white)
        label('CEILING ROSE',(0,.25,.069),cover,dark,.032)
    elif kind=='lamp':
        body=semantic('body',bodyframe)
        cyl('Batten holder mounting base',(0,.16,0),.291,.073,body,white,False)
        cyl('Holder lower skirt',(0,.228,0),.226,.066,body,white,False)
        cap=semantic('cover',bodyframe,(0,.315,0),{'restPosition':[0,.315,0],'restRotation':[0,0,0]})
        cyl('Ceramic B22 holder cap',(0,0,0),.144,.128,cap,white,False)
        for y in (.272,.34,.369):torus('Holder moulded seam',(0,y,0),.145,.006,body,grey,False)
        mounting=semantic('mounting',bodyframe)
        for x in (-.2,.2):screw((x,.18,.09),mounting,steel,dark,.024)
        pins=semantic('pins',cap)
        cyl('Nickel bayonet lamp cap',(0,.112,0),.102,.12,pins,steel,False)
        for x in (-.11,.11):
            stud=cyl('B22 locating pin',(x,.115,0),.014,.035,pins,brass);stud.rotation_euler[1]=math.pi/2
        for y in (.077,.146):torus('Bayonet cap rolled rim',(0,y,0),.102,.006,pins,steel,False)
        emitter=semantic('emitter',cap)
        opal=material('Frosted bulb glass',(.86,.89,.84),0,.22)
        profile=[(.082,0),(.085,.068),(.12,.115),(.188,.21),(.232,.315),(.235,.385),(.209,.48),(.15,.555),(.064,.608),(0,.625)]
        lathe('Smooth pear bulb envelope',profile,emitter,opal,(0,.151,0))
        contacts=semantic('contacts',bodyframe)
        for x in (-.03,.03):cyl('Internal spring lamp contact',(x,.29,-.02),.015,.16,contacts,brass,False)
        label('B22 · 60 W',(0,.29,.146),body,dark,.023)

def merge_static(root):
    buckets={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        # Retain editable individual hardware and functional subassemblies.
        # detailId is below the stable part/terminal owner, so picking still
        # resolves to the existing circuit semantic identity.
        owner=next((p for p in ancestors(obj) if p.get('detailId') and not str(p.get('detailId')).startswith('fixing-') or p.get('terminalId') or p.get('partId') or p.get('animation')),root)
        mat=obj.data.materials[0] if obj.data.materials else None
        buckets.setdefault((owner,mat),[]).append(obj)
    for (owner,mat),objects in buckets.items():
        for obj in objects:
            bpy.context.view_layer.objects.active=obj
            if obj.modifiers and obj.data.users>1:obj.data=obj.data.copy()
            for modifier in list(obj.modifiers):
                try:bpy.ops.object.modifier_apply(modifier=modifier.name)
                except RuntimeError:obj.modifiers.remove(modifier)
        if len(objects)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();joined=bpy.context.object;joined.name=owner.name+' · '+(mat.name if mat else 'mesh')
        world=joined.matrix_world.copy();joined.parent=owner;joined.matrix_world=world

def authored_library_variants(recipe,root):
    """Distinct original training forms, kept inside the registry envelope.

    The source recipes already distinguish lamp/cable/heating/sensor families.
    These assemblies replace forms where only the old label/colour differed.
    They are representative equipment rather than manufacturer CAD copies.
    """
    key=recipe['galleryKey']
    if key=='fan:default':
        # The previous solid cylinder's rear cap hid the canonical terminal
        # bank. A fan duct is hollow: cut a true aperture through the barrel.
        target=next((obj for obj in root.children_recursive if obj.type=='MESH' and (obj.location-Vector((0,.75,-.12))).length<1e-5),None)
        if not target:raise ValueError('Fan duct barrel missing')
        aperture=cyl('Hollow rear fan duct',(0,.75,-.12),.332,.65,target.parent,None)
        boolean_difference(target,aperture)
        return
    if key not in ('panel:industrial-cabinet','motor:shutter','motor:gate','motor:compressor','sensor:mode=temperature','sensor:mode=humidity','sensor:mode=load'):return
    bpy.context.view_layer.update();detach_body(root)
    sx,sy,sz=recipe['definition']['size'][0]/1.3,recipe['definition']['size'][1]/1.45,recipe['definition']['size'][2]/.85
    frame=empty('Distinct original assembly',root,scale=(sx,sy,sz))
    grey=material('Powder coated cabinet steel',(.43,.49,.48),.35,.4);black=material('Machinery thermoplastic',(.035,.055,.058),0,.5)
    steel=material('Machined steel',(.50,.58,.61),.9,.23);brass=material('Machinery brass',(.57,.37,.15),.83,.24)
    blue=material('Cast motor blue',(.08,.24,.31),.45,.42);white=material('Label plate',(.79,.83,.80),0,.4)
    body=semantic('body',frame);mounting=semantic('mounting',frame)
    if key.startswith('sensor:'):
        electronics=semantic('electronics',frame);sensing=semantic('sensing',frame)
        pcb=material('Sensor PCB green',(.08,.25,.15),0,.55)
        box('Sensor control PCB',(0,.72,.04),(.48,.64,.025),electronics,pcb,.008)
        for x in (-.16,0,.16):box('Conceptual interface package',(x,.84,.067),(.08,.10,.03),electronics,black,.006)
        box('Rounded sensor mounting base',(0,.72,-.03),(.74,.91,.25),body,white,.045)
        cover=semantic('cover',frame,(0,.72,.15),{'restPosition':[0,.72,.15],'restRotation':[0,0,0]})
        if key=='sensor:mode=temperature':
            box('Temperature transmitter fascia',(0,0,.055),(.70,.87,.045),cover,white,.033)
            for x in (-.19,-.095,0,.095,.19):box('Temperature sampling vent',(x,-.2,.081),(.037,.17,.006),cover,black,.006)
            cyl('Remote probe gland',(.30,.06,-.22),.031,.1,body,black,False)
            probe=cyl('Stainless temperature probe',(.30,.25,-.22),.023,.32,sensing,steel,False)
            cyl('Sealed probe tip',(.30,.42,-.22),.024,.023,sensing,steel,False)
            label('TEMPERATURE',(0,.28,.082),cover,black,.034)
        elif key=='sensor:mode=humidity':
            box('Humidity transmitter fascia',(0,0,.055),(.70,.87,.045),cover,white,.035)
            for y in (-.28,-.18,-.08,.02,.12):
                box('Air sampling grille',(0,y,.081),(.47,.033,.006),cover,black,.008)
                for x in (-.16,0,.16):box('Grille support rib',(x,y,.085),(.024,.037,.008),cover,white,.002)
            box('Capacitive humidity sensor',(0,.57,.071),(.18,.12,.023),sensing,steel,.008)
            for x in (-.04,.04):box('Humidity electrode',(x,.57,.085),(.009,.09,.004),sensing,brass,.001)
            label('HUMIDITY',(0,.30,.082),cover,black,.039)
        else:
            box('Load controller DIN fascia',(0,0,.055),(.69,.85,.045),cover,white,.02)
            box('Load current display',(0,.27,.084),(.38,.11,.009),cover,black,.009)
            ct=cyl('Split-core current sensor',(0,.64,.255),.23,.10,sensing,black)
            aperture=cyl('Current sensor conductor aperture',(0,.64,.255),.135,.23,sensing,None);boolean_difference(ct,aperture)
            torus('Current transformer winding',(0,.64,.315),.19,.021,sensing,brass)
            label('LOAD / CT',(0,-.32,.087),cover,black,.039)
            for x in (-.24,.24):box('DIN spring clip',(x,.25,-.19),(.10,.10,.15),mounting,steel,.006)
        return
    if key=='panel:industrial-cabinet':
        box('Industrial backplate',(0,.72,-.23),(1.22,1.30,.065),body,grey,.014)
        for x in (-.59,.59):box('Folded cabinet sides',(x,.72,.015),(.06,1.3,.49),body,grey,.009)
        for y in (.1,1.34):box('Folded cabinet edges',(0,y,.015),(1.22,.06,.49),body,grey,.009)
        for y in (.36,.76,1.13):
            box('DIN35 rail',(0,y,-.105),(1.0,.042,.035),mounting,steel,.004)
            for dy in (-.032,.032):box('DIN rail return',(0,y+dy,-.082),(1.0,.016,.022),mounting,steel,.003)
        for x in (-.48,.48):
            box('Vertical slotted wiring duct',(x,.76,-.015),(.10,1.02,.13),mounting,black,.007)
            for y in (.31,.43,.55,.67,.79,.91,1.03,1.15):box('Trunking lid slot',(x,y,.053),(.078,.011,.004),mounting,grey,.002)
        cover=semantic('cover',frame,(0,.72,.292),{'restPosition':[0,.72,.292],'restRotation':[0,0,0]})
        door=box('Solid industrial hinged door',(0,0,0),(1.20,1.30,.045),cover,grey,.013)
        for x in (-.56,.56):box('Door folded return',(x,0,-.024),(.023,1.19,.055),cover,grey,.005)
        for y in (-.48,.48):
            cyl('Door hinge barrel',(-.588,y,-.025),.026,.18,cover,steel,False)
            box('Door hinge leaf',(-.551,y,-.025),(.08,.15,.012),cover,steel,.005)
        actuator=semantic('actuator',cover);cyl('Quarter-turn cabinet latch',(.43,0,.037),.057,.026,actuator,steel)
        box('Latch keyed slot',(.43,0,.052),(.035,.012,.003),actuator,black,.003)
        box('Danger label plate',(-.22,.42,.026),(.35,.15,.006),cover,white,.008)
        label('400 V',(-.22,.42,.030),cover,black,.059)
        return
    # Machinery shares an electrically immutable rear terminal pod, with each
    # application having a distinct visible mechanical arrangement.
    box('Rear motor connection box',(0,1.025,-.24),(.50,.33,.22),body,black,.027)
    rotor=semantic('rotor',frame)
    if key=='motor:compressor':
        cyl('Compressed-air receiver',(0,.37,.04),.28,1.03,body,blue,False)
        # Cylinder axis is horizontal X, so rotate the upright barrel around Z.
        barrel=next(o for o in body.children if o.name.startswith('Compressed-air receiver'));barrel.rotation_euler=(0,math.pi/2,0)
        for x in (-.43,.43):
            cyl('Receiver end dome',(x,.37,.04),.276,.08,body,blue).rotation_euler[1]=math.pi/2
            box('Receiver support foot',(x,.09,.03),(.13,.13,.35),mounting,steel,.008)
        box('Compressor cylinder head',(.19,.91,.08),(.32,.29,.30),body,black,.018)
        for y in (.81,.85,.89,.93,.97,1.01):box('Cylinder cooling fin',(.19,y,.08),(.37,.016,.34),body,steel,.003)
        cyl('Motor drive housing',(-.23,.86,.07),.19,.4,body,blue).rotation_euler[1]=math.pi/2
        cyl('Pressure gauge',(0,.69,.23),.087,.034,body,steel)
        cyl('Pressure dial',(0,.69,.254),.07,.004,body,white)
        box('Gauge pointer',(0,.713,.259),(.008,.063,.004),body,black,0)
        box('Pressure pipe',(.36,.67,.09),(.027,.24,.03),body,brass,.003)
        spin=empty('motion:compressor-drive',rotor,(-.30,.86,.27),data={'animation':'rotor','axis':'z','speed':10})
        torus('Drive flywheel',(0,0,0),.155,.016,spin,steel)
        for a in range(4):box('Flywheel spoke',(0,0,0),(.29,.018,.018),spin,steel,.003).rotation_euler.z=a*math.pi/4
    elif key=='motor:shutter':
        tube=cyl('Tubular shutter motor',(0,.70,.04),.14,1.02,body,steel);tube.rotation_euler[1]=math.pi/2
        for x in (-.49,.49):
            sleeve=cyl('Drive collar',(x,.70,.04),.19,.12,body,black);sleeve.rotation_euler[1]=math.pi/2
            box('Shutter mounting bracket',(x,.46,.04),(.09,.39,.42),mounting,steel,.01)
        box('Limit adjustment head',(-.42,.89,.04),(.22,.24,.29),body,black,.022)
        for x in (-.47,-.38):cyl('Limit adjustment screw',(x,.94,.195),.028,.026,mounting,brass)
        spin=empty('motion:shutter-shaft',rotor,(.60,.70,.04),data={'animation':'rotor','axis':'x','speed':3})
        shaft=cyl('Shutter drive shaft',(0,0,0),.055,.2,spin,steel);shaft.rotation_euler[1]=math.pi/2
        box('Shaft key',(.02,.058,0),(.12,.025,.025),spin,steel,.003)
    else:
        box('Gate reduction gearbox',(-.04,.60,.02),(.56,.54,.46),body,grey,.04)
        cyl('Geared motor housing',(.34,.64,.02),.205,.34,body,blue).rotation_euler[1]=math.pi/2
        for y in (.29,.34):box('Gearbox bolted mounting foot',(-.06,y,.02),(.74,.034,.48),mounting,steel,.008)
        for x in (-.30,.2):screw((x,.38,.28),mounting,steel,black,.024)
        spin=empty('motion:gate-output',rotor,(-.13,.62,.29),data={'animation':'rotor','axis':'z','speed':2})
        cyl('Gate sprocket hub',(0,0,0),.092,.12,spin,steel)
        torus('Gate drive sprocket',(0,0,.08),.15,.025,spin,steel)
        for a in range(12):
            angle=a*math.pi/6;box('Sprocket tooth',(math.sin(angle)*.166,math.cos(angle)*.166,.08),(.027,.044,.065),spin,steel,.004).rotation_euler.z=-angle

def add_terminal_legends(recipe,root):
    dark=material('Rear terminal legend',(.055,.075,.07),0,.65)
    by_id={obj.get('terminalId'):obj for obj in root.children_recursive if obj.get('terminalId')}
    for terminal in recipe['terminals']:
        node=by_id.get(terminal['id'])
        if not node:raise ValueError('Missing terminal '+terminal['id'])
        scale=terminal.get('scale',1)
        white=material('Rear marking pad '+terminal['id'],(.80,.82,.75),0,.55)
        box('Moulded terminal legend pad',(0,.082*scale,.001*scale),(.115*scale,.031*scale,.006*scale),node,white,.004)
        label(terminal['label'],(0,.082*scale,.005*scale),node,dark,.020*scale)
        node['canonicalAnchor']=terminal['anchor'];node['role']=terminal['role'];node['purpose']=terminal['purpose'];node['group']=terminal.get('group','')
    return by_id

def tag_inspection_shells(root):
    bpy.context.view_layer.update()
    for obj in root.children_recursive:
        if obj.type!='MESH' or not obj.data.materials:continue
        parents=list(ancestors(obj));part=next((p.get('partId') for p in parents if p.get('partId')),'')
        if any(p.get('terminalId') or p.get('detailId') for p in parents):continue
        if part not in ('terminals','contacts','actuator'):continue
        if obj.dimensions.length<.43:continue
        shader=obj.data.materials[0].node_tree.nodes.get('Principled BSDF');color=shader.inputs['Base Color'].default_value
        if max(color[:3])<.3:obj['inspectionHousing']=True

def set_view(root,view):
    component_type=str(root.get('galleryKey','')).split(':')[0]
    for obj in root.children_recursive:
        if obj.get('partId')=='cover' and obj.get('restPosition'):
            p=Vector(obj['restPosition']);obj.location=p
            obj.rotation_euler=(0,0,0);obj.hide_render=False
            if view=='open':obj.location=p+Vector((.55,.08,.15));obj.rotation_euler[1]=math.pi/2.5
            if view=='exploded':obj.location=p+Vector((.5,.5,.65))
        if obj.type=='MESH':
            part=next((p.get('partId') for p in ancestors(obj) if p.get('partId')),'')
            internal=any(p.get('conceptualInternal') for p in ancestors(obj)) or part in ('electronics','coil','thermal','magnetic') or part=='winding' and component_type not in ('transformer','dcsupply')
            cover_assembly=any(p.get('partId')=='cover' for p in ancestors(obj))
            obj.hide_render=view=='cutaway' and cover_assembly or view=='normal' and internal
            if view=='cutaway' and (part=='body' or obj.get('inspectionHousing') or obj.get('lampEnvelope')):
                obj.data.materials.clear();obj.data.materials.append(material('Conceptual cutaway housing',(.40,.64,.55),0,.5,.14))

def studio():
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='AgX'
    for location,power,size in (((-3,-4,7),1100,5),((4,1,4),850,4),((0,4,6),1200,4)):
        data=bpy.data.lights.new('Studio softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new('Studio softbox',data);bpy.context.collection.objects.link(obj);obj.location=location
        obj.rotation_euler=(Vector((0,0,.5))-obj.location).to_track_quat('-Z','Y').to_euler()
    mat=material('Studio work mat',(.11,.15,.145),0,.94)
    box('Studio bench',(0,0,-.06),(100,100,.1),None,mat,.01)
    camera=bpy.data.cameras.new('Offline inspection camera');obj=bpy.data.objects.new('Offline inspection camera',camera);bpy.context.collection.objects.link(obj);scene.camera=obj;camera.type='ORTHO'
    return obj

def fit_camera(root,camera,direction,padding=1.13):
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(corner) for o in root.children_recursive if o.type=='MESH' and not o.hide_render for corner in o.bound_box]
    lower=Vector(tuple(min(p[i] for p in points) for i in range(3)));upper=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    target=(lower+upper)*.5;camera.location=target+Vector(direction)*max(2,(upper-lower).length)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
    inverse=camera.matrix_world.inverted();projected=[inverse@p for p in points]
    camera.data.ortho_scale=max(max(p.x for p in projected)-min(p.x for p in projected),max(p.y for p in projected)-min(p.y for p in projected))*padding

def render_thumbnail(entry):
    key=entry['key'];bpy.ops.wm.open_mainfile(filepath=str(SOURCES/f'{key}.blend'))
    root=next(obj for obj in bpy.context.scene.objects if obj.name.startswith('Electrical Lab'));set_view(root,'normal');camera=studio()
    # A transparent studio render supplies reusable local menu icons. This is
    # the actual full-detail asset, not a painted illustration.
    floor=next(obj for obj in bpy.context.scene.objects if obj.name=='Studio bench');floor.hide_render=True
    bpy.context.scene.render.film_transparent=True;fit_camera(root,camera,(1.6,-3.8,1.35),1.12)
    bpy.context.scene.render.resolution_x=192;bpy.context.scene.render.resolution_y=192
    folder=ASSETS/'thumbnails';folder.mkdir(exist_ok=True);file=folder/f'{key}.png';bpy.context.scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
    strip_text_metadata(file)

def render_first(keys):
    for key in keys:
        recipe=json.loads((HERE/'recipes'/f'{key}.json').read_text())
        for view in ('front','rear','open'):
            bpy.ops.wm.open_mainfile(filepath=str(SOURCES/f'{key}.blend'))
            root=next(obj for obj in bpy.context.scene.objects if obj.name.startswith('Electrical Lab'))
            set_view(root,'open' if view=='open' else 'normal');camera=studio();camera.location=(1.75,-3.6,2.15) if view!='rear' else (-1.5,3.5,2)
            target=Vector((0,0,recipe['definition']['size'][1]*.48));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=2.5
            bpy.context.scene.render.resolution_x=700;bpy.context.scene.render.resolution_y=700;bpy.context.scene.render.filepath=str(PREVIEWS/f'{key}-{view}.png');bpy.ops.render.render(write_still=True)
            strip_text_metadata(PREVIEWS/f'{key}-{view}.png')

def render_library(inventory):
    for entry in inventory:
        key=entry['key'];recipe=json.loads((HERE/'recipes'/f'{key}.json').read_text())
        for view in ('front','rear','open','exploded','cutaway','open-front','exploded-front','cutaway-front'):
            bpy.ops.wm.open_mainfile(filepath=str(SOURCES/f'{key}.blend'))
            root=next(obj for obj in bpy.context.scene.objects if obj.name.startswith('Electrical Lab'))
            presentation=view.split('-')[0]
            set_view(root,presentation if presentation in ('open','exploded','cutaway') else 'normal');camera=studio()
            fit_camera(root,camera,(1.4,-3.6,1.15) if view=='front' or view.endswith('-front') else (-1.3,3.6,1.15))
            bpy.context.scene.render.resolution_x=500;bpy.context.scene.render.resolution_y=500;bpy.context.scene.render.filepath=str(PREVIEWS/f'{key}-{view}.png');bpy.ops.render.render(write_still=True)
            strip_text_metadata(PREVIEWS/f'{key}-{view}.png')
        print('INSPECTED',key,flush=True)

def export_lod(root,path):
    for obj in list(root.children_recursive):
        # Engraved text needs the close-inspection mesh. At distance its tiny
        # triangles add cost without legible information; terminal identity,
        # physical clamp and live canonical picking anchor are retained.
        if obj.type=='MESH' and any(m.name.startswith('Rear terminal legend') for m in obj.data.materials):
            bpy.data.objects.remove(obj,do_unlink=True);continue
        if obj.type!='MESH' or len(obj.data.polygons)<80:continue
        if any('legend' in m.name.lower() or 'marking' in m.name.lower() for m in obj.data.materials):continue
        if obj.data.users>1:obj.data=obj.data.copy()
        modifier=obj.modifiers.new('Distance geometry simplification','DECIMATE');modifier.ratio=.24 if any(p.get('terminalId') for p in ancestors(obj)) else .18
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True)
    return sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in root.children_recursive if obj.type=='MESH')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--first',action='store_true');parser.add_argument('--render-first',action='store_true');parser.add_argument('--render-library',action='store_true');parser.add_argument('--render-only',action='store_true');parser.add_argument('--thumbnails',action='store_true');parser.add_argument('--only');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    inventory=json.loads((HERE/'recipes/inventory.json').read_text());first=[item['key'] for item in inventory if item['galleryKey'] in ('switch:single-rocker','rose:default','lamp:bulb')]
    only=set(args.only.split(',')) if args.only else None
    selected=[item for item in inventory if (not args.first or item['key'] in first) and (only is None or item['key'] in only)]
    if args.render_only:
        if args.thumbnails:
            for entry in selected:render_thumbnail(entry)
        if args.render_library or not args.thumbnails:render_library(selected)
        return
    reports=[]
    for entry in selected:
        recipe=json.loads((HERE/'recipes'/entry['file']).read_text());root=reconstruct(recipe);authored_first_fixture(recipe,root);authored_library_variants(recipe,root)
        features=enrich(recipe,root,SimpleNamespace(**{name:globals()[name] for name in ('empty','material','box','cyl','torus','semantic','ancestors','setmesh','boolean_difference')}))
        add_terminal_legends(recipe,root);tag_inspection_shells(root)
        root['source']='Original typed recipe refined in Blender 4.5 LTS';root['galleryKey']=entry['galleryKey'];root['conceptualInternals']=True
        source_meshes=sum(o.type=='MESH' for o in root.children_recursive)
        # Save the original authoring objects before export batching: gear teeth,
        # threads, washers, pressure plates and PCB parts remain individually
        # editable. Runtime GLBs combine only static details with shared owners.
        bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/f"{entry['key']}.blend"),compress=True)
        merge_static(root);tag_inspection_shells(root)
        bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
        for obj in root.children_recursive:obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(ASSETS/f"{entry['key']}.glb"),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True)
        meshes=[obj for obj in root.children_recursive if obj.type=='MESH'];triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
        low_path=ASSETS/(entry['key']+'.low.glb');low_triangles=export_lod(root,low_path)
        reports.append({'key':entry['key'],'galleryKey':entry['galleryKey'],'type':entry['component']['type'],'name':entry['name'],'url':'/models/'+entry['key']+'.glb','lowUrl':'/models/'+entry['key']+'.low.glb','thumbnailUrl':'/models/thumbnails/'+entry['key']+'.png','detailRevision':REVISION,'detailFamily':recipe['definition']['model'],'detailFeatures':features,'sourceMeshCount':source_meshes,'meshCount':len(meshes),'triangles':triangles,'lowTriangles':low_triangles,'terminals':recipe['terminals'],'bytes':(ASSETS/(entry['key']+'.glb')).stat().st_size,'lowBytes':low_path.stat().st_size,'bespokeBlender':True})
        print('MODEL_READY',entry['key'],len(meshes),triangles,flush=True)
    report_path=ASSETS/'manifest.json';old=json.loads(report_path.read_text()) if report_path.exists() else []
    merged={item['key']:item for item in old};merged.update({item['key']:item for item in reports});report_path.write_text(json.dumps(list(merged.values()),indent=2))
    if args.render_first:render_first(first)
    if args.render_library:render_library(selected)
    if args.thumbnails:
        for entry in selected:render_thumbnail(entry)
    print('COMPLETE',len(reports),'generated assets',flush=True)

if __name__=='__main__':main()
