"""Service side of an original 3015E-style B22d study fitting.

The 3015E section shows a hollow spun back, bayonet slits and a bonded earth lug.
The BC7/BC8 photos show the divided ceramic insert. Wire guides and clamp-screw
positions are a service cutaway at the lab's existing L/N/PE entry positions.
"""
import math
import bpy
from mathutils import Vector


def make_holder(A, body, lampaxis, recipe, detail, clamp_owner, screw, materials):
    brass, zinc, ceramic = materials
    copper = A.material('B22 seated copper', (.62,.285,.114), .78, .32)
    shell = detail('b22-spun-back',
                   'The hollow brass neck opens into the wiring cavity. The paired slots at its other end retain the lamp cap pins.',
                   body)

    # The mounting rim faces the wall while the neck faces 45° forwards.
    # Join the inner and outer profiles into ONE hollow spun shell.
    profile = [
        (.169,.270,-.131,0),(.177,.270,-.119,0),(.173,.271,-.102,4),
        (.158,.277,-.081,10),(.151,.287,-.061,18),
        (.141,.303,-.039,30),(.127,.323,-.020,40),(.122,.337,-.009,45),
    ]
    loops = profile + [(r-.008,cy,cz+.001,angle) for r,cy,cz,angle in reversed(profile)]
    vertices=[];faces=[];n=56
    for r,cy,cz,angle in loops:
        theta=math.radians(angle)
        for i in range(n):
            s=r*math.sin(math.tau*i/n)
            vertices.append((r*math.cos(math.tau*i/n),cy+s*math.cos(theta),cz-s*math.sin(theta)))
    for j in range(len(loops)):
        k=(j+1)%len(loops)
        for i in range(n):
            h=(i+1)%n
            faces.append((j*n+i,j*n+h,k*n+h,k*n+i))
    mesh=bpy.data.meshes.new('Spun angle back cross-section')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    cup=bpy.data.objects.new('Hollow dished brass back',mesh)
    bpy.context.collection.objects.link(cup);A.setmesh(cup,shell,brass)
    shell['preservePlanarLod']=True

    barrel=detail('b22-bayonet-shell',
                  'The two opposed slots take the side pins of the cap. Two sprung contacts at the bottom supply the lamp.',
                  lampaxis)
    wall=A.cyl('Bayonet barrel', (0,.181,0), .135,.252,barrel,brass,False,64)
    A.boolean_difference(wall,A.cyl('Open socket bore',(0,.181,0),.1265,.29,barrel,None,False,64))
    for sign in (-1,1):
        # Cut the axial opening and its lateral locking seat only into this side.
        A.boolean_difference(wall,A.box('Pin entry slit',(sign*.128,.267,sign*.044),(.045,.14,.036),barrel,None,0))
        A.boolean_difference(wall,A.box('Bayonet locking step',(sign*.128,.200,sign*.022),(.046,.047,.090),barrel,None,.003))
    for y,r in [(.058,.137),(.074,.148),(.142,.151),(.157,.134)]:
        A.torus('Rolled collar edge',(0,y,0),r,.008,barrel,brass,False)
    collar=A.cyl('Ribbed shade ring',(0,.109,0),.154,.061,barrel,brass,False)
    A.boolean_difference(collar,A.cyl('Shade ring bore',(0,.109,0),.131,.086,barrel,None,False))
    for i in range(54):
        a=math.tau*i/54
        A.box('Shade ring straight knurl',(.154*math.sin(a),.109,.154*math.cos(a)),(.006,.052,.006),
              barrel,brass,.0014).rotation_euler.y=a
    for y in (.160,.171):
        A.torus('Rolled threaded shade barrel',(0,y,0),.136,.0025,barrel,brass,False)

    insert=detail('ceramic-terminal-insert',
                  'Two separate brass contacts sit in the divided ceramic insert. The separate earth lug bonds to the metal shell.',
                  body)
    insert['preservePlanarLod']=True
    # The lamp looks down onto a porcelain floor. Without it, the open head
    # incorrectly shows daylight straight through the body around the plungers.
    carrier=A.empty('Porcelain lamp face',insert,(0,.306,-.068))
    carrier.rotation_euler.x=math.pi/4
    floor=A.cyl('Ceramic button carrier',(0,.053,0),.131,.034,carrier,ceramic,False,64)
    for x in (-.0574,.0574):
        A.boolean_difference(floor,A.cyl('Spring button clearance',(x,.053,0),.022,.061,carrier,None,False,36))
    A.box('Insulating bridge between buttons',(0,.076,0),(.019,.022,.121),carrier,ceramic,.004)
    cy=.278
    disc=A.cyl('Recessed keyed porcelain insert',(0,cy,-.064),.111,.080,insert,ceramic,vertices=60)
    for side in [-1,1]:
        A.boolean_difference(disc,A.cyl('Ceramic key scallop',(side*.114,cy,-.065),.014,.114,insert,None))
    A.boolean_difference(disc,A.cyl('Clearance around separate earth assembly',(0,.397,-.064),.048,.14,insert,None,vertices=40))
    A.box('Raised porcelain separator',(0,.283,-.105),(.029,.142,.027),insert,ceramic,.009)
    for t in recipe['terminals']:
        id=t['id'];x,y,_=t['anchor'];earth=id=='PE'
        if earth:
            # This terminal is bonded to the turned brass neck. Keep it visibly
            # outside the ceramic, and do not run a third contact to the cap.
            strap=detail('b22-earth-bond','The turned earth block is riveted to a separate brass lug on the shell. It has no route to either spring contact.',body)
            A.box('Folded brass foot',(0,.420,-.118),(.062,.068,.014),strap,brass,.004)
            A.box('Return lip riveted to mounting flange',(0,.441,-.124),(.063,.024,.018),strap,brass,.004)
            A.cyl('Brass bonding rivet',(0,.438,-.129),.012,.016,strap,brass,vertices=28)
        else:
            # Separate wire and tool openings are physically bored in the
            # ceramic. Each pillar continues to one bayonet button.
            for yy,r in [(y,.026),(y+.037,.023)]:
                A.boolean_difference(disc,A.cyl('Open porcelain tunnel',(x,yy,-.058),r,.15,insert,None,vertices=36))
        g=clamp_owner(t,
            'The earth wire is held in this brass block, bonded to the metal shell.' if earth else
            'The bare wire ends inside this pillar. Its separate recessed screw presses on the wire. The ceramic separates this contact from its neighbour.')
        # The oriented terminal empties use local +Z toward the wiring side.
        # Its local -Z therefore goes into the fitting. Wire insulation ends
        # at the pillar mouth; the occupied tip continues inside that bore.
        mouth=-.146 if earth else -.098
        inset=mouth+.180
        boss=A.cyl('Turned brass terminal pillar',(0,.016,-inset-.019),.028,.085,g,brass,False,40)
        A.boolean_difference(boss,A.cyl('Cross drilled wire bore',(0,0,-inset-.018),.0193,.09,g,None,vertices=32))
        A.boolean_difference(boss,A.cyl('Open screwdriver well',(0,.036,-inset+.003),.020,.031,g,None,vertices=32))
        # The diagnostic screws are approachable from the service side even
        # when a circuit wire fills the adjacent conductor bore.
        tool=A.empty('Recessed clamp screw',g,(0,.036,-inset-.004),data={
            'detailId':'b22-probe-'+id,
            'detailPurpose':'The probe touches the head of this clamp screw. The adjacent hole takes the insulated conductor.',
            'probeTerminal':id,'keepDistanceSurface':True})
        screw(tool,(0,0),0,.0185,False,.28 if earth else -.31)
        A.cyl('Screw shank',(0,0,-.022),.009,.04,tool,zinc,vertices=24)
        # Each terminal owns real material through its empty opening.
        A.cyl('Pillar contact face inside bore',(0,0,-inset-.047),.0179,.006,g,brass,vertices=32)
        seat=detail('b22-insert-'+id,
                    'The stripped conductor begins where its insulation ends at the pillar and sits inside the real drilled opening.',g)
        seat['occupiedTerminal']=id;seat['keepDistanceSurface']=True
        A.cyl('Copper held inside pillar',(0,0,-inset-.020),.008,.040,seat,copper,vertices=24)
        if not earth:
            # The pads on the B22d cap are independent of its nickel shell.
            # A separate spring-backed button reaches each pad when installed.
            side=-1 if x<0 else 1
            target_x=side*.0574
            target_y=.306+.036/math.sqrt(2)
            target_z=-.068+.036/math.sqrt(2)
            local=(x-target_x,target_y-y,-(target_z+.180))
            start=Vector((0,.020,-inset-.044))
            end=Vector(local)
            tongue=A.cyl('Tail of spring contact',(start+end)*.5,.013,(end-start).length,g,brass,vertices=24)
            tongue.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler()
            button=A.empty('Spring button guide',g,local)
            button.rotation_euler.x=math.pi/4
            A.cyl('Gilt spring contact shank',(0,0,-.027),.011,.053,button,brass,vertices=24)
            A.cyl('Bayonet cap contact button',(0,0,-.052),.020,.017,button,brass,vertices=36)
            for at in (.005,.013,.021,.029,.037):
                A.torus('Contact return spring',(0,0,-at),.016,.0024,button,zinc)
