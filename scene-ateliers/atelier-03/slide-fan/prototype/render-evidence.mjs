import fs from "node:fs"
import path from "node:path"
import {DEFAULTS,FIXTURES,CANVASES,evaluate,canonicalSnapshot} from "./evaluator.mjs"

const argv=Object.fromEntries(process.argv.slice(2).map((part,index,all)=>part.startsWith("--")?[part.slice(2),all[index+1]&&!all[index+1].startsWith("--")?all[index+1]:"1"]:null).filter(Boolean))
const escape=(value)=>String(value).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]))
const fixture=FIXTURES[argv.fixture]||FIXTURES.five
const canvas=CANVASES[argv.canvas]||CANVASES.wide
const timeMs=Number(argv.time||0)
const controls={...DEFAULTS}
if(argv.featured!==undefined)controls.featuredIndex=Number(argv.featured)
if(argv.direction)controls.direction=argv.direction
if(argv.reduced==="1")controls.reducedMotion=true
const state=evaluate({items:fixture,stage:canvas,controls,timeMs})
const silhouette=argv.silhouette==="1"
const transparent=argv.transparent==="1"
const hue=(index)=>(index*47+210)%360

const hslHex=(h,s,l)=>{
  s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return "#"+[f(0),f(8),f(4)].map(v=>Math.round(255*v).toString(16).padStart(2,"0")).join("")
}
const card=(c,index)=>{
  const item=fixture[c.sourceIndex]
  const x=-c.width/2,y=-c.height
  if(silhouette){
    return `<g transform="translate(${c.bottomX} ${c.bottomY}) rotate(${c.angleDeg}) scale(${c.scale})"><rect x="${x}" y="${y}" width="${c.width}" height="${c.height}" rx="4" fill="#20231f"/></g>`
  }
  const h=hue(index)
  const ix=x+8,iy=y+8,iw=Math.max(1,c.width-16),ih=Math.max(1,c.height-16)
  return `<g transform="translate(${c.bottomX} ${c.bottomY}) rotate(${c.angleDeg}) scale(${c.scale})">
    <rect x="${x}" y="${y}" width="${c.width}" height="${c.height}" rx="14" fill="#f0ece1"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="9" fill="url(#g${index})"/>
    <rect x="${ix+iw*.08}" y="${iy+ih*.18}" width="${iw*.44}" height="${Math.max(3,ih*.07)}" fill="#14212c" opacity=".86"/>
    <path d="M ${ix+iw*.11} ${iy+ih*.15} C ${ix+iw*.38} ${iy+ih*.03}, ${ix+iw*.68} ${iy+ih*.46}, ${ix+iw*.88} ${iy+ih*.18} L ${ix+iw*.84} ${iy+ih*.72} C ${ix+iw*.55} ${iy+ih*.92}, ${ix+iw*.31} ${iy+ih*.55}, ${ix+iw*.12} ${iy+ih*.83} Z" fill="none" stroke="#fff" stroke-width="${Math.max(2,Math.min(c.width,c.height)*.018)}" opacity=".86"/>
    <text x="${ix+iw*.08}" y="${iy+ih*.9}" font-family="ui-monospace,monospace" font-size="${Math.max(10,Math.min(18,iw*.055))}" font-weight="700" letter-spacing="1.2" fill="#fff">${escape(item?.label||c.id)}</text>
  </g>`
}
const defs=state.cards.map((_,i)=>`<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hslHex(hue(i),66,72)}"/><stop offset="1" stop-color="${hslHex((hue(i)+55)%360,70,42)}"/></linearGradient>`).join("")
const background=transparent?"":`<rect width="100%" height="100%" fill="${silhouette?"#f1f1ed":"#ddd8cb"}"/>`
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><defs>${defs}</defs>${background}${[...state.cards].sort((a,b)=>a.zIndex-b.zIndex||a.sourceIndex-b.sourceIndex).map((c,i)=>card(c,i)).join("")}</svg>`
if(!argv.out)throw new Error("--out required")
fs.mkdirSync(path.dirname(argv.out),{recursive:true});fs.writeFileSync(argv.out,svg)
if(argv.stateOut){fs.mkdirSync(path.dirname(argv.stateOut),{recursive:true});fs.writeFileSync(argv.stateOut,JSON.stringify(canonicalSnapshot(state),null,2)+"\n")}
