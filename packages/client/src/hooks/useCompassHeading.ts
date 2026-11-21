import { useState, useEffect, useRef, useCallback } from 'react';

export interface CompassHeadingState {
  heading: number; // Effective device heading (0-360 deg clockwise from North)
  rawSensorHeading: number | null; // Raw compass heading from hardware
  isSensorActive: boolean; // Whether hardware sensor is delivering events
  manualOffset: number; // Manual calibration/drag rotation offset in degrees
  permissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  setManualOffset: (offset: number) => void;
  rotateBy: (delta: number) => void;
  resetToSensor: () => void;
}

export function useCompassHeading(gpsHeading?: number | null): CompassHeadingState {
  const [rawSensorHeading, setRawSensorHeading] = useState<number | null>(null);
  const [manualOffset, setManualOffsetState] = useState<number>(0);
  const [isSensorActive, setIsSensorActive] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const hasAbsoluteRef = useRef(false);

  // Auto request or check permission on iOS / standard browsers
  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionGranted(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    setPermissionGranted(true);
    return true;
  }, []);

  useEffect(() => {
    const handleAbsoluteOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha != null && !isNaN(e.alpha)) {
        hasAbsoluteRef.current = true;
        setIsSensorActive(true);
        // W3C spec: alpha is 0 at North and increases counter-clockwise
        const compass = (360 - e.alpha) % 360;
        setRawSensorHeading(compass);
      }
    };

    const handleStandardOrientation = (e: any) => {
      // iOS Safari provides webkitCompassHeading directly (degrees clockwise from North)
      if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
        setIsSensorActive(true);
        setRawSensorHeading(e.webkitCompassHeading);
      } else if (!hasAbsoluteRef.current && e.alpha != null && !isNaN(e.alpha)) {
        setIsSensorActive(true);
        const compass = (360 - e.alpha) % 360;
        setRawSensorHeading(compass);
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation as any, true);
      window.addEventListener('deviceorientation', handleStandardOrientation, true);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientation as any, true);
        window.removeEventListener('deviceorientation', handleStandardOrientation, true);
      }
    };
  }, []);

  // Effective base heading: Hardware sensor -> GPS heading (if valid) -> 0
  const baseHeading =
    rawSensorHeading ??
    (gpsHeading != null && !isNaN(gpsHeading) && gpsHeading >= 0 ? gpsHeading : 0);

  const effectiveHeading = (baseHeading + manualOffset + 360) % 360;

  const setManualOffset = useCallback((offset: number) => {
    setManualOffsetState((offset % 360 + 360) % 360);
  }, []);

  const rotateBy = useCallback((delta: number) => {
    setManualOffsetState((prev) => (prev + delta + 360) % 360);
  }, []);

  const resetToSensor = useCallback(() => {
    setManualOffsetState(0);
  }, []);

  return {
    heading: effectiveHeading,
    rawSensorHeading,
    isSensorActive,
    manualOffset,
    permissionGranted,
    requestPermission,
    setManualOffset,
    rotateBy,
    resetToSensor,
  };
}

/** Returns the cardinal/ordinal direction string (e.g. "N", "NE", "E") */
export function getCardinalDirection(degrees: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((degrees % 360 + 360) % 360) / 45) % 8;
  return cardinals[index];
}

/** Computes the shortest relative angle unwrapped so CSS transitions don't jump 360 degrees */
export function unwrapAngle(prevAngle: number, targetAngle: number): number {
  const normalizedTarget = (targetAngle % 360 + 360) % 360;
  const currentNormalized = (prevAngle % 360 + 360) % 360;
  let diff = normalizedTarget - currentNormalized;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return prevAngle + diff;
}

/** Computes friendly navigation guidance based on relative angle (e.g. "STRAIGHT AHEAD") */
export function getRelativeDirectionLabel(relativeAngle: number): string {
  const norm = (relativeAngle % 360 + 360) % 360;
  if (norm <= 20 || norm >= 340) return 'STRAIGHT AHEAD';
  if (norm > 20 && norm <= 65) return 'BEAR SLIGHT RIGHT';
  if (norm > 65 && norm <= 115) return 'TURN RIGHT';
  if (norm > 115 && norm <= 160) return 'BEAR SHARP RIGHT';
  if (norm > 160 && norm <= 200) return 'BEHIND YOU';
  if (norm > 200 && norm <= 245) return 'BEAR SHARP LEFT';
  if (norm > 245 && norm <= 295) return 'TURN LEFT';
  return 'BEAR SLIGHT LEFT';
}
