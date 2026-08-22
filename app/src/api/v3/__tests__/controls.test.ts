import { describe, it, expect } from 'vitest';
import { commandToPath } from '../controls';

describe('commandToPath (ZM PTZ command -> v3 endpoint)', () => {
  it('maps continuous and relative moves (8 directions)', () => {
    expect(commandToPath('moveConUp')).toBe('move/up');
    expect(commandToPath('moveConDown')).toBe('move/down');
    expect(commandToPath('moveConLeft')).toBe('move/left');
    expect(commandToPath('moveConRight')).toBe('move/right');
    expect(commandToPath('moveConUpLeft')).toBe('move/up-left');
    expect(commandToPath('moveConUpRight')).toBe('move/up-right');
    expect(commandToPath('moveConDownLeft')).toBe('move/down-left');
    expect(commandToPath('moveConDownRight')).toBe('move/down-right');
    expect(commandToPath('moveRelUp')).toBe('move/up');
    expect(commandToPath('moveRelDownRight')).toBe('move/down-right');
  });

  it('maps stop, zoom, focus, presets, home', () => {
    expect(commandToPath('moveStop')).toBe('move/stop');
    expect(commandToPath('zoomStop')).toBe('zoom/stop');
    expect(commandToPath('zoomConTele')).toBe('zoom/in');
    expect(commandToPath('zoomConWide')).toBe('zoom/out');
    expect(commandToPath('zoomRelTele')).toBe('zoom/in');
    expect(commandToPath('focusNear')).toBe('focus/near');
    expect(commandToPath('focusFar')).toBe('focus/far');
    expect(commandToPath('focusAuto')).toBe('focus/auto');
    expect(commandToPath('presetGoto3')).toBe('presets/3/goto');
    expect(commandToPath('presetSet7')).toBe('presets/7/set');
    expect(commandToPath('presetHome')).toBe('home');
    expect(commandToPath('home')).toBe('home');
  });

  it('returns null for unrecognised commands', () => {
    expect(commandToPath('bogus')).toBeNull();
    expect(commandToPath('moveConSideways')).toBeNull();
    expect(commandToPath('')).toBeNull();
  });
});
