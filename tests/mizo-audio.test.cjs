const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment}=require('./helpers/meal-env.cjs');
function setup(){
 const e=environment({mizo:true,puppy:true,audio:true});let created=0;
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:param(),gain:param()});
 e.ctx.window.AudioContext=class{constructor(){created++;this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};}resume(){this.state='running';return Promise.resolve();}createGain(){return node();}createOscillator(){return node();}createBufferSource(){return node();}createBiquadFilter(){return node();}createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}};
 return {...e,created:()=>created};
}
test('audio stays silent by default, unlocks on demand, and reuses one context',async()=>{
 const e=setup();await e.run('unlockMizoAudio()');e.run("playMizoSound('water')");assert.equal(e.created(),0);
 e.run('appState.mizoPreferences={sound:true}');await e.run('unlockMizoAudio()');await e.run('unlockMizoAudio()');assert.equal(e.created(),1);assert.equal(e.run('mizoAudio.ready'),true);
});
test('water and meal saves play distinct brief effects without duplicate save sounds',async()=>{
 const e=setup();e.run('appState.mizoPreferences={sound:true}');await e.run('unlockMizoAudio()');e.run("mizoReact('water')");assert.equal(e.run('mizoAudio.lastType'),'water');const count=e.run('mizoAudio.voices.size');assert.equal(count,10);e.run("mizoReact('saved');mizoReact('water')");assert.equal(e.run('mizoAudio.voices.size'),count);
 e.run("stopMizoAudio();mizoReact('meal')");assert.equal(e.run('mizoAudio.lastType'),'meal');assert.equal(e.run('mizoAudio.voices.size'),6);assert.equal(e.run('appState.meals.length'),0);
});
test('footsteps follow cadence, respect event priority and cancel when movement stops',async()=>{
 const e=setup();e.run('appState.mizoPreferences={sound:true}');await e.run('unlockMizoAudio()');e.run('queueMizoSteps(1000)');assert.equal(e.run('mizoAudio.stepTimers.size'),4);
 const timer=e.run('[...mizoAudio.stepTimers][0]');e.timers.get(timer)();assert.equal(e.run('mizoAudio.voices.size'),1);e.run("playMizoSound('water')");assert.equal(e.run('mizoAudio.stepTimers.size'),0);e.run("playMizoSound('step')");assert.equal(e.run('mizoAudio.voices.size'),10);
 e.run('queueMizoSteps(1000);stopPuppyTravel()');assert.equal(e.run('mizoAudio.stepTimers.size'),0);
});
test('mute, hidden app, disabled mascot and missing audio support never interrupt recording',async()=>{
 const e=setup();e.run('appState.mizoPreferences={sound:true}');await e.run('unlockMizoAudio()');e.run("playMizoSound('meal');queueMizoSteps(1000);stopMizoAudio()");assert.equal(e.run('mizoAudio.voices.size'),0);assert.equal(e.run('mizoAudio.stepTimers.size'),0);
 for(const pref of ['{sound:false}','{sound:true,enabled:false}']){e.run(`appState.mizoPreferences=${pref};playMizoSound('water')`);assert.equal(e.run('mizoAudio.voices.size'),0);}
 e.run('appState.mizoPreferences={sound:true}');e.doc.hidden=true;e.run("playMizoSound('meal')");assert.equal(e.run('mizoAudio.voices.size'),0);
 const no=environment({mizo:true,audio:true});no.run("appState.mizoPreferences={sound:true};addMealDirect({name:'عشاء',cal:300},'manual')");assert.equal(no.run('appState.meals.length'),1);
});
