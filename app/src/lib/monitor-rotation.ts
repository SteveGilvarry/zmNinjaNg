const ROTATE_PREFIX = 'ROTATE_';

export type MonitorRotation =
  | { kind: 'none' }
  | { kind: 'degrees'; degrees: number }
  | { kind: 'flip_horizontal' }
  | { kind: 'flip_vertical' }
  | { kind: 'unknown' };

export function parseMonitorRotation(orientation?: string | null): MonitorRotation {
  const value = orientation?.trim();

  if (!value) {
    return { kind: 'none' };
  }

  const normalized = value.toUpperCase();

  if (normalized === 'FLIP_HORI') {
    return { kind: 'flip_horizontal' };
  }

  if (normalized === 'FLIP_VERT') {
    return { kind: 'flip_vertical' };
  }

  const rotationValue = normalized.startsWith(ROTATE_PREFIX)
    ? normalized.slice(ROTATE_PREFIX.length)
    : normalized;
  const degrees = Number.parseInt(rotationValue, 10);

  if (Number.isNaN(degrees)) {
    return { kind: 'unknown' };
  }

  if (degrees % 360 === 0) {
    return { kind: 'none' };
  }

  return { kind: 'degrees', degrees };
}

export function getOrientedResolution(
  width: string | number | undefined,
  height: string | number | undefined,
  orientation: string | undefined | null
): string {
  const w = Number(width);
  const h = Number(height);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return `${width ?? ''}${width ? 'x' : ''}${height ?? ''}`;
  }

  const rotation = parseMonitorRotation(orientation);
  if (rotation.kind === 'degrees') {
    const normalized = ((rotation.degrees % 360) + 360) % 360;
    if (normalized === 90 || normalized === 270) {
      return `${h}x${w}`;
    }
  }

  return `${w}x${h}`;
}

/**
 * CSS styles to render a <video>/<img> rotated per the monitor Orientation,
 * filling its container. For 90°/270° the media is sized with container-query
 * units (the container must establish a size query container, which the returned
 * `container` style does) so it swaps dimensions cleanly after rotation.
 */
export function getRotatedMediaStyle(
  orientation: string | undefined | null,
  objectFit: import('react').CSSProperties['objectFit'] = 'contain',
): { container: import('react').CSSProperties; media: import('react').CSSProperties } {
  const base: import('react').CSSProperties = { width: '100%', height: '100%', objectFit };
  const rotation = parseMonitorRotation(orientation);

  if (rotation.kind === 'flip_horizontal') {
    return { container: {}, media: { ...base, transform: 'scaleX(-1)' } };
  }
  if (rotation.kind === 'flip_vertical') {
    return { container: {}, media: { ...base, transform: 'scaleY(-1)' } };
  }
  if (rotation.kind === 'degrees') {
    const n = ((rotation.degrees % 360) + 360) % 360;
    if (n === 180) {
      return { container: {}, media: { ...base, transform: 'rotate(180deg)' } };
    }
    if (n === 90 || n === 270) {
      return {
        container: { containerType: 'size' },
        media: {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100cqh',
          height: '100cqw',
          // Defeat Tailwind preflight's `max-width:100%` on <video>/<img>, which
          // would otherwise clamp the swapped (container-query) dimensions back
          // to the container width and render a square.
          maxWidth: 'none',
          maxHeight: 'none',
          objectFit,
          transform: `translate(-50%, -50%) rotate(${n}deg)`,
        },
      };
    }
  }
  return { container: {}, media: base };
}

export function getMonitorAspectRatio(
  width?: string | number | null,
  height?: string | number | null,
  orientation?: string | null
): string | undefined {
  const w = Number(width);
  const h = Number(height);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return undefined;
  }

  const rotation = parseMonitorRotation(orientation);
  let orientedWidth = w;
  let orientedHeight = h;

  if (rotation.kind === 'degrees') {
    const normalized = ((rotation.degrees % 360) + 360) % 360;
    if (normalized === 90 || normalized === 270) {
      orientedWidth = h;
      orientedHeight = w;
    }
  }

  return `${orientedWidth} / ${orientedHeight}`;
}
