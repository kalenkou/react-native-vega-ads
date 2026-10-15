import {useCallback, useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {useReportFullyDrawn} from '@amazon-devices/kepler-performance-api';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';

/** The splash goes even if the first screen never says it is ready (poster server down). */
const READY_TIMEOUT_MS = 5000;

/**
 * Launch markers for the app's root component. The system splash (assets/raw/SplashScreenImages.zip)
 * is the first frame and stays until the first screen is ready; then the app reports fully drawn
 * and hides the splash. Call it first in the root component; call the returned function when the
 * first screen is drawn (later calls do nothing).
 */
export const useLaunchReady = (): (() => void) => {
  usePreventHideSplashScreen();
  const reportFullyDrawn = useReportFullyDrawn();
  const hideSplash = useHideSplashScreenCallback();
  const ready = useRef(false);

  const onReady = useCallback(() => {
    if (ready.current) {
      return;
    }
    ready.current = true;
    reportFullyDrawn();
    hideSplash();
  }, [reportFullyDrawn, hideSplash]);

  useEffect(() => {
    const timer = setTimeout(onReady, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onReady]);

  // Warm start: back from the background, the screen is already drawn.
  useEffect(() => {
    let last = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      if (ready.current && state === 'active' && last !== 'active') {
        reportFullyDrawn();
      }
      last = state;
    });
    return () => subscription.remove();
  }, [reportFullyDrawn]);

  return onReady;
};
