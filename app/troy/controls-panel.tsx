'use client';

import { useState } from 'react';
import { Gamepad2, Keyboard } from 'lucide-react';

type ControlScheme = 'xbox' | 'keyboard';
type Control = { keys: string[]; action: string; keyLabel?: string };
type ControlGroup = { title: string; controls: Control[] };
export type ControlsPanelProps = { controllerConnected: boolean; compact?: boolean };

const controls: Record<ControlScheme, ControlGroup[]> = {
  xbox: [
    { title: 'Move & explore', controls: [
      { keys: ['LS'], keyLabel: 'Left stick', action: 'Move' },
      { keys: ['RS'], keyLabel: 'Right stick', action: 'Look around' },
      { keys: ['RT'], keyLabel: 'Right trigger', action: 'Sprint' },
      { keys: ['D-pad ↑'], keyLabel: 'D-pad up', action: 'Open contracts' },
      { keys: ['View'], keyLabel: 'View button', action: 'Open controls' },
    ] },
    { title: 'Build & fight', controls: [
      { keys: ['A'], action: 'Build, collect, interact' },
      { keys: ['X'], action: 'Attack' },
      { keys: ['B'], action: 'Dodge' },
      { keys: ['Y'], action: 'Call an NPC' },
      { keys: ['LB', 'RB'], action: 'Switch weapon' },
      { keys: ['Menu ☰'], keyLabel: 'Menu button', action: 'Pause / resume' },
    ] },
  ],
  keyboard: [
    { title: 'Move & explore', controls: [
      { keys: ['WASD', '↑←↓→'], keyLabel: 'W A S D or arrow keys', action: 'Move' },
      { keys: ['Drag'], keyLabel: 'Mouse drag', action: 'Look around' },
      { keys: ['Wheel'], keyLabel: 'Mouse wheel', action: 'Zoom' },
      { keys: ['Shift'], action: 'Sprint' },
      { keys: ['Tab'], action: 'Open contracts' },
    ] },
    { title: 'Build & fight', controls: [
      { keys: ['E'], action: 'Build, collect, interact' },
      { keys: ['F', 'Space'], keyLabel: 'F or Space', action: 'Attack' },
      { keys: ['C'], action: 'Dodge' },
      { keys: ['T'], action: 'Call an NPC' },
      { keys: ['Q', 'R'], action: 'Switch weapon' },
      { keys: ['Esc'], action: 'Pause / resume' },
    ] },
  ],
};

const menuControls: Record<ControlScheme, Control[]> = {
  xbox: [
    { keys: ['D-pad', 'LS'], keyLabel: 'D-pad or left stick', action: 'Move focus' },
    { keys: ['A'], action: 'Choose / build' },
    { keys: ['B'], action: 'Go back' },
    { keys: ['RS'], keyLabel: 'Right stick', action: 'Scroll' },
  ],
  keyboard: [
    { keys: ['Tab', '⇧ Tab'], keyLabel: 'Tab or Shift plus Tab', action: 'Move focus' },
    { keys: ['Enter'], action: 'Choose / build' },
    { keys: ['Esc'], action: 'Go back' },
    { keys: ['Wheel'], keyLabel: 'Mouse wheel', action: 'Scroll' },
  ],
};

function ControlRow({ control, scheme }: { control: Control; scheme: ControlScheme }) {
  return <div className="controls-panel-row">
    <dt className="controls-panel-keys" aria-label={control.keyLabel}>
      {control.keys.map(key => <kbd key={key} aria-hidden={control.keyLabel ? true : undefined} className={`controls-panel-key${scheme === 'xbox' && /^[ABXY]$/.test(key) ? ` controls-panel-key-${key.toLowerCase()}` : ''}`}>{key}</kbd>)}
    </dt>
    <dd className="controls-panel-action">{control.action}</dd>
  </div>;
}

export function ControlsPanel({ controllerConnected, compact = false }: ControlsPanelProps) {
  const [choice, setChoice] = useState<ControlScheme | null>(null);
  const scheme = choice ?? (controllerConnected ? 'xbox' : 'keyboard');
  return <section className={`controls-panel${compact ? ' controls-panel-compact' : ''}`} aria-label="Game controls">
    <div className="controls-panel-heading">
      <h3 className="controls-panel-title">Controls</h3>
      <div className="controls-panel-switch" role="group" aria-label="Choose control scheme">
        <button type="button" aria-pressed={scheme === 'xbox'} onClick={() => setChoice('xbox')}><Gamepad2 size={16} aria-hidden="true" /><span>Xbox</span></button>
        <button type="button" aria-pressed={scheme === 'keyboard'} onClick={() => setChoice('keyboard')}><Keyboard size={16} aria-hidden="true" /><span>Keyboard</span></button>
      </div>
    </div>
    <div className="controls-panel-content">
      <div className="controls-panel-groups">
        {controls[scheme].map(group => <div className="controls-panel-group" key={group.title}>
          <h4 className="controls-panel-group-title">{group.title}</h4>
          <dl className="controls-panel-list">{group.controls.map(control => <ControlRow key={control.action} control={control} scheme={scheme} />)}</dl>
        </div>)}
      </div>
      <div className="controls-panel-menus">
        <h4 className="controls-panel-group-title">In menus</h4>
        <dl className="controls-panel-menu-list">{menuControls[scheme].map(control => <ControlRow key={control.action} control={control} scheme={scheme} />)}</dl>
      </div>
      {!controllerConnected && <p className="controls-panel-note">Connect a controller and press a button; keyboard remains available.</p>}
    </div>
  </section>;
}

export default ControlsPanel;
