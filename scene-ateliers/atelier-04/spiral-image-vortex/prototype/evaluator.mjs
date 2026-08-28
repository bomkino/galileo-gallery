const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
function modelMatrix(x,y,z,width,height,rotation=0){const c=Math.cos(rotation),s=Math.sin(rotation);return new Float32Array([c*width,s*width,0,0,-s*height,c*height,0,0,0,0,1,0,x,y,z,1]);}
export function evaluateVortex({timeMs=0,reducedMotion=false,count=24,width=1920,height=1080,radius=2.3,pitch=6.2,turns=2.75,planeScale=.9,direction='forward'}={}){
  const safeCount=Math.max(1,Math.min(96,Math.round(number(count,24))));
  const safeTime=number(timeMs,0),safeWidth=Math.max(1,number(width,1920)),safeHeight=Math.max(1,number(height,1080));
  const safeRadius=clamp(number(radius,2.3),1.4,4.2),safePitch=clamp(number(pitch,6.2),3.8,9.2),safeTurns=clamp(number(turns,2.75),1.5,4.5),safeScale=clamp(number(planeScale,.9),.45,1.4);
  const sign=direction==='reverse'?-1:1;
  const rawPhase=reducedMotion?Math.round(safeTime/1250)/8:safeTime/10000;
  const phase=modulo(sign*rawPhase,1);
  const aspect=safeWidth/safeHeight;
  const items=[];
  for(let index=0;index<safeCount;index+=1){
    const u=modulo(index/safeCount-phase+.5,1)-.5;
    const theta=u*Math.PI*2*safeTurns;
    const x=Math.sin(theta)*safeRadius/aspect;
    const y=u*safePitch;
    const z=Math.cos(theta)*safeRadius;
    const opacity=clamp((.5-Math.abs(u))/.08,0,1);
    const depth=(z+safeRadius)/(2*safeRadius);
    const scale=safeScale*(.82+.18*(1-depth));
    items.push({id:`frame-${index}`,atlasIndex:index%64,opacity,u,theta,x,y,z,width:1.25*scale,height:.78*scale,rotation:-theta*.08,matrix:modelMatrix(x,y,z,1.25*scale,.78*scale,-theta*.08)});
  }
  return{phase,items};
}
