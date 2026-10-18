/* Quiet, local sound effects; one audio context, unlocked only by user interaction. */
'use strict';
const mizoAudio = { context:null, ready:false, voices:new Set(), stepTimers:new Set(), busyUntil:0, lastType:null, lastAt:0 };
function mizoAudioAllowed() {
  return mizoPreferences().enabled && mizoPreferences().sound && !document.hidden;
}
function stopMizoSteps() {
  mizoAudio.stepTimers.forEach(clearTimeout); mizoAudio.stepTimers.clear();
  for (const voice of [...mizoAudio.voices]) if (voice.group === 'step') voice.stop();
}
function stopMizoAudio() {
  stopMizoSteps();
  for (const voice of [...mizoAudio.voices]) voice.stop();
  mizoAudio.busyUntil = 0;
}
function unlockMizoAudio() {
  if (!mizoAudioAllowed()) return Promise.resolve(false);
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return Promise.resolve(false);
    mizoAudio.context ||= new Audio();
    const context = mizoAudio.context;
    return Promise.resolve(context.state === 'running' ? undefined : context.resume()).then(() => {
      mizoAudio.ready = context.state === 'running'; return mizoAudio.ready;
    }).catch(() => false);
  } catch (_) { return Promise.resolve(false); }
}
function mizoSoundVoice({delay=0,duration=.09,frequency=180,endFrequency=90,volume=.012,noise=false,filter=900,group='event'}) {
  const context = mizoAudio.context;
  const start = context.currentTime+delay, gain = context.createGain();
  let source;
  if (noise) {
    const buffer = context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
    const samples = buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++) samples[i] = Math.random()*2-1;
    source = context.createBufferSource(); source.buffer = buffer;
    const lowpass = context.createBiquadFilter(); lowpass.type='lowpass'; lowpass.frequency.value=filter;
    source.connect(lowpass); lowpass.connect(gain);
  } else {
    source = context.createOscillator(); source.type='sine';
    source.frequency.setValueAtTime(frequency,start);
    source.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
    source.connect(gain);
  }
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(volume,start+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  gain.connect(context.destination);
  const voice = {group,stop(){try{source.stop();}catch(_){} gain.disconnect();mizoAudio.voices.delete(voice);}};
  mizoAudio.voices.add(voice);
  source.onended=()=>{gain.disconnect();mizoAudio.voices.delete(voice);};
  source.start(start); source.stop(start+duration+.02);
}
function playMizoSound(type) {
  if (!mizoAudioAllowed() || !mizoAudio.ready || mizoAudio.context?.state !== 'running') return;
  const now=Date.now();
  if (type==='step' && now<mizoAudio.busyUntil) return;
  if (type!=='step' && mizoAudio.lastType===type && now-mizoAudio.lastAt<700) return;
  try {
    if(type==='step') { mizoSoundVoice({frequency:150,endFrequency:65,volume:.008,duration:.055,group:'step'}); return; }
    mizoAudio.lastType=type; mizoAudio.lastAt=now; mizoAudio.busyUntil=now+1100;
    stopMizoSteps();
    if(type==='water') {
      // Soft bubbling/lapping, with small pitch changes rather than a loud alert.
      for(let i=0;i<5;i++) {
        mizoSoundVoice({delay:i*.15,frequency:260+(i%2)*110,endFrequency:110,volume:.017,duration:.11});
        mizoSoundVoice({delay:i*.15+.03,noise:true,filter:700,volume:.009,duration:.07});
      }
    } else if(type==='meal') {
      // Three short, muffled crunches suggest chewing without speech or recordings.
      for(let i=0;i<3;i++) {
        mizoSoundVoice({delay:i*.23,noise:true,filter:1500,volume:.018,duration:.1});
        mizoSoundVoice({delay:i*.23+.06,frequency:125,endFrequency:70,volume:.01,duration:.08});
      }
    } else if(type==='celebrate') {
      [523.25,659.25].forEach((frequency,i)=>mizoSoundVoice({delay:i*.12,frequency,endFrequency:frequency,volume:.022,duration:.16}));
    }
  } catch (_) { /* Audio is decorative and must never block a save. */ }
}
function queueMizoSteps(duration) {
  stopMizoSteps();
  if (!mizoAudioAllowed() || !mizoAudio.ready || !mizoPreferences().motion || mizoReducedMotion?.matches || mizoRuntime.pending.size) return;
  for(let delay=240;delay<duration && delay<=1920;delay+=240) {
    const timer=setTimeout(()=>{
      mizoAudio.stepTimers.delete(timer);
      if (mizoPreferences().motion && !mizoReducedMotion?.matches && !mizoRuntime.pending.size) playMizoSound('step');
    },delay);
    mizoAudio.stepTimers.add(timer);
  }
}
document.addEventListener('pointerdown',unlockMizoAudio,{passive:true,capture:true});
document.addEventListener('keydown',unlockMizoAudio,{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMizoAudio();});
