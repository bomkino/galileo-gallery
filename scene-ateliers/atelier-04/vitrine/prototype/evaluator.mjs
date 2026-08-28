const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
export function evaluateVitrine({timeMs=0,count=6,holdMs=1400,exchangeMs=760,approachDistance=.22,primaryScale=.62,axis='horizontal',direction='forward',reducedMotion=false}={}){
  const safeCount=Math.max(0,Math.min(24,Math.round(number(count,6))));
  const hold=clamp(number(holdMs,1400),600,6000),exchange=clamp(number(exchangeMs,760),280,1800),distance=clamp(number(approachDistance,.22),.1,.55),primary=clamp(number(primaryScale,.62),.42,.82),safeTime=number(timeMs,0);
  if(safeCount===0)return{durationMs:0,currentIndex:-1,nextIndex:-1,phase:'empty',progress:0,items:[]};
  if(safeCount===1)return{durationMs:hold+exchange,currentIndex:0,nextIndex:0,phase:'hold',progress:0,items:[{id:'frame-0',x:0,y:0,scale:primary,visible:true,role:'primary'}]};
  const phrase=hold+exchange,durationMs=phrase*safeCount,local=modulo(safeTime,durationMs),step=Math.floor(local/phrase),within=local-step*phrase,sign=direction==='reverse'?-1:1;
  const currentIndex=modulo(sign*step,safeCount),nextIndex=modulo(currentIndex+sign,safeCount);
  const raw=within<hold?0:(within-hold)/exchange;
  const progress=reducedMotion?(within<hold?0:1):smooth(raw);
  const currentOffset=-distance*progress*sign,nextOffset=distance*(1-progress)*sign;
  const current={id:`frame-${currentIndex}`,x:axis==='horizontal'?currentOffset:0,y:axis==='vertical'?currentOffset:0,scale:primary-primary*.18*progress,visible:progress<1,role:'outgoing'};
  const incoming={id:`frame-${nextIndex}`,x:axis==='horizontal'?nextOffset:0,y:axis==='vertical'?nextOffset:0,scale:primary*.82+primary*.18*progress,visible:progress>0||within>=hold,role:'incoming'};
  return{durationMs,currentIndex,nextIndex,phase:within<hold?'hold':'exchange',progress,items:[current,incoming]};
}
