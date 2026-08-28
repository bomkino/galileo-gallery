const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
export function evaluateZoetrope({timeMs=0,count=10,advanceMs=420,holdMs=700,direction='forward',radius=3.1,reducedMotion=false}={}){
  const safeCount=Math.max(0,Math.min(64,Math.round(number(count,10))));
  const safeAdvance=clamp(number(advanceMs,420),160,900);
  const safeHold=clamp(number(holdMs,700),250,1800);
  const safeRadius=clamp(number(radius,3.1),1.6,4.8);
  const safeTime=number(timeMs,0);
  if(safeCount===0)return{durationMs:0,index:-1,phase:'empty',turn:0,items:[]};
  if(safeCount===1)return{durationMs:safeAdvance+safeHold,index:0,phase:'hold',turn:0,items:[{id:'frame-0',angle:0,x:0,z:safeRadius,front:true,visible:true}]};
  const stepMs=safeAdvance+safeHold;
  const durationMs=stepMs*safeCount;
  const local=modulo(safeTime,durationMs);
  const index=Math.floor(local/stepMs);
  const within=local-index*stepMs;
  const sign=direction==='reverse'?-1:1;
  const progress=within<safeAdvance?smooth(within/safeAdvance):1;
  const turn=reducedMotion?sign*Math.round(index+progress):sign*(index+progress);
  const items=Array.from({length:safeCount},(_,itemIndex)=>{
    const angle=(itemIndex-turn)/safeCount*Math.PI*2;
    const x=Math.sin(angle)*safeRadius;
    const z=Math.cos(angle)*safeRadius;
    return{id:`frame-${itemIndex}`,angle,x,z,front:z>=0,visible:z>-safeRadius*.78};
  });
  return{durationMs,index,phase:within<safeAdvance?'advance':'hold',turn,items};
}
