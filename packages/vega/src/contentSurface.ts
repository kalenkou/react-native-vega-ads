/** A player that can show a w3cmedia video surface. */
export interface SurfacePlayer {
  setSurfaceHandle(handle: string): void;
  clearSurfaceHandle(handle: string): void;
}

// The surface each content player shows, so that whoever releases the player first (the view or
// useVideoPlayer) clears the surface before deinitialize(), in Amazon's order.
const shown = new WeakMap<SurfacePlayer, string>();

export function attachSurface(player: SurfacePlayer, handle: string): void {
  player.setSurfaceHandle(handle);
  shown.set(player, handle);
}

/** Clears the player's surface if it still shows one. Safe to call twice. */
export function detachSurface(player: SurfacePlayer): void {
  const handle = shown.get(player);
  if (handle === undefined) {
    return;
  }
  shown.delete(player);
  try {
    player.clearSurfaceHandle(handle);
  } catch {
    // The surface may be gone already; the player is being released anyway.
  }
}
