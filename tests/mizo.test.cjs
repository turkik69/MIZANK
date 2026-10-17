const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment}=require('./helpers/meal-env.cjs');
const create=options=>environment({mizo:true,...options});
function host(e,location='dashboard') { const h=new e.Node('mizo-'+location);h.dataset.mizoCard=location;e.doc.mizoHosts=[...(e.doc.mizoHosts||[]),h];return h; }
test('companion defaults are visible, animated and silent without changing profile',()=>{
 const e=create(),before=e.run('JSON.stringify(appState)');
 assert.equal(e.run('mizoPreferences().enabled'),true);assert.equal(e.run('mizoPreferences().sound'),false);assert.equal(e.run('mizoPreferences().motion'),true);assert.equal(e.run('JSON.stringify(appState)'),before);
});
test('five reactions map to real app conditions',()=>{
 const e=create();
 assert.equal(e.run('mizoView(appState).state'),'welcome');
 assert.equal(e.run('mizoView(appState,{pending:1}).state'),'thinking');
 assert.equal(e.run("mizoView(appState,{event:{type:'meal'},until:Date.now()+1000}).state"),'encourage');
 assert.equal(e.run("mizoView(appState,{event:{type:'checkin'},until:Date.now()+1000}).state"),'celebrate');
 e.run('appState.fasting.active=true');assert.equal(e.run('mizoView(appState).state'),'calm');
});
test('overlapping analysis and rejected requests always release thinking state',async()=>{
 const e=create();e.run('var first=beginMizoAnalysis(),second=beginMizoAnalysis();endMizoAnalysis(first)');assert.equal(e.run('mizoRuntime.pending.size'),1);e.run('endMizoAnalysis(second)');assert.equal(e.run('mizoRuntime.pending.size'),0);
 e.run("fetchGeminiWithRetry=async()=>{throw Error('connection failed')}");await assert.rejects(e.run("analyzeMealTextGemini('وجبة')"));assert.equal(e.run('mizoRuntime.pending.size'),0);
});
test('water celebrations occur on crossing the target and never ask for extra cups',()=>{
 const e=create();e.run('appState.water=8;appState.waterDate=todayStr();mizoReact("water",{previousWater:7})');assert.equal(e.run('mizoRuntime.event.crossedTarget'),true);assert.equal(e.run('mizoView(appState,{today:todayStr(),event:mizoRuntime.event,until:mizoRuntime.until}).state'),'celebrate');
 e.run('appState.water=9;mizoReact("water",{previousWater:8})');assert.equal(e.run('mizoRuntime.event.crossedTarget'),false);assert.match(e.run('mizoView(appState,{today:todayStr(),event:mizoRuntime.event,until:mizoRuntime.until}).message'),/وصلت إلى هدف الماء/);
});
test('hiding the mascot removes every card and restoring it works',()=>{
 const e=create(),h=host(e);e.run('renderMizoCards()');assert.equal(h.hidden,false);assert.match(h.innerHTML,/مِيزو/);
 e.run('appState.mizoPreferences={enabled:false};renderMizoCards()');assert.equal(h.hidden,true);assert.equal(h.innerHTML,'');
 e.run('appState.mizoPreferences.enabled=true;renderMizoCards()');assert.equal(h.hidden,false);
});
test('system reduced motion and app motion switch both disable animation',()=>{
 const e=create({reducedMotion:true}),h=host(e);e.run('renderMizoCards()');assert.equal(h.dataset.motion,'off');e.media.matches=false;e.run('renderMizoCards()');assert.equal(h.dataset.motion,'on');e.run('appState.mizoPreferences={motion:false};renderMizoCards()');assert.equal(h.dataset.motion,'off');
});
test('background visibility pauses animation and default sound creates no audio',()=>{
 const e=create(),h=host(e);let audio=0;e.ctx.window.AudioContext=function(){audio++;};e.doc.hidden=true;e.run('renderMizoCards();playMizoChime()');assert.equal(h.dataset.motion,'off');assert.equal(audio,0);e.doc.hidden=false;e.run('playMizoChime()');assert.equal(audio,0);
});
test('shortcuts only open existing destinations without writing a meal',()=>{
 const e=create();e.run(`var opened=[];switchScreen=name=>opened.push(name);openNextMealSuggestions=()=>opened.push('suggest');mizoAction('meals');mizoAction('suggest');mizoAction('progress');mizoAction('water')`);assert.equal(e.run('opened.join()'),'meals,suggest,cutting,water');assert.equal(e.run('appState.meals.length'),0);
});
test('mascot preferences survive reload without changing nutrition or progress',()=>{
 const e=create();const before=e.run('JSON.stringify([appState.profile,appState.meals,appState.weights,appState.fasting])');e.run('saveCurrentUserData=realSaveCurrentUserData;openMizoSettings()');e.get('mizo-enabled').checked=false;e.get('mizo-motion').checked=false;e.get('mizo-sound').checked=true;e.get('mizo-settings-form').events.submit({preventDefault(){}});
 assert.equal(e.run('loadUsersDB()[LOCAL_PROFILE_ID].mizoPreferences.enabled'),false);assert.equal(e.run('loadUsersDB()[LOCAL_PROFILE_ID].mizoPreferences.sound'),true);assert.equal(e.run('JSON.stringify([appState.profile,appState.meals,appState.weights,appState.fasting])'),before);
});
test('meal save triggers encouragement, keeps totals, and remains a single record',()=>{
 const e=create();e.run("openMealReview({name:'وجبة',cal:400,protein:25},'manual');saveMealReview()");assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('appState.meals[0].cal'),400);assert.equal(e.run('mizoRuntime.event.type'),'meal');assert.equal(e.run('appState.profile.dailyCalories'),2000);
});
test('water and weekly check-in hooks run only after a successful save',()=>{
 const e=create();e.run('appState.water=7;appState.waterDate=todayStr();addWater(1)');assert.equal(e.run('appState.water'),8);assert.equal(e.run('mizoRuntime.event.crossedTarget'),true);
 e.run('appState.cuttingPlan={checkins:[]};ensureCuttingPlan=()=>appState.cuttingPlan;cuttingWeekNumber=()=>2;renderCuttingPlan=()=>{}');e.get('cutting-check-weight').value='80';e.run('saveCuttingCheckin()');assert.equal(e.run('appState.cuttingPlan.checkins.length'),1);assert.equal(e.run('mizoRuntime.event.type'),'checkin');
});
test('new visits are recorded once and inactivity gets a gentle welcome',()=>{
 const e=create();e.run("appState.mizoLastVisit='2026-10-01';renderMizoCards()");assert.equal(e.run('appState.mizoLastVisit'),e.run('todayStr()'));assert.equal(e.run('mizoRuntime.previousVisit'),'2026-10-01');assert.match(e.run("mizoView(appState,{today:'2026-10-17',previousVisit:'2026-10-01'}).message"),/حياك من جديد/);
 e.run('mizoReact("meal")');assert.equal(e.run('mizoRuntime.previousVisit'),null);
});
test('transient water card disappears when event expires',()=>{
 const e=create(),h=host(e,'water');e.run('renderMizoCards()');assert.equal(h.hidden,true);e.run('mizoReact("water",{previousWater:0})');assert.equal(h.hidden,false);
 const timer=e.run('mizoRuntime.timer');e.timers.get(timer)();assert.equal(h.hidden,true);
});
test('profile text is escaped and repeated renders do not restart animations',()=>{
 const e=create(),h=host(e);e.run(`appState.profile.name='<img src=x>';renderMizoCards()`);assert.ok(!h.innerHTML.includes('<img src=x>'));const signature=h.dataset.signature;e.run('renderMizoCards()');assert.equal(h.dataset.signature,signature);
});
test('hero avatar occupies its own slot between calorie target and ring',()=>{
 const fs=require('node:fs'),html=fs.readFileSync('index.html','utf8');const target=html.indexOf('id="dashboard-calories"'),hero=html.indexOf('id="mizo-hero"'),ring=html.indexOf('id="dashboard-calorie-progress"');assert.ok(target<hero && hero<ring);
 const e=create(),h=host(e,'hero');const toggles=[];h.parentElement={classList:{toggle:(...args)=>toggles.push(args)}};e.run('renderMizoCards()');assert.equal(h.hidden,false);assert.match(h.innerHTML,/mizo-hero-character/);assert.deepEqual(toggles.at(-1),['has-mizo',true]);
 e.run('appState.mizoPreferences={enabled:false};renderMizoCards()');assert.equal(h.hidden,true);assert.deepEqual(toggles.at(-1),['has-mizo',false]);
});
test('pressing hero rotates dance variants and preserves nutrition records',()=>{
 const e=create(),h=host(e,'hero');e.run('renderMizoCards()');const before=e.run('JSON.stringify([appState.profile,appState.meals,appState.water,appState.weights,appState.cuttingPlan])');
 h.querySelector('[data-mizo-dance]').events.click();assert.equal(h.dataset.dance,'sway');e.run('mizoDance()');assert.equal(h.dataset.dance,'bounce');e.run('mizoDance()');assert.equal(h.dataset.dance,'twist');assert.equal(e.run('JSON.stringify([appState.profile,appState.meals,appState.water,appState.weights,appState.cuttingPlan])'),before);
});
test('repeated taps replace the dance timer and expiry returns to idle',()=>{
 const e=create(),h=host(e,'hero');e.run('mizoDance()');const old=e.run('mizoRuntime.danceTimer');e.run('mizoDance()');assert.equal(e.timers.has(old),false);const timer=e.run('mizoRuntime.danceTimer');e.timers.get(timer)();assert.equal(h.dataset.dance,'none');assert.equal(e.run('mizoRuntime.danceUntil'),0);
});
test('dance respects motion setting, reduced motion and background visibility',()=>{
 for(const mode of ['off','reduced','background']){
  const e=create({reducedMotion:mode==='reduced'}),h=host(e,'hero');if(mode==='off')e.run('appState.mizoPreferences={motion:false}');if(mode==='background')e.doc.hidden=true;e.run('mizoDance()');assert.equal(h.dataset.dance,'none');assert.equal(e.run('mizoRuntime.danceCount'),0);
 }
});
test('thinking takes priority over dance and does not lose a pending request',()=>{
 const e=create(),h=host(e,'hero');e.run('mizoDance();var task=beginMizoAnalysis();mizoDance()');assert.equal(h.dataset.dance,'none');assert.equal(h.dataset.state,'thinking');assert.equal(e.run('mizoRuntime.pending.size'),1);e.run('endMizoAnalysis(task)');assert.equal(e.run('mizoRuntime.pending.size'),0);
});
test('meal save and weekly check-in trigger short celebration dances',()=>{
 const e=create(),h=host(e,'hero');e.run('mizoReact("meal")');assert.notEqual(h.dataset.dance,'none');const count=e.run('mizoRuntime.danceCount');e.run('mizoReact("checkin")');assert.equal(e.run('mizoRuntime.danceCount'),count+1);assert.equal(h.dataset.state,'celebrate');
});
