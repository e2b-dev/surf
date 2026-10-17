import {
  MAX_RESOLUTION_WIDTH,
  MAX_RESOLUTION_HEIGHT,
  MIN_RESOLUTION_WIDTH,
  MIN_RESOLUTION_HEIGHT,
  DEFAULT_RESOLUTION,
} from "@/lib/config";

/**
 * Derives a sane sandbox resolution from a measured viewport size.
 *
 * The sandbox resolution must stay decoupled from browser breakpoints:
 * Linux desktops (and the agent operating them) are not usable at mobile
 * viewport sizes. Large viewports are scaled down proportionally to fit the
 * maximum bounds, while viewports below the minimum bounds fall back to
 * DEFAULT_RESOLUTION entirely - the VNC stream scales the display down to
 * fit the container instead (noVNC "resize=scale" preserves aspect ratio
 * and maps pointer coordinates itself).
 *
 * @param measured - The measured container size [width, height], if any
 * @returns A resolution within the configured min/max bounds
 */
export function getSandboxResolution(
  measured?: [number, number]
): [number, number] {
  if (
    !measured ||
    !Number.isFinite(measured[0]) ||
    !Number.isFinite(measured[1]) ||
    measured[0] <= 0 ||
    measured[1] <= 0
  ) {
    return DEFAULT_RESOLUTION;
  }

  // Scale down proportionally so both dimensions fit the maximum bounds
  const scaleFactor = Math.min(
    MAX_RESOLUTION_WIDTH / measured[0],
    MAX_RESOLUTION_HEIGHT / measured[1],
    1
  );

  const width = Math.round(measured[0] * scaleFactor);
  const height = Math.round(measured[1] * scaleFactor);

  // Viewports below the minimum bounds (e.g. mobile breakpoints) would
  // produce a desktop too small for the agent - use the default resolution
  // and let the stream scale the display down instead
  if (width < MIN_RESOLUTION_WIDTH || height < MIN_RESOLUTION_HEIGHT) {
    return DEFAULT_RESOLUTION;
  }

  return [width, height];
}
