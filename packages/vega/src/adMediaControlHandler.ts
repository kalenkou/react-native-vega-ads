import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';

export interface AdMediaControlOptions {
  /** The viewer may pause the ad (remote, voice). Default true; some publishers do not allow it. */
  allowPause: boolean;
}

const ignore = async (): Promise<void> => undefined;

/**
 * Media controls for an ad player (R21): play and pause act on the ad; seeking, skipping,
 * speed, start-over and next/previous are ignored, so the remote or a voice command cannot
 * move through an ad. Stop pauses the ad. When the viewer may not pause ads, a pause or stop
 * from the viewer is ignored and play/pause only plays: the system still pauses (for example
 * when the TV turns off), and the play/pause key then goes on with the ad.
 */
export function createAdMediaControlHandler(options: AdMediaControlOptions): unknown {
  class AdMediaControlHandler extends KeplerMediaControlHandler {
    override handleSeek = ignore;
    override handleFastForward = ignore;
    override handleRewind = ignore;
    override handleSkipForward = ignore;
    override handleSkipBackward = ignore;
    override handleStartOver = ignore;
    override handleNext = ignore;
    override handlePrevious = ignore;
    override handleSetPlaybackSpeed = ignore;

    override async handleStop(sessionId?: unknown): Promise<void> {
      if (!options.allowPause) {
        return;
      }
      await super.handlePause(sessionId);
    }

    override async handlePause(sessionId?: unknown, context?: { source?: string }): Promise<void> {
      // No context means a plain viewer command; only a system pause (display off) goes through.
      if (!options.allowPause && (context?.source ?? 'USER') === 'USER') {
        return;
      }
      await super.handlePause(sessionId, context);
    }

    override async handleTogglePlayPause(sessionId?: unknown): Promise<void> {
      if (!options.allowPause) {
        await super.handlePlay(sessionId);
        return;
      }
      await super.handleTogglePlayPause(sessionId);
    }
  }
  return new AdMediaControlHandler();
}
