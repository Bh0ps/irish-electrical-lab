"""Physical identification and service-entry details for the training bench.

All coordinates here are in the original Y-up recipe frame. No product logo,
approval mark, fixed current rating or manufacturer terminal number is copied.
"""
import math


def add_service_details(recipe, root, api):
    kind = recipe['component']['type']
    family = recipe['definition']['model']
    frame = api.empty('Service access and identification',root,
                      scale=tuple(a/b for a,b in zip(recipe['definition']['size'],(1.3,1.45,.85))))
    owner = api.empty('Installation details',frame,data={'detailId':'installation-details','partId':'mounting','detailPurpose':'The surface identification, cable entry, or mounting features help recognise this physical equipment variant and orient it on the bench.'})
    paper=api.material('Printed ivory identification',(.85,.87,.83),0,.52)
    ink=api.material('Graphite service markings',(.018,.025,.031),0,.60)
    silver=api.material('Embossed metal finish',(.45,.48,.48),.72,.35)
    rubber=api.material('Cable-entry elastomer',(.029,.034,.034),0,.78)
    def words(s,p,mat=ink,size=.042):
        return api.label(s,p,owner,mat,size)
    def mark(text,x,y,z,width):
        api.box('Identification insert',(x,y,z),(width,.082,.009),owner,paper,.003)
        return words(text,(x,y,z+.005),size=min(.048,width/(max(1,len(text))*.7)))
    def gland(x,y,z,r):
        api.torus('Retaining lip',(x,y,z),r,.010,owner,silver)
        api.torus('Compression seal',(x,y,z+.008),r*.73,.014,owner,rubber)
    def legend_under_screw(term):
        # Entry orientation and visible terminal IDs come from the exact circuit variant.
        node=next(n for n in root.children_recursive if n.get('terminalId')==term['id'])
        node['entryDirection']=term['entryDirection']
        node['fieldMarking']=term['label']
        if term['role']=='PE':
            # Narrow green/yellow bands denote the separate protective connection.
            green=api.material('Protective marker green',(.033,.32,.096),0,.5)
            yellow=api.material('Protective marker yellow',(.79,.67,.03),0,.5)
            for side,mat in ((-.029,green),(.029,yellow)):
                api.box('Protective identification band',(side,-.031,.002),(.057,.015,.009),node,mat,.002)
    for term in recipe['terminals']:legend_under_screw(term)
    # The service legend on small mechanisms sits on the actual insulating
    # carrier; an enclosure-sized gland would be detached from a heating mat,
    # downlight, immersed element head or compact switching supply.
    seated_marker = family in ('lamp','transformer','heater','appliance','vfd','plc','charger','junction','fan') or kind in ('chime','cutout')
    if seated_marker:
        terminal=next(n for n in root.children_recursive if n.get('terminalId')==recipe['terminals'][0]['id'])
        owner.parent=terminal
        api.box('Insulating alignment cheek',(-.068,.022,-.048),(.019,.092,.074),owner,paper,.003)
        for y in (.004,.018,.032):
            api.box('Raised grip rib',(-.079,y,-.032),(.005,.005,.038),owner,rubber,.001)
    elif family=='protection':
        # Separate shroud cheeks surround the brass cage and leave the
        # actual screw and conductor aperture open on its installation axis.
        shroud=api.material('Moulded screw shroud',(.76,.78,.76),0,.40)
        for t in recipe['terminals']:
            node=next(n for n in root.children_recursive if n.get('terminalId')==t['id'])
            for x in (-.082,.082):
                api.box('Finger guard cheek',(x,.024,-.039),(.029,.157,.150),node,shroud,.008)
            api.box('Terminal shroud bridge',(0,.100,-.072),(.190,.020,.092),node,shroud,.004)
        face=next((o for o in root.children_recursive if o.get('partId')=='cover' and o.get('restPosition')),None)
        if face:
            # The insert travels with the cover through all inspection presentations.
            owner.parent=face
            title={'mcb':'MCB','mcb3':'MCB  3P','rcd':'RCCB','rcd3':'RCCB  4P','rcbo':'RCBO','spd':'SPD','fuse':'FUSE'}[kind]
            words(title,(0,.219,.038),size=.059)
            if kind not in ('spd','fuse'):
                for text,y in (('I',.094),('O',-.099)):words(text,(-(.28 if kind in ('rcbo','rcd','rcd3','mcb3') else .19),y,.032),size=.044)
            if kind in ('rcd','rcd3','rcbo'):
                width=.8
                button=next((o for o in face.children_recursive if o.get('partId')=='test'),None)
                if button:api.label('T',(width*.27,-.205,.080),button,paper,.055)
            if kind in ('rcd','rcd3','rcbo','mcb','mcb3','fuse'):
                # The renderer writes the current circuit rating into this plate.
                target=api.empty('Live exercise rating',face,(0,-.205,.041),data={'ratingPlate':True})
                target.location.x=-.095 if kind in ('rcbo','rcd','rcd3') else 0
                api.box('Rating window',(0,0,0),(.27,.068,.009),target,paper,.003)
    elif family=='switch':
        if kind in ('dimmer','selector'):
            for i in range(7):
                a=(-.77+i*.255)*math.pi
                bar=api.box('Moulded position pip',(.254*math.sin(a),.75+.254*math.cos(a),.316),(.012,.031,.008),owner,ink,.002)
                bar.rotation_euler.z=-a
        elif kind=='pushbutton':
            mark('STOP' if 'stop' in recipe['key'] else 'START',0,.405,.31,.35)
        elif kind in ('isolator','isolator3','changeover'):
            mark('I  –  O' if kind!='changeover' else 'I  –  II',0,1.016,.30,.32)
        else:
            # Flush wall plates are clean on the operating side. The connection
            # arrangement is moulded into the back of the mechanism.
            text='COM / L1 / L2' if kind=='switch2' else 'A B / C D' if kind=='intermediate' else 'COM / L1'
            o=words(text,(0,.695,-.30),size=.04)
            o.rotation_euler.y=math.pi
    elif family=='instrument':
        if kind=='clamp':
            words('A ~',(0,.45,.197),paper,.042)
            words('→',(0,1.265,.061),paper,.055)
        else:
            for x,s in ((-.21,'V Ω'),(0,'COM'),(.21,'A')):words(s,(x,.373,.182),paper,.044)
            for a,s in ((-.95,'OFF'),(-.37,'V ~'),(.37,'Ω'),(.95,'A ~')):
                words(s,(.233*math.sin(a),.635+.235*math.cos(a),.183),paper,.039)
    elif family=='conduit':
        if 'trunking' in recipe['key']:
            # Cable duct witness lines show where the removable cap clips into the fingers.
            for x in (-.45,.45):api.box('Cap closure witness',(x,.449,.182),(.066,.017,.007),owner,ink,.002)
        else:
            for a in range(6):
                t=a*math.pi/3
                api.box('Compression-nut grip rib',(.30+.107*math.cos(t),1.145,.107*math.sin(t)),(.013,.086,.013),owner,rubber,.002)
    elif family=='cable':
        for i in range(3):
            ring=api.torus('Raised sheath identification',(-.48+i*.037,.60,0),.18,.003,owner,ink)
            ring.rotation_euler.y=math.pi/2
    elif family in ('contactor','overload'):
        mark('95  NC  96' if family=='overload' else ('A1   A2' if kind=='relay' else '1/L1   3/L2   5/L3'),0,1.024,.254,.62)
    elif family in ('vfd','plc','inverter','charger'):
        mark({'vfd':'DRIVE','plc':'SAFETY' if kind=='safetyRelay' else 'I/O','inverter':'BACKUP' if kind=='battery' else 'GRID AC','charger':'EV'}[family],0,.375,.326,.41)
        gland(.24,.276,.264,.044)
    elif family=='valve':
        gland(.34,.585,.045,.053)
        mark('A   B   AB' if kind=='valve3' else 'A   B',0,.315,.188,.32)
    elif family in ('motor','pump','fan'):
        for x in (-.2,.2):api.cyl('Terminal housing fixing',(x,1.04,.112),.021,.012,owner,silver)
        if kind=='motor3':words('U1   V1   W1',(-.03,1.115,.144),paper,.032)
    elif family in ('supply','meter','panel'):
        if family=='panel':mark('DB',-.20,.38,.289,.28)
        else:
            face=next(o for o in root.children_recursive if o.get('partId')=='cover' and o.get('restPosition'))
            text='kWh' if family=='meter' else 'SUPPLY'
            plate=api.empty('Service identification',face)
            api.box('Printed service legend',(0,-.296,.035),(.26,.056,.007),plate,paper,.002)
            api.label(text,(0,-.296,.041),plate,ink,.034)
            if family=='supply':
                owner.parent=plate
                api.box('Moulded datum beside legend',(-.121,-.294,.043),(.009,.03,.005),owner,ink,.001)
        if kind=='meter':
            api.box('Insulated meter tail chamber',(0,.285,.185),(.77,.174,.102),owner,rubber,.012)
            api.box('Separate protective-link support',(.54,.37,.125),(.18,.36,.091),owner,rubber,.008)
            api.box('Continuous earth link beside metering circuit',(.54,.37,.181),(.064,.21,.021),owner,silver,.003)
    elif family in ('heater','appliance','transformer','controller','sensor','alarm','bar','junction','lamp','socket','plug'):
        # Realistic retaining ring at the service entry instead of an extra
        # front connector. On wall accessories this lives inside the back box.
        if family in ('socket','plug','lamp','sensor','controller','alarm'):
            gland(.16,.47,-.15,.032)
        elif family=='bar':
            for x in (-.45,.45):api.cyl('Support fixing head',(x,.45,.098),.024,.012,owner,silver)
        elif family=='junction':gland(.19,.41,.066,.041)
        elif family=='transformer':mark('PRI        SEC',0,.26,.196,.45)
        elif family in ('appliance','heater'):gland(.23,.35,-.175,.046)
    return 'installation-details'
