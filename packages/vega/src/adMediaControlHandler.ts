import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';

export interface AdMediaControlOptions {
  /** Remote and voice may pause the ad. Default true; some publishers do not allow it. */
  allowPause: boolean;
}

const ignore = async (): Promise<void> => undefined;

/**
 * Media controls for an ad player (R21): play and pause act on the ad (pause only when allowed);
 * seeking, skipping, speed, start-over, next/previous and stop are ignored, so the remote or a
 * voice command cannot move through an ad.
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
    override handleStop = ignore;
  }
  if (!options.allowPause) {
    AdMediaControlHandler.prototype.handlePause = ignore;
    AdMediaControlHandler.prototype.handleTogglePlayPause = ignore;
  }
  return new AdMediaControlHandler();
}
