import type {ComponentInstance,Parameters,TerminalRole,Wire} from './types.ts';

type Point=[string,string];
interface Bench {
  components:ComponentInstance[]; wires:Wire[];
  mains(id:string):void;
  add(type:string,id:string,label:string,params?:Parameters):string;
  wire(a:Point,b:Point,role?:TerminalRole):void;
}

/** Terminal IDs stay stable under inspection, reconnection and saved-document migration. */
export function wireElvLesson(b:Bench,id:number) {
  const add=(type:string,id:string,label:string,params:Parameters={},variant?:string)=>{
    b.add(type,id,label,params); if(variant)b.components[b.components.length-1].variant=variant;
  };
  const link=(a:Point,to:Point,role:TerminalRole='DC+')=>b.wire(a,to,role);
  const supply=(name='driver',label='24 V isolated DC driver',voltage=24,type='driver',params:Parameters={},variant?:string)=>{
    add(type,name,label,{outputVoltage:voltage,maxPower:100,...params},variant);b.mains(name);
  };
  const plus:Point=['driver','+'],minus:Point=['driver','-'];
  const lamp=(name:string,label:string,watts=12,voltage=24,variant='strip')=>add('led',name,label,{ratedVoltage:voltage,watts},variant);
  const contact=(name:string,label:string,from:Point=plus,closed=true,variant?:string)=>{add('switch',name,label,{closed},variant);link(from,[name,'COM']);};
  const push=(name:string,label:string,from:Point,role:TerminalRole='control')=>{add('pushbutton',name,label,{pressed:false},'bell-push');link(from,[name,'COM'],role);};
  const relay=(name:string,voltage:number)=>add('relay',name,'Changeover relay',{ratedVoltage:voltage,coilWatts:1.2});
  const tx=()=>supply('tx','12 V AC bell transformer',12,'transformer');
  const ac1:Point=['tx','+'],ac2:Point=['tx','-'];
  const ac=(a:Point,to:Point)=>link(a,to,'output');
  const bell=(name:string,label:string)=>add('chime',name,label,{watts:3,ratedVoltage:12,doubleInsulated:true});
  if(![70,71,72,75,80].includes(id)) supply();
  switch(id){
    case 65:
      contact('door','Cupboard door contact',plus,true,'door-contact');
      lamp('strip','Cupboard strip');link(['door','OUT'],['strip','L']);link(minus,['strip','N'],'DC-');break;
    case 66:
      for(const side of ['left','right']){
        contact(side+'-switch',side+' worktop switch');lamp(side,side+' strip');
        link([side+'-switch','OUT'],[side,'L']);link(minus,[side,'N'],'DC-');
      }break;
    case 67:
      lamp('near','Near section');lamp('far','Far section');
      link(plus,['near','L']);link(minus,['near','N'],'DC-');
      for(const [pin,role] of [['L','DC+'],['N','DC-']] as const){
        link(['near',pin],['far',pin],role);b.wires[b.wires.length-1].resistance=2;
      }
      add('isolator','inject','Extra feed switch',{closed:false});
      link(plus,['inject','LIN']);link(minus,['inject','NIN'],'DC-');
      link(['inject','LOUT'],['far','L']);link(['inject','NOUT'],['far','N'],'DC-');break;
    case 68:case 69:{
      const two=id===69,ctrl=two?'controller':'pwm';
      add('pwmcontrol',ctrl,two?'Warm / cool controller':'Pulse dimmer',{level:two?1:.5,mix:.5},two?'tunable-white':'single-channel');
      link(plus,[ctrl,'+']);link(minus,[ctrl,'-'],'DC-');
      if(two){
        add('cctstrip','tape','Warm and cool LED tape');
        link([ctrl,'+'],['tape','+']);link([ctrl,'W'],['tape','W'],'control');link([ctrl,'C'],['tape','C'],'control');
      }else{lamp('strip','Dimmable strip');link([ctrl,'+'],['strip','L']);link([ctrl,'W'],['strip','N'],'control');}break;
    }
    case 70:
      supply('cc','350 mA constant-current driver',30,'driver',{mode:'constant-current',outputCurrent:.35,maxPower:15},'constant-current');
      lamp('first','First series module',3.15,9,'series-module');lamp('second','Second series module',3.15,9,'series-module');
      link(['cc','+'],['first','L']);contact('link','Removable series link',['first','N']);
      link(['link','OUT'],['second','L']);link(['second','N'],['cc','-'],'DC-');break;
    case 71:
      tx();bell('bell','Shared 12 V AC chime');for(const name of ['front','rear']){push(name,name+' bell push',ac1,'output');ac([name,'NO'],['bell','L']);}
      ac(ac2,['bell','N']);break;
    case 72:
      tx();add('callchime','chime','Two-input AC chime');ac(ac1,['chime','AC1']);ac(ac2,['chime','AC2']);
      for(const [name,input] of [['front','FRONT'],['back','REAR']]){push(name,name+' door push',ac1,'output');ac([name,'NO'],['chime',input]);}break;
    case 73:
      add('timer','hold','Call light timer · 4 s',{ratedVoltage:24,mode:'off-delay',on:true,demand:true,delay:4,requireInput:true});
      push('call','Call button',plus);lamp('beacon','Call beacon',3);
      link(plus,['hold','L']);link(minus,['hold','N'],'DC-');link(['call','NO'],['hold','IN'],'control');
      link(['hold','OUT'],['beacon','L'],'control');link(minus,['beacon','N'],'DC-');break;
    case 74:{
      contact('door','Door contact · closes on opening',plus,false,'door-contact');
      const request:Point=['door','OUT'];lamp('lamp','Door-open indicator',3);
      add('chime','buzzer','Door buzzer · 24 V DC',{ratedVoltage:24,watts:3,doubleInsulated:true});
      relay('memory',24);push('ack','Acknowledge warning',request);
      link(request,['lamp','L']);link(minus,['lamp','N'],'DC-');link(request,['memory','COM']);
      link(['memory','NC'],['buzzer','L'],'control');link(minus,['buzzer','N'],'DC-');
      link(['ack','NO'],['memory','A1'],'control');link(['memory','NO'],['memory','A1'],'control');link(minus,['memory','A2'],'DC-');break;
    }
    case 75:
      supply('supply-a','Thermostat supply',24,'dcsupply');supply('equipment','Supply for the second circuit',24,'dcsupply');
      add('thermostat','stat','Room thermostat',{closed:true,temperature:18,setpoint:21});relay('interface',24);lamp('call','Heat call indicator',3);
      link(['supply-a','+'],['stat','COM']);link(['stat','OUT'],['interface','A1'],'control');link(['supply-a','-'],['interface','A2'],'DC-');
      link(['equipment','+'],['interface','COM']);link(['interface','NO'],['call','L'],'control');link(['equipment','-'],['call','N'],'DC-');break;
    case 76:
      contact('enable','Allow valve movement');add('selector','direction','Open / close selector',{position:0});
      add('floatvalve','actuator','24 V three-point valve actuator',{travel:4});
      link(['enable','OUT'],['direction','COM']);link(['direction','A'],['actuator','OPEN'],'control');link(['direction','B'],['actuator','CLOSE'],'control');link(minus,['actuator','COM'],'DC-');break;
    case 77:
      add('selector','float','Condensate float · normal / high',{position:0},'float-changeover');
      lamp('permit','Run indicator',3);lamp('alarm','High water warning light',3);
      link(plus,['float','COM']);link(['float','A'],['permit','L'],'control');link(['float','B'],['alarm','L'],'control');
      link(minus,['permit','N'],'DC-');link(minus,['alarm','N'],'DC-');break;
    case 78:
      add('proximity','sensor','Inductive proximity sensor · PNP',{active:false});
      lamp('pilot','Target indicator',1.5);link(plus,['sensor','+']);link(minus,['sensor','-'],'DC-');
      link(['sensor','OUT'],['pilot','L'],'control');link(minus,['pilot','N'],'DC-');break;
    case 79:
      add('terminal','distribution','Positive distribution connector',{},'lever-connector');link(plus,['distribution','1']);
      for(const [i,name] of ['instrument','beacon'].entries()){
        add('fuse',name+'-fuse',name+' branch carrier · 1 A',{closed:true,currentRating:1},'dc-fuse');lamp(name,name+' indicator',3);
        link(['distribution',String(i+2)],[name+'-fuse','IN']);link([name+'-fuse','OUT'],[name,'L']);link(minus,[name,'N'],'DC-');
      }break;
    case 80:
      tx();supply();push('push','Entrance bell push',ac1,'output');bell('bell','Entrance AC chime');relay('interface',12);lamp('courtesy','Courtesy light',8);
      ac(['push','NO'],['bell','L']);ac(ac2,['bell','N']);ac(['push','NO'],['interface','A1']);ac(ac2,['interface','A2']);
      link(plus,['interface','COM']);link(['interface','NO'],['courtesy','L'],'control');link(minus,['courtesy','N'],'DC-');break;
    default:throw Error('Unknown extra-low-voltage exercise '+id);
  }
}
