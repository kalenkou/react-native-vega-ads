import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';

type PauseHandler = { handlePause?: (sessionId?: unknown, context?: { source?: string }) => Promise<void> };

// Wrapped handlers, each with whom to tell now: an app may keep one handler for every player screen.
const listeners = new WeakMap<object, { onViewerPause: () => void }>();

/**
 * The content's media controls handler, told when the viewer pauses by a command (remote or
 * "Alexa, pause"). The pause itself is left to the app's handler, or to the SDK's default one.
 * Needed because Fire TV freezes the picture while Alexa listens: the pause command then finds
 * the player still and the player sends no pause event. A system pause (the display turns off)
 * is not the viewer's and is not reported.
 */
export function contentMediaControlHandler(appHandler: unknown, onViewerPause: () => void): unknown {
  const handler = (appHandler ?? new KeplerMediaControlHandler()) as PauseHandler & object;
  const known = listeners.get(handler);
  if (known) {
    known.onViewerPause = onViewerPause;
    return handler;
  }
  if (typeof handler.handlePause !== 'function') {
    return handler;
  }
  const listener = { onViewerPause };
  const pause = handler.handlePause.bind(handler);
  handler.handlePause = async (sessionId, context) => {
    await pause(sessionId, context);
    if ((context?.source ?? 'USER') === 'USER') {
      listener.onViewerPause();
    }
  };
  listeners.set(handler, listener);
  return handler;
}
