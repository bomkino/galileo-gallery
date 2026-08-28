const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const modulo=(value,divisor)=>((value%divisor)+divisor)%divisor;
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
const mix=(a,b,t)=>a+(b-a)*t;
export function evaluateShelf({timeMs=0,ratios=[1.78,.66,1,.8,1.5,.56,1.2,.72],stageWidth=1920,stageHeight=1080,editionHeight=.42,gap=40,perspectiveDeg=18,paceMs=820,shelfHeight=.69,spotlightIndex=-1,spotlightStartMs=4000,seekMs=700,holdMs=800,releaseMs=700,finaleMs=800,lift=.11,reducedMotion=false,direction='forward'}={}){
  const sourceRatios=Array.isArray(ratios)?ratios:[];
  const safeRatios=sourceRatios.slice(0,127).map(value=>clamp(number(Number(value),1),.2,5));
  const count=safeRatios.length,safeWidth=Math.max(1,number(stageWidth,1920)),safeHeight=Math.max(1,number(stageHeight,1080));
  const height=safeHeight*clamp(number(editionHeight,.42),.24,.62),safeGap=clamp(number(gap,40),8,180),baseline=safeHeight*clamp(number(shelfHeight,.69),.55,.82);
  if(count===0)return{durationMs:0,phase:'empty',pathLength:0,offset:0,items:[]};
  const widths=safeRatios.map(ratio=>height*ratio);
  if(count===1){const width=widths[0],x=safeWidth/2-width/2,y=baseline-height;return{durationMs:Math.max(1000,number(paceMs,820)),phase:'still',pathLength:0,offset:0,items:[{id:'frame-0',index:0,width,height,x,y,yaw:0,scale:1,z:1,visible:true}]};}
  const starts=[];let contentLength=0;for(const width of widths){starts.push(contentLength);contentLength+=width+safeGap}
  const maxWidth=Math.max(...widths),offstageLead=safeWidth+maxWidth+safeGap,period=contentLength+offstageLead*2;
  const pace=clamp(number(paceMs,820),240,2400),averageStride=contentLength/count,speed=averageStride/pace;
  const start=Math.max(0,number(spotlightStartMs,4000)),seek=Math.max(1,number(seekMs,700)),hold=Math.max(0,number(holdMs,800)),release=Math.max(1,number(releaseMs,700)),finale=Math.max(0,number(finaleMs,800)),active=seek+hold+release,safeTime=Math.max(0,number(timeMs,0));
  const selectedIndex=Number.isInteger(spotlightIndex)&&spotlightIndex>=0&&spotlightIndex<count?spotlightIndex:-1;
  let travelTime=safeTime,phase='travel',spotProgress=0;
  if(reducedMotion){
    travelTime=0;
    if(selectedIndex>=0&&safeTime>=start&&safeTime<start+seek+hold){phase='spotlight-hold';spotProgress=1}
    else if(selectedIndex>=0&&safeTime>=start+seek+hold&&safeTime<start+active+finale)phase='finale';
    else phase='tableau';
  }else if(selectedIndex>=0){
    if(safeTime<start)travelTime=safeTime;
    else if(safeTime<start+active){
      travelTime=start;
      const local=safeTime-start;
      if(local<seek){phase='spotlight-seek';spotProgress=smooth(local/seek)}
      else if(local<seek+hold){phase='spotlight-hold';spotProgress=1}
      else{phase='spotlight-release';spotProgress=smooth(1-(local-seek-hold)/release)}
    }else{
      travelTime=safeTime-active;
      if(safeTime<start+active+finale)phase='finale';
    }
  }
  const sign=direction==='reverse'?-1:1,offset=modulo(sign*travelTime*speed,period),perspective=clamp(number(perspectiveDeg,18),0,32),focusLift=safeHeight*clamp(number(lift,.11),.04,.24);
  const items=widths.map((width,index)=>{
    const baseX=modulo(starts[index]-offset+offstageLead,period)-offstageLead;
    const centre=baseX+width/2,normalized=clamp((centre-safeWidth/2)/(safeWidth*.5),-1,1),baseYaw=-normalized*perspective,selected=index===selectedIndex;
    const x=selected?mix(baseX,safeWidth/2-width/2,spotProgress):baseX;
    const y=baseline-height-(selected?focusLift*spotProgress:0);
    const yaw=selected?mix(baseYaw,0,spotProgress):baseYaw;
    const scale=selected?1+.08*spotProgress:1;
    const overscan=Math.max(80,maxWidth*.25),visible=x+width>-overscan&&x<safeWidth+overscan;
    return{id:`frame-${index}`,index,width,height,x,y,yaw,scale,z:selected&&spotProgress>0?100:Math.round((1-Math.abs(normalized))*50),visible};
  });
  return{durationMs:period/speed,phase,pathLength:period,offset,items};
}
