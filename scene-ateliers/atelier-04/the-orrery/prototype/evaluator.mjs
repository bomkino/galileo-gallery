const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
function modelMatrix(x,y,z,width,height,rotation=0){const c=Math.cos(rotation),s=Math.sin(rotation);return new Float32Array([c*width,s*width,0,0,-s*height,c*height,0,0,0,0,1,0,x,y,z,1]);}
export function evaluateOrrery({timeMs=0,reducedMotion=false,count=18,width=1920,height=1080,ringSpread=1,ringTilt=8,primaryScale=1.55,ringTurns=[1,-2,3],direction='forward'}={}){
  const safeCount=Math.max(1,Math.min(72,Math.round(number(count,18))));
  const safeTime=number(timeMs,0),safeWidth=Math.max(1,number(width,1920)),safeHeight=Math.max(1,number(height,1080));
  const spread=clamp(number(ringSpread,1),.7,1.8),tilt=clamp(number(ringTilt,8),-24,24)*Math.PI/180,primarySize=clamp(number(primaryScale,1.55),1.1,2.1);
  const defaults=[1,-2,3];
  const turns=defaults.map((fallback,index)=>{const rounded=Math.round(number(ringTurns[index],fallback));return rounded===0?fallback:clamp(rounded,-6,6)});
  const sign=direction==='reverse'?-1:1;
  if(safeCount===1){const matrix=modelMatrix(0,0,3.1,primarySize*1.25,primarySize*.78,0);return{phase:0,primary:0,blend:0,items:[{id:'body-0',atlasIndex:0,opacity:.9,ring:0,x:0,y:0,z:3.1,scale:primarySize,rotation:0,matrix}]};}
  let phase,primary,blend;
  if(reducedMotion){
    const step=modulo(sign*Math.floor(safeTime/2000),safeCount);
    phase=step/safeCount;
    primary=step;
    blend=0;
  }else{
    phase=modulo(sign*(safeTime/10000),1);
    const exchange=phase*safeCount;
    primary=Math.floor(exchange)%safeCount;
    blend=smooth(exchange-Math.floor(exchange));
  }
  const aspect=safeWidth/safeHeight,centreZ=3.1,ringScale=.52;
  const items=[];
  for(let index=0;index<safeCount;index+=1){
    const ring=index%3;
    const base=index/safeCount*Math.PI*2;
    const angle=base+phase*Math.PI*2*turns[ring];
    const radius=(1.05+(ring+1)*.75)*spread;
    const ringX=Math.cos(angle)*radius/aspect;
    const ringY=Math.sin(angle)*radius*(.48*Math.cos(tilt));
    const ringZ=-.55*(ring+1)+Math.sin(angle*.7)*.3+Math.sin(angle)*Math.sin(tilt)*.25;
    let x=ringX,y=ringY,z=ringZ,scale=ringScale;
    if(index===primary){
      x=ringX*blend;
      y=ringY*blend;
      z=centreZ+(ringZ-centreZ)*blend;
      scale=primarySize+(ringScale-primarySize)*blend;
    }else if(index===(primary+1)%safeCount){
      x=ringX*(1-blend);
      y=ringY*(1-blend);
      z=ringZ+(centreZ-ringZ)*blend;
      scale=ringScale+(primarySize-ringScale)*blend;
    }
    const rotation=-angle*.06;
    items.push({id:`body-${index}`,atlasIndex:index%64,opacity:.9,ring,x,y,z,scale,rotation,matrix:modelMatrix(x,y,z,scale*1.25,scale*.78,rotation)});
  }
  return{phase,primary,blend,items};
}
