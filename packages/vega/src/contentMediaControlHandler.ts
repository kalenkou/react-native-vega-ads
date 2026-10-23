import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';

type PauseHandler = {
  handlePause?: (sessionId?: unknown, context?: { source?: string }) => Promise<void>;
  handlePlay?: (sessionId?: unknown) => Promise<void>;
  handleTogglePlayPause?: (sessionId?: unknown) => Promise<void>;
};

interface Listener {
  onViewerPause: () => void;
  isPaused?: () => boolean;
}

// Wrapped handlers, each with whom to tell now: an app may keep one handler for every player screen.
const listeners = new WeakMap<object, Listener>();

/**
 * The content's media controls handler, told when the viewer pauses by a command (remote or
 * "Alexa, pause"). The pause itself is left to the app's handler, or to the SDK's default one.
 * Needed because Fire TV freezes the picture while Alexa listens: the pause command then finds
 * the player still and the player sends no pause event. A system pause (the display turns off)
 * is not the viewer's and is not reported.
 * With `isPaused`, play/pause decides by it: the SDK decides by the last pause or playing event,
 * so after "Alexa, pause" it would pause again instead of playing.
 */
export function contentMediaControlHandler(
  appHandler: unknown,
  onViewerPause: () => void,
  isPaused?: () => boolean,
): unknown {
  const handler = (appHandler ?? new KeplerMediaControlHandler()) as PauseHandler & object;
  const known = listeners.get(handler);
  if (known) {
    known.onViewerPause = onViewerPause;
    known.isPaused = isPaused;
    return handler;
  }
  if (typeof handler.handlePause !== 'function') {
    return handler;
  }
  const listener: Listener = { onViewerPause, isPaused };
  const pause = handler.handlePause.bind(handler);
  handler.handlePause = async (sessionId, context) => {
    await pause(sessionId, context);
    if ((context?.source ?? 'USER') === 'USER') {
      listener.onViewerPause();
    }
  };
  const toggle = handler.handleTogglePlayPause?.bind(handler);
  const play = handler.handlePlay?.bind(handler);
  if (toggle && play) {
    handler.handleTogglePlayPause = async (sessionId) => {
      if (!listener.isPaused) {
        await toggle(sessionId);
      } else if (listener.isPaused()) {
        await play(sessionId);
      } else {
        await handler.handlePause?.(sessionId);
      }
    };
  }
  listeners.set(handler, listener);
  return handler;
}
