import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';

type PauseHandler = { handlePause?: (sessionId?: unknown, context?: { source?: string }) => Promise<void> };

const wrapped = new WeakSet<object>();

/**
 * The content's media controls handler, told when the viewer pauses by a command (remote or
 * "Alexa, pause"). The pause itself is left to the app's handler, or to the SDK's default one.
 * Needed because Fire TV freezes the picture while Alexa listens: the pause command then finds
 * the player still and the player sends no pause event. A system pause (the display turns off)
 * is not the viewer's and is not reported.
 */
export function contentMediaControlHandler(appHandler: unknown, onViewerPause: () => void): unknown {
  const handler = (appHandler ?? new KeplerMediaControlHandler()) as PauseHandler & object;
  if (wrapped.has(handler) || typeof handler.handlePause !== 'function') {
    return handler;
  }
  const pause = handler.handlePause.bind(handler);
  handler.handlePause = async (sessionId, context) => {
    await pause(sessionId, context);
    if ((context?.source ?? 'USER') === 'USER') {
      onViewerPause();
    }
  };
  wrapped.add(handler);
  return handler;
}
