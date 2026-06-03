const MIN_STREAM_DIMENSION = 1;
const MAX_STREAM_DIMENSION = 4096;

export function withScaledStreamResize(streamUrl: string): string {
  const url = new URL(streamUrl);
  url.searchParams.set("resize", "scale");
  return url.toString();
}

function normalizeStreamDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_STREAM_DIMENSION;
  }

  const clampedDimension = Math.min(
    MAX_STREAM_DIMENSION,
    Math.max(MIN_STREAM_DIMENSION, Math.floor(value))
  );

  if (clampedDimension <= MIN_STREAM_DIMENSION) {
    return MIN_STREAM_DIMENSION;
  }

  return clampedDimension % 2 === 0
    ? clampedDimension
    : clampedDimension - 1;
}

export function normalizeSandboxStreamResolution(
  resolution: readonly [number, number]
): [number, number] {
  return [
    normalizeStreamDimension(resolution[0]),
    normalizeStreamDimension(resolution[1]),
  ];
}

export function getX11VncScaleCommand(
  resolution: readonly [number, number]
): string {
  const [width, height] = normalizeSandboxStreamResolution(resolution);

  return `DISPLAY=:0 x11vnc -R scale:${width}x${height}`;
}
