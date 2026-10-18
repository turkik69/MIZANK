const fs=require('node:fs'),vm=require('node:vm');
function environment(options={}){
 const nodes=new Map(),timers=new Map(),intervals=new Map();let timerId=0;
 class Node{
  constructor(id=''){this.id=id;this.tagName='DIV';this.value='';this.dataset={};this.events={};this.children=[];this.checked=false;this.hidden=false;this.disabled=false;this.classList={add(){},remove(){},contains(){return true},toggle(){}};this.style={setProperty(){}};this.isConnected=true;}
  set innerHTML(html){this.html=html;const children=[];
   for(const m of html.matchAll(/<(input|form|button|div|p|fieldset|section|svg)\b([^>]*)>/g)){
    const el=new Node();el.tagName=m[1].toUpperCase();
    for(const a of m[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)){
     const [_,key,val='']=a;if(key==='id')el.id=val;if(key==='value')el.value=val;if(key==='checked')el.checked=true;if(key==='hidden')el.hidden=true;
     if(key.startsWith('data-'))el.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;
    }
    if(el.id)nodes.set(el.id,el);children.push(el);
   }
   this.children=children;children.forEach((child,i)=>{child.children=children.slice(i+1);});
  }
  get innerHTML(){return this.html||'';}
  querySelectorAll(selector){const match=selector.match(/^\[data-([\w-]+)\]$/);if(match){const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.filter(n=>n.dataset[key]!==undefined);}return [];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(){}focus(){doc.activeElement=this;}reportValidity(){return true;}getBoundingClientRect(){return {left:0,top:0,width:0,height:0,bottom:0,right:0};}getClientRects(){return [1];}appendChild(){}
 }
 const get=id=>nodes.get(id)||(nodes.set(id,new Node(id)),nodes.get(id));
 const doc={body:{dataset:{view:'dashboard'}},querySelector:()=>null,getElementById:get,querySelectorAll:selector=>selector==='[data-mizo-card]'?(doc.mizoHosts||[]):[],addEventListener(){},activeElement:new Node(),hidden:false};
 const media={matches:!!options.reducedMotion,addEventListener(){}};
 const ctx=vm.createContext({document:doc,navigator:{},window:{addEventListener(){},matchMedia:()=>media},Element:Node,Map,Date,Math,JSON,Number,Object,String,Array,Set,console,crypto:require('node:crypto').webcrypto,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},clearInterval(id){intervals.delete(id);},setInterval(fn){intervals.set(++timerId,fn);return timerId;},localStorage:{},structuredClone});
 const html=fs.readFileSync('index.html','utf8');
 vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'),ctx);
 vm.runInContext(fs.readFileSync('meal-tools.js','utf8'),ctx);
 if(options.mizo)vm.runInContext(fs.readFileSync('mizo.js','utf8'),ctx);
 if(options.puppy)vm.runInContext(fs.readFileSync('puppy.js','utf8'),ctx);
 vm.runInContext(`var realSaveCurrentUserData=saveCurrentUserData;saveCurrentUserData=()=>{};updateDashboard=()=>{};updateMealsList=()=>{};showToast=()=>{};appState.profile={name:'مستخدم تجريبي',dailyCalories:2000,protein:140,water:8};`,ctx);
 return {ctx,get,doc,Node,media,timers,intervals,run:s=>vm.runInContext(s,ctx)};
}
module.exports={environment};
