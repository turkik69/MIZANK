const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment}=require('./helpers/meal-env.cjs');
const create=opts=>environment({mizo:true,puppy:true,...opts});
function home(e){e.get('mizo-hero').getBoundingClientRect=()=>({left:120,top:120,width:110,height:110,bottom:230,right:230});e.doc.body.dataset.view='dashboard';}
test('roamer chooses another corner instead of covering a field',()=>{
 const e=create();const spot=e.run('puppyChooseSpot({width:390,height:844,size:{width:96,height:108},blocked:[{x:240,y:0,width:150,height:180}],preferred:0})');assert.ok(spot);assert.equal(e.run(`puppyOverlap({x:${spot.x},y:${spot.y},width:96,height:108},{x:240,y:0,width:150,height:180})`),0);
});
test('crowded forms and too-small keyboard viewports take priority',()=>{
 const e=create();assert.equal(e.run('puppyChooseSpot({width:320,height:230,size:{width:170,height:166}})'),null);assert.equal(e.run('puppyChooseSpot({width:390,height:844,size:{width:96,height:108},blocked:[{x:0,y:0,width:390,height:844}]})'),null);
});
test('corner positions remain inside mobile viewports and above navigation',()=>{
 const e=create();for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]])for(let preferred=0;preferred<4;preferred++){
  const p=e.run(`puppyChooseSpot({width:${width},height:${height},size:{width:96,height:108},preferred:${preferred}})`);assert.ok(p);assert.ok(p.x>=0 && p.x+96<=width);assert.ok(p.y>=0 && p.y+108<=height-90);
 }
});
test('the puppy stays at its hero home and returns there after a short outing',()=>{
 const e=create();home(e);e.run('renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,true);assert.equal(e.doc.body.dataset.puppyRoaming,'false');
 e.run('puppyRuntime.step=2;puppyTick()');assert.equal(e.get('puppy-roamer').hidden,false);assert.equal(e.doc.body.dataset.puppyRoaming,'true');const timer=e.run('puppyRuntime.returnTimer');e.timers.get(timer)();assert.equal(e.get('puppy-roamer').hidden,true);
});
test('every application page supports the automatic companion without a pet click',()=>{
 const e=create();for(const page of ['setup','meals','workouts','fasting','more','chat','water','cutting','settings']){e.doc.body.dataset.view=page;e.run('renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,false,page);}
});
test('roaming works before a new user has created a profile',()=>{
 const e=create();e.doc.body.dataset.view='setup';e.run('appState.profile=null;renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,false);assert.equal(e.run('appState.profile'),null);
});
test('input reactions do not read or save field contents and are throttled',()=>{
 const e=create();const before=e.run('JSON.stringify(appState.meals)');const target={tagName:'INPUT',get value(){throw Error('Field contents must stay private');}};e.ctx.inputEvent={target};e.run('puppyOnInput(inputEvent)');assert.equal(e.run('mizoRuntime.event.type'),'input');const count=e.run('mizoRuntime.danceCount');e.run('puppyOnInput(inputEvent)');assert.equal(e.run('mizoRuntime.danceCount'),count);assert.equal(e.run('JSON.stringify(appState.meals)'),before);
});
test('successful and unsuccessful saves receive different automatic reactions',()=>{
 const e=create();e.run("puppyOnToast('success')");assert.equal(e.run('mizoRuntime.event.type'),'saved');e.run("puppyOnToast('warning')");assert.equal(e.run('mizoRuntime.event.type'),'retry');assert.equal(e.run('appState.meals.length'),0);
});
test('recording a meal makes the puppy react automatically without duplicating it',()=>{
 const e=create();e.doc.body.dataset.view='meals';e.run("openMealReview({name:'غداء',cal:500,protein:30},'manual');saveMealReview()");assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('mizoRuntime.event.type'),'meal');assert.notEqual(e.get('puppy-roamer').dataset.dance,'none');assert.equal(e.run('appState.profile.dailyCalories'),2000);
});
test('disabled and reduced-motion settings control the roamer and its loop',()=>{
 const e=create();e.doc.body.dataset.view='meals';e.run('renderMizoCards()');assert.equal(e.intervals.size,1);e.run('renderMizoCards();renderMizoCards()');assert.equal(e.intervals.size,1);
 e.run('appState.mizoPreferences={enabled:false};renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,true);assert.equal(e.intervals.size,0);
 e.run('appState.mizoPreferences={enabled:true,motion:false};renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,false);assert.equal(e.get('puppy-roamer').dataset.motion,'off');assert.equal(e.intervals.size,0);
});
test('going to the background stops roaming and returning resumes it',()=>{
 const e=create();e.doc.body.dataset.view='meals';e.run('renderMizoCards()');e.doc.hidden=true;e.run('renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,true);assert.equal(e.intervals.size,0);e.doc.hidden=false;e.run('renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,false);assert.equal(e.intervals.size,1);
});
test('idle roaming does not run while a user types into a field',()=>{
 const e=create();e.doc.body.dataset.view='meals';e.doc.activeElement.tagName='INPUT';e.run('puppyRuntime.step=1;puppyTick()');assert.equal(e.run('puppyRuntime.step'),1);
});
test('all companion instances use the selected 3D asset instead of an SVG redraw',()=>{
 const e=create();const markup=e.run('mizoSvg()');assert.match(markup,/puppy-frames/);assert.ok(!markup.includes('<svg'));assert.ok(!markup.includes('path d='));
});
test('normal body focus does not falsely block the entire roaming viewport',()=>{
 const e=create();e.doc.body.dataset.view='meals';e.doc.activeElement.tagName='BODY';e.doc.activeElement.getBoundingClientRect=()=>({left:0,top:0,width:390,height:844,bottom:844,right:390});e.run('renderMizoCards()');assert.equal(e.get('puppy-roamer').hidden,false);assert.equal(e.run('puppyBlockedRects().length'),0);
});
test('roaming respects iPhone safe areas in portrait and landscape',()=>{
 const e=create();for(let preferred=0;preferred<4;preferred++){
  const p=e.run(`puppyChooseSpot({width:390,height:844,size:{width:96,height:108},safeTop:59,safeBottom:34,preferred:${preferred}})`);assert.ok(p.y>=67);assert.ok(p.y+108<=844-114);
  const l=e.run(`puppyChooseSpot({width:844,height:390,size:{width:96,height:108},safeLeft:59,safeRight:59,preferred:${preferred}})`);assert.ok(l.x>=67 && l.x+96<=844-67);
 }
});

test('poses follow travel, reaction, and rest in order, then stop after arrival',()=>{
 const e=create();e.run('mizoRuntime.danceUntil=Date.now()+5000;trackPuppyTravel({x:10,y:100},true,true)');assert.equal(e.run('puppyPose(true)'), 'jump');
 e.run('trackPuppyTravel({x:200,y:100},true,false)');assert.equal(e.run('puppyPose(true)'), 'walk');assert.equal(e.run('puppyRuntime.facing'), 'right');
 const timer=e.run('puppyRuntime.travelTimer');e.timers.get(timer)();assert.equal(e.run('puppyPose(true)'), 'jump');
 e.run('mizoRuntime.danceUntil=0');assert.equal(e.run('puppyPose(true)'), 'idle');
});
test('walk reverses direction and coalesces its completion timer',()=>{
 const e=create();e.run('trackPuppyTravel({x:200,y:100},true,true);trackPuppyTravel({x:100,y:100},true,false)');const old=e.run('puppyRuntime.travelTimer');assert.equal(e.run('puppyRuntime.facing'),'left');
 e.run('trackPuppyTravel({x:20,y:100},true,false)');assert.equal(e.timers.has(old),false);const current=e.run('puppyRuntime.travelTimer');e.run('trackPuppyTravel({x:20,y:100},true,false)');assert.equal(e.run('puppyRuntime.travelTimer'),current);
});
test('typing, reduce motion, background and pending analysis stop articulated motion',()=>{
 const e=create();e.run('trackPuppyTravel({x:10,y:100},true,true);trackPuppyTravel({x:200,y:100},true,false)');assert.equal(e.run('puppyPose(true)'), 'walk');
 e.run('trackPuppyTravel({x:30,y:100},false,false)');assert.equal(e.run('puppyRuntime.travelUntil'),0);assert.equal(e.run('puppyRuntime.travelTimer'),null);
 e.run('mizoRuntime.danceUntil=Date.now()+5000');assert.equal(e.run('puppyPose(false)'), 'stand');e.doc.hidden=true;assert.equal(e.run('puppyPose(true)'), 'stand');e.doc.hidden=false;e.run("mizoRuntime.pending.add('analysis')");assert.equal(e.run('puppyPose(true)'), 'stand');
});
test('visible hosts and roaming copy share pose updates without replacing their markup',()=>{
 const e=create();const host=new e.Node();host.dataset.mizoCard='hero';e.doc.mizoHosts=[host];const previous=host.innerHTML;e.run('mizoRuntime.danceUntil=Date.now()+5000;syncPuppyPose(true)');assert.equal(host.dataset.pose,'jump');assert.equal(e.get('puppy-roamer').dataset.pose,'jump');assert.equal(host.innerHTML,previous);
 e.run('syncPuppyPose(false)');assert.equal(host.dataset.pose,'stand');assert.equal(e.get('puppy-roamer').dataset.pose,'stand');
});
