// AudioWorklet-Prozessor für den Motorklang (siehe engine-synth.js).
import { EngineSynth, PROFILES } from './engine-synth.js';

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 800, minValue: 0, maxValue: 30000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'limiter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'speed', defaultValue: 0, minValue: 0, maxValue: 120, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    this.id = options?.processorOptions?.profile || 'cls63';
    this.synth = new EngineSynth(sampleRate, PROFILES[this.id]);
    this.port.onmessage = (e) => {
      if (e.data?.profile && PROFILES[e.data.profile]) { this.id = e.data.profile; this.synth = new EngineSynth(sampleRate, PROFILES[this.id]); }
    };
  }
  process(inputs, outputs, p) {
    const out = outputs[0][0];
    this.synth.process(out, out.length, { rpm: p.rpm[0], throttle: p.throttle[0], load: p.load[0], limiter: p.limiter[0] > 0.5, speed: p.speed[0] });
    return true;
  }
}
registerProcessor('engine', EngineProcessor);
