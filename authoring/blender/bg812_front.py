"""BG 812-01 study face. The 86 mm plate uses 100 mm per model unit.

The projected rocker proportions come from the maker's front drawing and the
published overall depth is 23.3 mm. Undocumented mould radii are reconstructed.
"""
import math
import bpy
from mathutils import Vector


def build_front(root,A,detail):
    # Discard the old broad workshop rocker with a painted stripe. Its child
    # motion and fixing groups belong only to this replaceable cover.
    for owner in [o for o in root.children_recursive if o.get('partId')=='cover']:
        for o in reversed(list(owner.children_recursive)):
            bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.objects.remove(owner,do_unlink=True)
    plate=A.semantic('cover',root,(0,.651,0),{'restPosition':[0,.651,0],'restRotation':[0,0,0]})
    plate['keepDistanceSurface']=True
    white=A.material('BG812 ivory white thermoset',(.86,.855,.825),0,.27)
    nylon=A.material('BG812 satin rocker',(.846,.843,.816),0,.37)
    trim=A.material('BG812 shadow behind rocker',(.18,.179,.16),0,.55)
    capWhite=A.material('BG812 moulded fixing caps',(.856,.853,.823),0,.33)
    steel=A.material('BG812 plated fixing',(.59,.60,.61),.75,.30)
    def cut(base,tool):
        bpy.context.view_layer.update();A.boolean_difference(base,tool)
    def solid(name,verts,faces,parent,mat):
        m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
        o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);A.setmesh(o,parent,mat)
        return o
    def rounded(w,h,r):
        for x,y,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
            for i in range(9):
                a=math.radians(start+90*i/8);yield (x+r*math.cos(a),y+r*math.sin(a))
    # Raised middle field and broad, shallow rolled returns above and below it.
    loops=[(.855,.855,.031,-.014,0),(.86,.86,.033,-.003,0),(.858,.857,.034,.024,.004),
           (.845,.841,.030,.047,.012),(.815,.798,.028,.055,.012),(.805,.650,.022,.057,.003),(.803,.486,.020,.057,0)]
    verts=[]
    for w,h,r,z,fall in loops:
        verts.extend((x,y,z-fall*(abs(y)/(h/2))**2) for x,y in rounded(w,h,r))
    n=36
    faces=[tuple(reversed(range(n))),tuple(range((len(loops)-1)*n,len(loops)*n))]
    faces.extend((s*n+i,s*n+(i+1)%n,(s+1)*n+(i+1)%n,(s+1)*n+i) for s in range(len(loops)-1) for i in range(n))
    face=solid('Contoured one gang faceplate',verts,faces,plate,white)
    cut(face,A.box('Rear mould relief',(0,0,-.025),(.822,.817,.086),plate,None,.019))
    cut(face,A.box('Opening for the rocker',(0,0,.045),(.146,.280,.120),plate,None,.010))
    for x in [-.3015,.3015]:
        cut(face,A.cyl('Fixing clearance',(x,0,.033),.023,.15,plate,None,vertices=40))
        cut(face,A.cyl('Recess for the fixing cap',(x,0,.060),.0435,.030,plate,None,vertices=48))
    # Preserve the real flat field around the three apertures. Smoothing newly
    # triangulated Boolean polygons gave each screw a false, pinched depression.
    normals=[(0,0,1)]*len(face.data.loops)
    for polygon in face.data.polygons:
        upper=polygon.normal.z>.40
        polygon.use_smooth=upper
        for i in polygon.loop_indices:
            co=face.data.vertices[face.data.loops[i].vertex_index].co
            if upper:
                x=math.copysign(.87*(max(0,abs(co.x)-.38)/.05)**2,co.x)
                y=math.copysign(.21*(max(0,abs(co.y)-.24)/.18)**1.4+
                    .76*(max(0,abs(co.y)-.393)/.037)**2,co.y)
                normals[i]=Vector((x,y,1)).normalized()
            else:normals[i]=polygon.normal
    face.data.normals_split_custom_set(normals)
    border=A.box('Dark reveal around the rocker',(0,0,.034),(.147,.281,.036),plate,trim,.009)
    cut(border,A.box('Clear travel around rocker',(0,0,.034),(.139,.274,.082),plate,None,.009))
    fix=detail('faceplate-fixing','The two white caps conceal the plate screws. The screws pass through the plate into the two lugs of its wall box.',plate)
    fix['keepDistanceSurface']=True
    for x in [-.3015,.3015]:
        head=A.cyl('Concealed slotted plate screw',(x,0,.0445),.028,.010,fix,steel,vertices=36)
        cut(head,A.box('Slotted head recess',(x,0,.051),(.060,.0065,.011),fix,None,0))
        A.cyl('Plate fixing shank',(x,0,.012),.0165,.056,fix,steel,vertices=24)
        A.cyl('Flush white screw cap',(x,0,.0524),.0408,.0095,fix,capWhite,vertices=48)
    actuator=A.semantic('actuator',plate,(0,0,.056),{'animation':'rocker','axis':'x','onAngle':-.165,'offAngle':.165})
    handle=detail('bg812-operator','Press either end of this narrow rocker. It moves a hidden changeover contact between the two paths.',actuator)
    handle['keepDistanceSurface']=True
    loops=[(.128,.258,.012,-.026),(.134,.269,.013,-.014),(.136,.270,.013,.001),(.133,.267,.012,.010),(.126,.256,.010,.011)]
    vs=[(x,y,z+.001*(y/.135)**2) for w,h,r,z in loops for x,y in rounded(w,h,r)]
    faces=[tuple(reversed(range(n))),tuple(range((len(loops)-1)*n,len(loops)*n))]
    faces.extend((s*n+i,s*n+(i+1)%n,(s+1)*n+(i+1)%n,(s+1)*n+i) for s in range(len(loops)-1) for i in range(n))
    solid('Narrow raised rocker',vs,faces,handle,nylon)
    A.box('Nylon tail operating the contact',(0,0,-.031),(.069,.064,.060),handle,nylon,.009)

    # A changeover needs two stationary contacts. The earlier generic SPST
    # cutaway had one fixed contact irrespective of the selected strapper.
    for owner in [o for o in root.children_recursive if o.get('partId')=='contacts' and not any(p.get('partId')=='contacts' for p in A.ancestors(o))]:
        for o in reversed(list(owner.children_recursive)):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.objects.remove(owner,do_unlink=True)
    contacts=A.semantic('contacts',root)
    change=detail('switch-contact-mechanism','Inside this teaching cutaway, the hinged copper tongue touches the left or right fixed contact. Each fixed contact leads to a different strapper.',contacts)
    change['conceptualInternal']=True
    brass=A.material('BG812 contact carrier brass',(.57,.363,.142),.74,.31)
    silver=A.material('BG812 illustrative contact silver',(.75,.74,.73),.82,.22)
    def link(name,a,b,w,obj):
        a,b=Vector(a),Vector(b);d=b-a
        o=A.box(name,(a+b)/2,(w,.009,d.length),obj,brass,.0018)
        o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    pivot=(0,.712,-.055)
    link('From common clamp',(0,.766,-.088),pivot,.024,change)
    A.cyl('Common pivot',pivot,.012,.025,change,brass,vertices=28)
    for side in [-1,1]:
        x=side*.056
        link('Fixed brass strap',(x,.518,-.094),(x,.574,-.055),.019,change)
        o=A.cyl('Fixed silver contact',(side*.0487,.576,-.055),.010,.006,change,silver,vertices=24)
        o.rotation_euler.y=math.pi/2
    leaf=A.empty('Moving strapper tongue',change,pivot,data={'animation':'contact','axis':'z','onAngle':-.291,'offAngle':.291})
    A.box('Pivoted conducting tongue',(0,-.0675,0),(.009,.135,.015),leaf,brass,.002)
    end=A.cyl('Moving silver contact',(0,-.141,0),.009,.012,leaf,silver,vertices=24)
    end.rotation_euler.y=math.pi/2
