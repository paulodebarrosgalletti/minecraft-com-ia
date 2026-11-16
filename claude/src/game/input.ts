// Keyboard / mouse state with pointer lock management.

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>(); // pressed since last frame
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null;
  private lastTap: Record<string, number> = {};
  doubleTapped = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'Tab', 'F3', 'F5', 'ArrowUp', 'ArrowDown', 'Quote'].includes(e.code) || (e.ctrlKey && e.code !== 'KeyC' && e.code !== 'KeyV')) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        const now = performance.now();
        if (now - (this.lastTap[e.code] ?? 0) < 300) this.doubleTapped.add(e.code);
        this.lastTap[e.code] = now;
      }
      this.keys.add(e.code);
      this.onKey?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = [false, false, false]; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { this.mouseDown[e.button] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore absurd spikes (browser bug on lock)
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouseDown = [false, false, false]; }
      this.onLockChange?.(this.locked);
    });
  }

  /** Requests pointer lock; onFail is called if the browser refuses (e.g. right after Esc). */
  lock(onFail?: () => void) {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => onFail?.());
    } catch { onFail?.(); }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
    this.doubleTapped.clear();
    this.mousePressed = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
