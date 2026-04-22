export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private userNodes: Map<
    string,
    { source: MediaStreamAudioSourceNode; gain: GainNode; panner: PannerNode; stream: MediaStream }
  > = new Map();

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // New method to add a real remote audio stream
  addRemoteStream(id: string, stream: MediaStream): void {
    if (!this.ctx || !this.masterGain) return;
    
    // Cleanup if already exists
    this.removeUser(id);

    const source = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    const panner = this.ctx.createPanner();

    gain.gain.value = 0;

    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 50;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1.5;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    this.userNodes.set(id, { source, gain, panner, stream });
  }

  updateUser(
    userId: string,
    listenerPos: { x: number; y: number },
    sourcePos: { x: number; y: number },
    canHear: boolean,
    volume: number
  ): void {
    const nodes = this.userNodes.get(userId);
    if (!nodes || !this.ctx) return;

    // Scale positions for spatial effect (mapping map pixels to audio units)
    const dx = (sourcePos.x - listenerPos.x) / 100;
    const dy = (sourcePos.y - listenerPos.y) / 100;

    // We use Z for front/back in WebAudio's default orientation
    nodes.panner.positionX.setTargetAtTime(dx, this.ctx.currentTime, 0.1);
    nodes.panner.positionZ.setTargetAtTime(dy, this.ctx.currentTime, 0.1);
    nodes.panner.positionY.setTargetAtTime(0, this.ctx.currentTime, 0.1);

    const targetGain = canHear ? volume : 0;
    nodes.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
  }

  setMuted(muted: boolean): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.ctx.currentTime,
        0.1
      );
    }
  }

  removeUser(id: string): void {
    const nodes = this.userNodes.get(id);
    if (nodes) {
      try {
        nodes.source.disconnect();
        nodes.gain.disconnect();
        nodes.panner.disconnect();
      } catch (e) {
        console.error("Error disconnecting nodes", e);
      }
      this.userNodes.delete(id);
    }
  }

  destroy(): void {
    this.userNodes.forEach((_, id) => this.removeUser(id));
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
