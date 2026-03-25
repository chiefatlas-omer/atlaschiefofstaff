import { desktopCapturer, screen } from 'electron';

export async function captureScreen(): Promise<{
  base64: string;
  width: number;
  height: number;
}> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor;

  // Actual pixel dimensions (accounting for DPI scaling on Windows/Retina on Mac)
  const pixelWidth = Math.round(width * scaleFactor);
  const pixelHeight = Math.round(height * scaleFactor);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: pixelWidth, height: pixelHeight },
  });

  const primarySource = sources[0];
  if (!primarySource) {
    throw new Error('No screen source available for capture');
  }

  const thumbnail = primarySource.thumbnail;
  const pngBuffer = thumbnail.toPNG();
  const base64 = pngBuffer.toString('base64');

  return { base64, width: pixelWidth, height: pixelHeight };
}
