'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberOptions {
  duration?: number;
  formatter?: (value: number) => string;
  easing?: (t: number) => number;
}

/**
 * Custom hook for animating number changes with smooth morphing
 * @param targetValue - The target value to animate to
 * @param options - Animation options
 * @returns The current animated value
 */
export function useAnimatedNumber(
  targetValue: number,
  options: AnimatedNumberOptions = {}
): string {
  const {
    duration = 300,
    formatter = (n) => Math.round(n).toString(),
    easing = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // Ease-in-out quadratic
  } = options;

  const [displayValue, setDisplayValue] = useState(formatter(targetValue));
  const animationRef = useRef<number | undefined>(undefined);
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef<number | undefined>(undefined);
  const previousTargetRef = useRef(targetValue);

  useEffect(() => {
    // Skip animation if this is the initial render or value hasn't changed
    if (previousTargetRef.current === targetValue) {
      return;
    }

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startValue = startValueRef.current;
    const deltaValue = targetValue - startValue;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);

      const currentValue = startValue + (deltaValue * easedProgress);
      setDisplayValue(formatter(currentValue));
      startValueRef.current = currentValue;

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - ensure we end on exact value
        setDisplayValue(formatter(targetValue));
        startValueRef.current = targetValue;
        startTimeRef.current = undefined;
        animationRef.current = undefined;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    previousTargetRef.current = targetValue;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, formatter, easing]);

  return displayValue;
}

/**
 * Format number with thousands separator
 */
export function formatWithCommas(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * Format bytes to human-readable size with animation support
 * Returns both the numeric value and unit for separate animation
 */
export function useAnimatedSize(
  bytes: number,
  options: Omit<AnimatedNumberOptions, 'formatter'> = {}
): string {
  const [unit, setUnit] = useState('MB');
  const [divisor, setDivisor] = useState(1024 * 1024);

  // Determine the unit and divisor based on size
  useEffect(() => {
    if (bytes === 0) {
      setUnit('MB');
      setDivisor(1024 * 1024);
    } else if (bytes < 1024 * 1024) {
      setUnit('KB');
      setDivisor(1024);
    } else if (bytes >= 1024 * 1024 * 1024) {
      setUnit('GB');
      setDivisor(1024 * 1024 * 1024);
    } else {
      setUnit('MB');
      setDivisor(1024 * 1024);
    }
  }, [bytes]);

  const value = bytes / divisor;
  const animatedValue = useAnimatedNumber(value, {
    ...options,
    formatter: (n) => n.toFixed(1),
  });

  return bytes === 0 ? '0 MB' : `${animatedValue} ${unit}`;
}