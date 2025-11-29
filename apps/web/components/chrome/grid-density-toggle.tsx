'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type GridDensity = 'compact' | 'dense' | 'comfortable';

interface GridDensityToggleProps {
  value: GridDensity;
  onChange: (density: GridDensity) => void;
  className?: string;
  buttonClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Grid density toggle component for terminal aesthetic
 * Compact (8 cols, 4px), Dense (6 cols, 8px - default), Comfortable (4 cols, 16px)
 */
export function GridDensityToggle({
  value,
  onChange,
  className,
  buttonClassName,
  size = 'md',
}: GridDensityToggleProps) {
  const sizeConfig = {
    sm: {
      button: 'w-8 h-8',
      icon: 'w-4 h-4',
      gap: 'gap-0.5',
      fontSize: 'text-xs',
    },
    md: {
      button: 'w-10 h-10',
      icon: 'w-5 h-5',
      gap: 'gap-1',
      fontSize: 'text-sm',
    },
    lg: {
      button: 'w-12 h-12',
      icon: 'w-6 h-6',
      gap: 'gap-1.5',
      fontSize: 'text-base',
    },
  };

  const config = sizeConfig[size];

  const densityModes: Array<{
    value: GridDensity;
    label: string;
    icon: React.ReactElement;
  }> = [
    {
      value: 'compact',
      label: 'Compact',
      icon: (
        <svg
          className={config.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {/* 8-grid icon - densest */}
          <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <rect x="3" y="3" width="4" height="4" />
            <rect x="10" y="3" width="4" height="4" />
            <rect x="17" y="3" width="4" height="4" />
            <rect x="3" y="10" width="4" height="4" />
            <rect x="10" y="10" width="4" height="4" />
            <rect x="17" y="10" width="4" height="4" />
            <rect x="3" y="17" width="4" height="4" />
            <rect x="10" y="17" width="4" height="4" />
          </g>
        </svg>
      ),
    },
    {
      value: 'dense',
      label: 'Dense',
      icon: (
        <svg
          className={config.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {/* 6-grid icon - default terminal aesthetic */}
          <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <rect x="2" y="2" width="6" height="6" />
            <rect x="11" y="2" width="6" height="6" />
            <rect x="2" y="11" width="6" height="6" />
            <rect x="11" y="11" width="6" height="6" />
            <rect x="16" y="16" width="6" height="6" />
          </g>
        </svg>
      ),
    },
    {
      value: 'comfortable',
      label: 'Comfortable',
      icon: (
        <svg
          className={config.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {/* 4-grid icon - most spacious */}
          <g strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <rect x="2" y="2" width="8" height="8" />
            <rect x="14" y="2" width="8" height="8" />
            <rect x="2" y="14" width="8" height="8" />
            <rect x="14" y="14" width="8" height="8" />
          </g>
        </svg>
      ),
    },
  ];

  return (
    <div
      className={cn(
        'flex items-center',
        config.gap,
        'bg-muted p-0.5',
        className
      )}
      role="radiogroup"
      aria-label="Grid density"
    >
      {densityModes.map((mode) => {
        const isActive = value === mode.value;

        return (
          <button
            key={mode.value}
            onClick={() => onChange(mode.value)}
            className={cn(
              // Base styles
              'flex items-center justify-center',
              ' transition-all duration-200',
              'group relative',

              // Size
              config.button,

              // Colors and states
              isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',

              // Touch target optimization
              'touch-manipulation',

              // Custom classes
              buttonClassName
            )}
            role="radio"
            aria-checked={isActive}
            aria-label={mode.label}
            title={mode.label}
          >
            <span className={cn(
              'transition-transform duration-200',
              isActive && 'scale-110'
            )}>
              {mode.icon}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                <div className="w-1 h-1 bg-green-600" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
