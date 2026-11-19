"""PLX050E Series C. Original study construction in mm from the bottom centre.
Dimplex gives exterior dimensions, bracket pitch, flex side, materials and
controls. The louvre and sheet-metal profiles and cutaway are drawn from its
photographs/diagrams. The flex on the loose bench model is shortened.
"""
import math
import bpy
from mathutils import Vector


def build_plxe(recipe,root,A):
    for obj in reversed(list(root.children_recursive)):
        bpy.data.objects.remove(obj,do_unlink=True)
    unit=1/300
    mm=lambda p:tuple(v*unit for v in p)
    frame=A.empty('PLXE bottom centre at the mounting wall',root,(0,.32,0))
    chassis=A.semantic('body',frame)
    lid=A.semantic('cover',frame,data={'restPosition':[0,0,0],'plxeLiftOff':True})
    bracket=A.semantic('mounting',frame)
    element=A.semantic('element',frame)
    thermal=A.semantic('thermal',frame)
    cores=A.semantic('terminals',frame,data={'looseHeaterFlex':True})
    white=A.material('Traffic white oven-cured steel',(.81,.825,.815),.11,.34)
    polymer=A.material('Moulded control surround',(.76,.775,.76),0,.42)
    shadow=A.material('Interior of ventilation slots',(.036,.041,.038),.18,.63)
    zinc=A.material('Galvanised bracket',(.45,.48,.47),.70,.40)
    alu=A.material('Unpainted aluminium fins',(.50,.53,.53),.68,.45)
    steel=A.material('Heater shroud',(.39,.41,.40),.54,.45)
    black=A.material('Temperature-resistant moulding',(.087,.091,.087),0,.58)
    ui_ink=A.material('Capacitive panel markings',(.18,.20,.20),0,.46)
    lcd=A.material('Unlit heater LCD',(.19,.22,.215),.13,.40)
    orange=A.material('Bare stranded copper',(.62,.28,.095),.73,.35)
    ceramic=A.material('Ceramic electrical bush',(.73,.72,.68),0,.57)
    flex_white=A.material('Warm-white H05VV-F jacket',(.73,.72,.68),0,.57)
    features=['individual-electrical-terminations']
    def feature(name,text,owner,**data):
        features.append(name)
        return A.empty(name,owner,data={'detailId':name,'detailPurpose':text,**data})
    def block(name,p,s,parent,mat,r=1):
        return A.box(name,mm(p),mm(s),parent,mat,r*unit)
    def cut(o,tool):
        bpy.context.view_layer.update()
        A.boolean_difference(o,tool)
    def cyl(name,p,r,h,parent,mat,d=(0,0,1),sides=28):
        obj=A.cyl(name,mm(p),r*unit,h*unit,parent,mat,vertices=sides)
        obj.rotation_euler=Vector(d).to_track_quat('Z','Y').to_euler()
        return obj
    def relief(text,p,size,parent,mat):
        curve=bpy.data.curves.new('Pad print','FONT');curve.body=text;curve.size=size*unit
        curve.align_x='CENTER';curve.align_y='CENTER';curve.resolution_u=3
        obj=bpy.data.objects.new(text,curve);bpy.context.collection.objects.link(obj)
        obj.parent=parent;obj.location=mm(p);curve.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
        return obj
    def tube(name,points,r,parent,mat,segments=16,stripe=None):
        # A parallel-transport frame gives a continuous stripe around bends.
        steps=[Vector(q) for q in points];vertices=[];faces=[]
        old=Vector((1,0,0))
        for i,p in enumerate(steps):
            direction=(steps[min(i+1,len(steps)-1)]-steps[max(i-1,0)]).normalized()
            h=(old-direction*old.dot(direction)).normalized()
            v=direction.cross(h); old=h
            for j in range(segments):
                a=2*math.pi*j/segments
                vertices.append(mm(p+r*(h*math.cos(a)+v*math.sin(a))))
        for i in range(len(points)-1):
            for j in range(segments):
                a=i*segments+j;b=i*segments+(j+1)%segments
                faces.append((a,b,b+segments,a+segments))
        faces.extend([tuple(reversed(range(segments))),tuple(range(len(vertices)-segments,len(vertices)))])
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);A.setmesh(obj,parent,mat)
        if stripe:
            mesh.materials.append(stripe)
            for i,f in enumerate(mesh.polygons[:-2]):
                f.material_index=1 if i%segments<segments//3 else 0
        return obj
    def curve_path(points):
        result=[points[0]]
        for i in range(len(points)-1):
            a,b,c,d=[Vector(points[max(0,min(j,len(points)-1))]) for j in (i-1,i,i+1,i+2)]
            for k in range(1,6):
                t=k/5
                result.append(tuple(.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t**3)))
        return result
    def loop(w,h,r,cy,z,count=9):
        points=[]
        for corner,(sx,sy) in enumerate(((1,1),(-1,1),(-1,-1),(1,-1))):
            cx=sx*(w/2-r); centre_y=cy+sy*(h/2-r)
            for i in range(count):
                theta=(corner+i/(count-1))*math.pi/2
                points.append((cx+r*math.cos(theta),centre_y+r*math.sin(theta),z))
        return points
    def drawn_face():
        # Thin drawn metal shell. Fold lines retreat around all four edges;
        # the flat front is cut for open louvers and pressed vertical flutes.
        rings=[(437,419,18,81),(448,427,20,89),(450,430,21,98),
               (448,428,21,101.8),(444,424,20,104.7),(436,416,18,106.9),
               (426,406,17,108),(426,406,17,106.9),(436,416,18,105.8),
               (442,422,19,103.7),(446,426,20,100.8),(446,425,19,89),(435,417,17,81)]
        rings=[loop(w,h,r,215,z) for w,h,r,z in rings]
        n=len(rings[0]);verts=[mm(p) for ring in rings for p in ring];faces=[]
        for i in range(len(rings)-1):
            if i==6:continue
            for j in range(n):
                a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
        faces.append(tuple(range(6*n,7*n)))
        faces.append(tuple(reversed(range(7*n,8*n))))
        for j in range(n):
            a=(len(rings)-1)*n+j;b=(len(rings)-1)*n+(j+1)%n
            faces.append((a,b,(j+1)%n,j))
        mesh=bpy.data.meshes.new('Pressed face');mesh.from_pydata(verts,[],faces);mesh.update()
        obj=bpy.data.objects.new('Drawn steel front',mesh);bpy.context.collection.objects.link(obj);A.setmesh(obj,lid,white)
        for p in mesh.polygons:p.use_smooth=len(p.vertices)==4
        return obj
    lid['keepDistanceSurface']=True
    face=drawn_face()
    cut(face,block('Air-outlet opening',(0,363,105),(397,63,32),lid,None,4))
    # One continuous stamped field. Each depression rolls down and back out,
    # and fades before the upper and lower edges. There is no overlaid rib or
    # coplanar second skin to flicker when this white panel fills a phone screen.
    cut(face,block('Front stamped field',(0,179,107),(356,304,9),lid,None,0))
    centers=(-144,-48,48,144)
    xs=sorted({-178,178,*[x+s for x in centers for s in (-7,-4.4,-3.35,-2.3,-1.15,0,1.15,2.3,3.35,4.4,7)]})
    ys=[27,36.5,38,39.5,41.5,43.5,46,312,314.5,316.5,318.5,320,321.5,331]
    verts=[];faces=[]
    for y in ys:
        cap=min(1,max(0,(y-38)/8),max(0,(320-y)/8))
        fade=cap*cap*(3-2*cap)
        for x in xs:
            dist=min(abs(x-c) for c in centers)
            groove=(1+math.cos(math.pi*dist/4.4))/2 if dist<4.4 else 0
            verts.append(mm((x,y,108-2.55*groove*fade)))
    nx=len(xs)
    for j in range(len(ys)-1):
        for i in range(nx-1):
            v=j*nx+i;faces.append((v,v+1,v+1+nx,v+nx))
    mesh=bpy.data.meshes.new('Four press-formed flutes');mesh.from_pydata(verts,[],faces);mesh.update()
    pressing=bpy.data.objects.new('Continuous fluted front field',mesh);bpy.context.collection.objects.link(pressing);A.setmesh(pressing,lid,white)
    grille=feature('plxe-outlet','The upper grille sends warm air forward. Each blade has a return lip and sits on narrow supports.',lid,preservePlanarLod=True)
    vent=block('Rounded rolled outlet frame',(0,363.5,104.4),(408,75,6.0),grille,white,5)
    cut(vent,block('Clear air outlet',(0,363.5,104.4),(395,62,12),grille,None,3.5))
    for y in [339,354,369,384]:
        blade=block('Sloping folded outlet louvre',(0,y,99.2),(393.4,2.8,16.1),grille,white,1.2)
        blade.rotation_euler.x=-.57
        block('Rolled blade leading edge',(0,y+4.13,105.8),(393.2,3.3,2.3),grille,white,1.0)
    for x in [-137,0,137]:block('Pressed grille support',(x,363,95),(3.3,66,6.3),grille,white,.8)

    shell=feature('plxe-rear-chassis','The rear steel tray hangs from two bracket hooks. The clock and electronics sit in the covered right-hand service housing.',chassis,preservePlanarLod=True)
    block('Back wall of draw-formed casing',(0,215,26),(428,409,3.2),shell,white,1.5)
    for x in [-211.7,211.7]:block('Rolled side wall',(x,215,58),(3.2,404,62),shell,white,1.45)
    top=block('Top return',(0,420,56),(421,3.5,59),shell,white,1.4)
    cut(top,block('Controller well',(145,420,54),(126.5,19,59),shell,None,2.0))
    for x in [-182,-120,-60,0,60,120,182]:
        block('Raised rear stiffener',(x,211,23.4),(7,314,3.7),shell,white,1.7)
    inlet=feature('plxe-inlet','Cool air enters through the openings along the underside, below the heating element.',chassis,preservePlanarLod=True)
    for z in [32,51,70,86]:block('Fold at bottom inlet',(0,12,z),(419,3,3),inlet,white,1.3)
    for x in range(-204,211,12):block('Intake grating',(x,12,58),(3.6,2.4,55),inlet,white,1)
    deflector=block('Angled air guide behind the outlet',(0,360,70),(412,86,3.7),chassis,steel,1.5)
    deflector.rotation_euler.x=.21
    for x in [-195,195]:
        deflector=block('Side of air passage',(x,347,69),(3,69,59),chassis,steel,.8)
    brackets=feature('plxe-wall-bracket','The two hooks at the bottom and spring catches at the top secure the heater to the H-shaped wall bracket.',bracket,preservePlanarLod=True)
    for x in [-106,10]:
        bar=block('Galvanised H-frame upright',(x,227,1.3),(19,371,2.6),brackets,zinc,1)
        for y in [105,415]:
            cut(bar,cyl('Fixing hole',(x,y,1.2),2.8,6,brackets,None))
        block('Bent bottom hook',(x,43,10),(17,4,22),brackets,zinc,1.1)
        block('Lower lip of hook',(x,48,20),(17,12,2.8),brackets,zinc,.9)
        block('Top spring tab',(x,411,14),(15,3,27),brackets,zinc,.9)
        block('Turned tab end',(x,407,25),(15,9,3),brackets,zinc,.9)
    block('H-frame crossrail',(-48,214,3.90),(134,14,2.4),brackets,zinc,1.1)

    fins=feature('heat-transfer-construction','A sheathed electric element passes through aluminium fins. The metal stays opaque at ordinary operation; the lab measures electrical power.',element,conceptualInternal=True)
    for y in [92,105]:cyl('Mineral-filled sheathed element',(0,y,64),3.8,369,fins,steel,(1,0,0),24)
    for x in range(-177,178,7):
        block('Folded aluminium fin',(x,98.5,65),(.70,53,46),fins,alu,.27)
    for x in [-185,185]:
        cyl('Insulated element end',(x,92,64),5.6,11,fins,ceramic,(1,0,0))
    cutout=feature('thermal-protection','A separate thermal cut-out can stop the heater if the air path is obstructed. Its internal construction is illustrated for study.',thermal,conceptualInternal=True)
    block('Cut-out mounting clip',(137,316,38),(34,19,2.5),cutout,zinc,.7)
    cyl('Thermal protector capsule',(137,316,44),6.8,9,cutout,ceramic)
    for x in [123,151]:block('Cutout tag',(x,316,46),(11,4,1.2),cutout,zinc,.4)
    # Fixed controls must stay put when the pressed front is lifted off.
    pocket=feature('plxe-controls','Six touch keys sit on the top right, beside the LCD. In manual mode the arrows change the temperature setting.',chassis,preservePlanarLod=True)
    block('Plastic electronics enclosure',(148,214,34),(128,391,35),shell,polymer,7)
    panel=A.empty('Top right manual control panel',pocket,mm((145,416,54)))
    panel.rotation_euler.x=-1.30
    block('Panel bezel',(0,0,0),(123,55,8),panel,polymer,3.3)
    block('Seam round the laterally fitted insert',(0,0,3.85),(116,47,1.25),panel,ui_ink,.45)
    block('Touch face',(0,0,4.47),(114.7,45.8,1.2),panel,polymer,.5)
    screen=feature('plxe-screen','Manual mode displays the target temperature. Electrical power is checked at the meter; the set temperature is not an air thermometer.',panel,plxeScreen=True,keepDistanceSurface=True)
    block('LCD rim',(-33.7,0,5.02),(41.5,35.0,1.3),screen,ui_ink,.55)
    block('Liquid crystal display',(-33.7,0,5.72),(39.1,32.5,.32),screen,lcd,.12)
    for text,y in [('ADVANCE',12.8),('MENU',.2),('BACK',-12.6)]:
        relief(text,(4.2,y,5.18),3.2,panel,ui_ink)
    for y in [6.3,-6.3]:block('Pad dividing rule',(5.0,y,5.14),(22.0,.35,.10),panel,ui_ink,.02)
    for increase,y in [(True,8.5),(False,-8.5)]:
        key=feature('plxe-temperature-'+('up' if increase else 'down'),
            'Touch the up arrow to raise the manual temperature setting.' if increase else 'Touch the down arrow to lower the manual temperature setting.',panel,
            keepDistanceSurface=True)
        block('Capacitive arrow area',(26,y,5.09),(14.3,13,.16),key,polymer,.073)
        for sign in [-1,1]:
            stroke=block('Printed arrow shoulder',(26+sign*1.95,y,5.24),(4.85,1.0,.12),key,ui_ink,.055)
            stroke.rotation_euler.z=(-1 if increase else 1)*sign*.63
    enter=cyl('Enter ring',(47,0,5.18),8.6,.26,panel,ui_ink)
    cyl('Enter area',(47,0,5.35),8.2,.17,panel,polymer)
    relief('ENTER',(47,0,5.52),3.2,panel,ui_ink)
    for x in [-203,203]:
        for y in [33,394]:
            cyl('Rear cover fixing',(x,y,23),3.7,1.55,shell,zinc)
            for ang in [0,math.pi/2]:
                h=block('Fixing drive',(x,y,22.16),(4.5,.79,.20),shell,shadow,.07);h.rotation_euler.z=ang
    gland=feature('plxe-fitted-flex','The factory-fitted round flex leaves through the strain relief at the lower right. Its brown, blue and green/yellow cores land at the wall unit.',chassis,preservePlanarLod=True)
    for radius,y,h in [(8.2,4,6),(6.4,-1,5),(5.9,-5.8,4.8),(5.2,-10.2,3.6)]:
        cyl('Moulded cord entry',(187.5,y,34.5),radius,h,gland,polymer,(0,1,0))
    tail=feature('plxe-bench-lead','The bench shows a shortened flex with three separate cores. In the fitted room, one continuous outer sheath runs to the wall switch.',cores)
    tube('Uncut outer jacket',curve_path([(187.5,-12,34.5),(187.5,-28,34.5),(187.5,-46,25.5),(187.5,-57,5),(187.5,-57,-33)]),3.2,tail,flex_white,30)
    insulation={'L':A.material('Brown flex insulation',(.19,.075,.030),0,.55),
        'N':A.material('Blue flex insulation',(.025,.19,.47),0,.55),'PE':A.material('Green protective insulation',(.047,.30,.093),0,.55)}
    stripe=A.material('Yellow protective stripe',(.84,.60,.05),0,.5)
    for i,t in enumerate(recipe['terminals']):
        tid=t['id'];x,y,z=t['anchor'];x*=300;y=(y-.32)*300;z*=300
        # Local +Z of the port points out through the exposed copper end.
        node=A.empty('port:'+tid,cores,mm((x,y,z)),data={'terminalId':tid,'fieldMarking':t['label'],'fieldLegendModelled':True,'contactForm':'core end','entryDirection':t['entryDirection']})
        node.rotation_euler.y=math.pi
        end=A.empty('Stranded flex end '+tid,node,data={'detailId':'terminal-clamp:'+tid,'detailPurpose':'This is the separated, stripped copper end of the factory-fitted '+tid+' core. It lands at the fused connection unit.'})
        sign={'L':-1,'N':0,'PE':1}[tid]
        points=curve_path([(187.5+sign*1.1,-57,-32.7),(187.5+sign*4,-57,-43),(x-sign*3,y,-64),(x,y,-82)])
        tube('PVC core insulation',points,1.16,tail,insulation[tid],16,stripe if tid=='PE' else None)
        # Short continuation inside the insulation keeps a selectable real core
        # end, including if the user inspects the cold circuit at high zoom.
        cyl('Core insulation directly behind bare strands',(0,0,-10.5),1.18,6,end,insulation[tid])
        for j in range(7):
            angle=2*math.pi*j/6
            dx,dy=(0,0) if j==6 else (.39*math.cos(angle),.39*math.sin(angle))
            cyl('Stranded conductor tip',(dx,dy,-4),.225,8,end,orange,sides=12)
    return features
