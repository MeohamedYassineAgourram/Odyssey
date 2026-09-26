export type PadButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'view' | 'menu' | 'up' | 'down' | 'left' | 'right';
export type ControllerFrame = {
  moveX: number; moveY: number; lookX: number; lookY: number; sprint: boolean;
  pressed: PadButton[]; navigate: 'up' | 'down' | 'left' | 'right' | null; navigationActive: boolean;
};
type Pad = Pick<Gamepad, 'axes' | 'buttons'>;
type ControllerCallbacks = {
  onFrame(frame: ControllerFrame): void;
  onConnection(connection: { connected: boolean; name: string }): void;
  onDisconnect(): void;
};
const BUTTONS: ReadonlyArray<readonly [PadButton, number]> = [
  ['a', 0], ['b', 1], ['x', 2], ['y', 3], ['lb', 4], ['rb', 5],
  ['view', 8], ['menu', 9], ['up', 12], ['down', 13], ['left', 14], ['right', 15],
];
const neutral = (): ControllerFrame => ({ moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, pressed: [], navigate: null, navigationActive: false });
const held = (pad: Pad, index: number) => Boolean(pad.buttons[index]?.pressed || pad.buttons[index]?.value > .5);

/** Standard Gamepad axes use a radial dead zone so diagonal speed stays bounded. */
export function readStick(rawX = 0, rawY = 0, deadZone = .18): { x: number; y: number } {
  const x = Number.isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0;
  const y = Number.isFinite(rawY) ? Math.max(-1, Math.min(1, rawY)) : 0;
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const scale = (Math.min(1, length) - deadZone) / (1 - deadZone) / length;
  return { x: x * scale, y: y * scale };
}

/** Stateful only for button edges and menu repeat; reset at every input session boundary. */
export function createControllerDecoder() {
  let previous: Set<PadButton> | null = null;
  let direction: ControllerFrame['navigate'] = null;
  let nextRepeat = 0;
  let navigationArmed = false;
  return {
    reset() { previous = null; direction = null; nextRepeat = 0; navigationArmed = false; },
    read(pad: Pad, now: number): ControllerFrame {
      const move = readStick(pad.axes[0], pad.axes[1]);
      const look = readStick(pad.axes[2], pad.axes[3]);
      const down = new Set(BUTTONS.filter(([, index]) => held(pad, index)).map(([name]) => name));
      const pressed = previous ? [...down].filter(button => !previous!.has(button)) : [];
      previous = down;
      let requested: ControllerFrame['navigate'] = null;
      if (down.has('up')) requested = 'up';
      else if (down.has('down')) requested = 'down';
      else if (down.has('left')) requested = 'left';
      else if (down.has('right')) requested = 'right';
      else if (Math.max(Math.abs(move.x), Math.abs(move.y)) >= .45) {
        requested = Math.abs(move.x) > Math.abs(move.y) ? (move.x > 0 ? 'right' : 'left') : (move.y > 0 ? 'down' : 'up');
      }
      let navigate: ControllerFrame['navigate'] = null;
      if (!requested) { navigationArmed = true; direction = null; }
      else if (navigationArmed) {
        if (requested !== direction) { navigate = requested; nextRepeat = now + 350; }
        else if (now >= nextRepeat) { navigate = requested; nextRepeat = now + 140; }
        direction = requested;
      }
      return { moveX: move.x, moveY: move.y === 0 ? 0 : -move.y, lookX: look.x, lookY: look.y, sprint: held(pad, 7) || held(pad, 10), pressed, navigate, navigationActive: Boolean(requested) };
    },
  };
}

/** Poll fresh snapshots; gamepad events alone do not report stick/button changes. */
export function startController(callbacks: ControllerCallbacks): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    callbacks.onFrame(neutral());
    return () => {};
  }
  const decoder = createControllerDecoder();
  const activity = new Map<number, { signature: string; order: number }>();
  let selected: { index: number; id: string } | null = null;
  let order = 0, frame = 0, disposed = false, focused = true;
  const reset = () => { decoder.reset(); callbacks.onFrame(neutral()); };
  const disconnect = () => {
    if (!selected) return;
    selected = null; reset();
    callbacks.onConnection({ connected: false, name: '' });
    callbacks.onDisconnect();
  };
  const poll = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(poll);
    if (document.hidden || !focused) { reset(); return; }
    let pads: Gamepad[];
    try { pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad && pad.connected && pad.mapping === 'standard'); }
    catch { reset(); return; } // Permissions Policy or a temporarily unavailable API.
    if (selected && !pads.some(pad => pad.index === selected!.index && pad.id === selected!.id)) disconnect();
    for (const index of activity.keys()) if (!pads.some(pad => pad.index === index)) activity.delete(index);
    for (const pad of pads) {
      const move = readStick(pad.axes[0], pad.axes[1]), look = readStick(pad.axes[2], pad.axes[3]);
      const axes = [move.x, move.y, look.x, look.y].map(value => Math.round(value * 10));
      const buttons = pad.buttons.map((_, index) => Number(held(pad, index)));
      const signature = [...axes, ...buttons].join(',');
      const before = activity.get(pad.index);
      const active = axes.some(value => Math.abs(value) >= 3) || buttons.some(Boolean);
      activity.set(pad.index, { signature, order: active && signature !== before?.signature ? ++order : before?.order ?? 0 });
    }
    const current = pads.find(pad => pad.index === selected?.index);
    let chosen = current ?? pads[0];
    for (const pad of pads) if ((activity.get(pad.index)?.order ?? 0) > (activity.get(chosen?.index)?.order ?? 0)) chosen = pad;
    if (!chosen) { callbacks.onFrame(neutral()); return; }
    if (chosen.index !== selected?.index || chosen.id !== selected?.id) {
      selected = { index: chosen.index, id: chosen.id }; decoder.reset();
      callbacks.onConnection({ connected: true, name: /xbox|xinput/i.test(chosen.id) ? 'Xbox controller' : 'Game controller' });
    }
    callbacks.onFrame(decoder.read(chosen, now));
  };
  const onDisconnect = (event: GamepadEvent) => {
    activity.delete(event.gamepad.index);
    if (event.gamepad.index === selected?.index) disconnect();
  };
  const onBlur = () => { focused = false; reset(); };
  const onFocus = () => { focused = true; reset(); };
  const onVisibility = () => { reset(); };
  window.addEventListener('gamepaddisconnected', onDisconnect);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  frame = requestAnimationFrame(poll);
  return () => {
    disposed = true; cancelAnimationFrame(frame);
    window.removeEventListener('gamepaddisconnected', onDisconnect);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    callbacks.onFrame(neutral());
  };
}
