/** Controller menus share real buttons with mouse/keyboard; never simulate key presses. */
export function controllerTargets(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input[type="checkbox"]:not(:disabled),summary'))
    .filter(element => element.getClientRects().length > 0 && !element.closest('[hidden],[inert],[aria-hidden="true"]'));
}

export function clearControllerFocus(): void {
  document.querySelectorAll('[data-pad-focus]').forEach(element => element.removeAttribute('data-pad-focus'));
}

export function focusControllerTarget(target: HTMLElement | undefined): void {
  clearControllerFocus();
  if (!target) return;
  target.dataset.padFocus = 'true';
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}

export function navigateControllerMenu(scope: ParentNode, direction: 'up' | 'down' | 'left' | 'right'): void {
  const targets = controllerTargets(scope);
  if (!targets.length) return;
  const index = targets.findIndex(target => target.dataset.padFocus === 'true');
  const step = direction === 'up' || direction === 'left' ? -1 : 1;
  focusControllerTarget(targets[index < 0 ? (step < 0 ? targets.length - 1 : 0) : (index + step + targets.length) % targets.length]);
}

export function activateControllerTarget(scope: ParentNode): void {
  const targets = controllerTargets(scope);
  const selected = targets.find(target => target.dataset.padFocus === 'true');
  // A resource action can disable itself. Never redirect that press to another action.
  if (selected) selected.click();
  else focusControllerTarget(targets[0]);
}
