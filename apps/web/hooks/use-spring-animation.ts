'use client';

import { useEffect, useRef, useState } from 'react';

interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

interface SpringAnimation {
  value: number;
  isAnimating: boolean;
}

/**
 * Custom hook for spring physics animations
 * Provides natural, bouncy motion for interactive elements
 */
export function useSpringAnimation(
  targetValue: number,
  config: SpringConfig = {}
): SpringAnimation {
  const {
    stiffness = 300,  // Higher = snappier
    damping = 20,      // Higher = less bouncy
    mass = 1,          // Higher = slower
  } = config;

  const [currentValue, setCurrentValue] = useState(targetValue);
  const [isAnimating, setIsAnimating] = useState(false);

  const animationRef = useRef<number | undefined>(undefined);
  const velocityRef = useRef(0);
  const positionRef = useRef(targetValue);
  const lastTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Skip if we're already at the target
    const distance = Math.abs(targetValue - positionRef.current);
    if (distance < 0.0001) {
      return;
    }

    setIsAnimating(true);

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // Cap at 100ms
      lastTimeRef.current = timestamp;

      // Spring physics calculation
      const displacement = targetValue - positionRef.current;
      const springForce = displacement * stiffness;
      const dampingForce = velocityRef.current * damping;
      const acceleration = (springForce - dampingForce) / mass;

      // Update velocity and position
      velocityRef.current += acceleration * deltaTime;
      positionRef.current += velocityRef.current * deltaTime;

      // Update the displayed value
      setCurrentValue(positionRef.current);

      // Check if animation should continue
      const isMoving = Math.abs(velocityRef.current) > 0.01;
      const hasDistance = Math.abs(targetValue - positionRef.current) > 0.001;

      if (isMoving || hasDistance) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Snap to final value and stop
        positionRef.current = targetValue;
        velocityRef.current = 0;
        setCurrentValue(targetValue);
        setIsAnimating(false);
        lastTimeRef.current = undefined;
        animationRef.current = undefined;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, stiffness, damping, mass]);

  return { value: currentValue, isAnimating };
}

/**
 * Hook for spring-based scale animations
 * Perfect for button interactions with natural physics
 */
export function useSpringScale(
  isHovered: boolean,
  isPressed: boolean,
  config?: SpringConfig
): number {
  // Determine target scale based on state
  const targetScale = isPressed ? 0.95 : isHovered ? 1.05 : 1.0;

  const { value } = useSpringAnimation(targetScale, {
    stiffness: config?.stiffness ?? 400,
    damping: config?.damping ?? 25,
    mass: config?.mass ?? 1,
  });

  return value;
}