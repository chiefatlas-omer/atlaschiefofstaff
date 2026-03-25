export class WaveformVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private barCount = 40;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  async start(): Promise<MediaStream> {
    this.audioContext = new AudioContext();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength) as Uint8Array<ArrayBuffer>;

    this.draw();
    return this.stream;
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw = (): void => {
    this.animationId = requestAnimationFrame(this.draw);

    if (!this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    const barWidth = width / this.barCount;
    const gap = 2;
    const centerY = height / 2;

    for (let i = 0; i < this.barCount; i++) {
      const dataIndex = Math.floor((i / this.barCount) * this.dataArray.length);
      const value = this.dataArray[dataIndex] / 255;

      const minHeight = 4;
      const barHeight = Math.max(minHeight, value * (height * 0.8));

      const x = i * barWidth + gap / 2;
      const barActualWidth = barWidth - gap;

      // Atlas brand gradient: deep purple (#4F3588) to pink (#EC4899)
      const hue = 270 - (i / this.barCount) * 40; // 270 (purple) to 330 (pink)
      const saturation = 60 + value * 30;
      const lightness = 40 + value * 25;

      // CRITICAL: beginPath() before each bar for individual colors
      this.ctx.beginPath();
      this.ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      this.ctx.roundRect(
        x,
        centerY - barHeight / 2,
        barActualWidth,
        barHeight,
        barActualWidth / 2,
      );
      this.ctx.fill();
    }
  };
}

