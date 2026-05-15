function logArc(msg) {
  console.log(`[arc-native] ${msg}`);
}

function makeThrowingStub(name) {
  return async function missingArcNative() {
    logArc(`missing ${name}`);
    throw new Error(`Missing arc native: ${name}`);
  };
}

let nextHandle = 1;
const allocHandle = () => nextHandle++;

const soloudStubs = {
  async Java_arc_audio_Soloud_init() {
    logArc('Soloud.init() stubbed');
  },
  async Java_arc_audio_Soloud_deinit() {},
  async Java_arc_audio_Soloud_backendString() { return 'NoAudio'; },
  async Java_arc_audio_Soloud_backendId() { return 0; },
  async Java_arc_audio_Soloud_backendChannels() { return 2; },
  async Java_arc_audio_Soloud_backendSamplerate() { return 44100; },
  async Java_arc_audio_Soloud_backendBufferSize() { return 1024; },
  async Java_arc_audio_Soloud_version() { return 0; },
  async Java_arc_audio_Soloud_activeVoiceCount() { return 0; },
  async Java_arc_audio_Soloud_stopAll() {},
  async Java_arc_audio_Soloud_pauseAll() {},
  async Java_arc_audio_Soloud_setGlobalFilter() {},
  async Java_arc_audio_Soloud_filterFade() {},
  async Java_arc_audio_Soloud_filterSet() {},
  async Java_arc_audio_Soloud_busNew() { return allocHandle(); },
  async Java_arc_audio_Soloud_wavLoad() { return allocHandle(); },
  async Java_arc_audio_Soloud_idSeek() {},
  async Java_arc_audio_Soloud_idVolume() {},
  async Java_arc_audio_Soloud_idGetVolume() { return 0; },
  async Java_arc_audio_Soloud_idPan() {},
  async Java_arc_audio_Soloud_idPitch() {},
  async Java_arc_audio_Soloud_idPause() {},
  async Java_arc_audio_Soloud_idGetPause() { return false; },
  async Java_arc_audio_Soloud_idProtected() {},
  async Java_arc_audio_Soloud_idStop() {},
  async Java_arc_audio_Soloud_idLooping() {},
  async Java_arc_audio_Soloud_idGetLooping() { return false; },
  async Java_arc_audio_Soloud_idPosition() { return 0; },
  async Java_arc_audio_Soloud_idValid() { return false; },
  async Java_arc_audio_Soloud_streamLoad() { return allocHandle(); },
  async Java_arc_audio_Soloud_streamLength() { return 0; },
  async Java_arc_audio_Soloud_wavLength() { return 0; },
  async Java_arc_audio_Soloud_sourceDestroy() {},
  async Java_arc_audio_Soloud_sourceInaudible() {},
  async Java_arc_audio_Soloud_sourcePlay() { return -1; },
  async Java_arc_audio_Soloud_sourcePlayBus() { return -1; },
  async Java_arc_audio_Soloud_sourceCount() { return 0; },
  async Java_arc_audio_Soloud_sourcePriority() {},
  async Java_arc_audio_Soloud_sourceMinConcurrentInterrupt() {},
  async Java_arc_audio_Soloud_sourceMaxConcurrent() {},
  async Java_arc_audio_Soloud_sourceConcurrentGroup() {},
  async Java_arc_audio_Soloud_sourceLoop() {},
  async Java_arc_audio_Soloud_sourceSingleInstance() {},
  async Java_arc_audio_Soloud_sourceStop() {},
  async Java_arc_audio_Soloud_sourceFilter() {},
  async Java_arc_audio_Soloud_pauseDevice() { return 0; },
  async Java_arc_audio_Soloud_resumeDevice() { return 0; },
  async Java_arc_audio_Soloud_filterBiquad() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterEcho() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterLofi() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterFlanger() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterBassBoost() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterWaveShaper() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterRobotize() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterFreeverb() { return allocHandle(); },
  async Java_arc_audio_Soloud_biquadSet() {},
  async Java_arc_audio_Soloud_echoSet() {},
  async Java_arc_audio_Soloud_lofiSet() {},
  async Java_arc_audio_Soloud_flangerSet() {},
  async Java_arc_audio_Soloud_waveShaperSet() {},
  async Java_arc_audio_Soloud_bassBoostSet() {},
  async Java_arc_audio_Soloud_robotizeSet() {},
  async Java_arc_audio_Soloud_freeverbSet() {},
};

const nativeImpls = new Proxy(soloudStubs, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    if (typeof prop === 'string' && prop.startsWith('Java_arc_')) {
      return makeThrowingStub(prop);
    }
    return Reflect.get(target, prop, receiver);
  },
});

export default nativeImpls;
