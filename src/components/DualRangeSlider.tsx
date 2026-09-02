import React, { useCallback } from 'react';

interface DualRangeSliderProps {
  min: number;
  max: number;
  selectedMin: number;
  selectedMax: number;
  onChange: (newMin: number, newMax: number) => void;
  className?: string;
}

export const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  selectedMin,
  selectedMax,
  onChange,
  className = '',
}) => {
  // Ensure bounds are valid
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const totalRange = safeMax - safeMin || 1;

  // Percentage positions for the colored bar
  const minPercent = Math.max(0, Math.min(100, ((selectedMin - safeMin) / totalRange) * 100));
  const maxPercent = Math.max(0, Math.min(100, ((selectedMax - safeMin) / totalRange) * 100));

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      // Ensure min does not cross max
      const clampedVal = Math.min(val, selectedMax);
      onChange(clampedVal, selectedMax);
    },
    [selectedMax, onChange]
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      // Ensure max does not cross min
      const clampedVal = Math.max(val, selectedMin);
      onChange(selectedMin, clampedVal);
    },
    [selectedMin, onChange]
  );

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Visual Track container */}
      <div className="relative w-full h-2 bg-neutral-800 rounded-full border border-neutral-700/80 overflow-visible">
        {/* Active Range Fill (Between the 2 Knobs) */}
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all duration-75"
          style={{
            left: `${minPercent}%`,
            width: `${Math.max(0, maxPercent - minPercent)}%`,
          }}
        />
      </div>

      {/* Two Overlapping Sliders sharing the exact same track */}
      <div className="dual-range-slider absolute inset-0 w-full h-full flex items-center">
        {/* Min Knob Slider */}
        <input
          id="dual-slider-min"
          type="range"
          min={safeMin}
          max={safeMax}
          value={selectedMin}
          onChange={handleMinChange}
          aria-label="Minimum anime release year"
          className="absolute inset-0 w-full h-full opacity-100 z-20 cursor-grab active:cursor-grabbing"
          style={{
            // Keep min on top when dragged towards the right edge
            zIndex: selectedMin > safeMax - 5 ? 25 : 20,
          }}
        />

        {/* Max Knob Slider */}
        <input
          id="dual-slider-max"
          type="range"
          min={safeMin}
          max={safeMax}
          value={selectedMax}
          onChange={handleMaxChange}
          aria-label="Maximum anime release year"
          className="absolute inset-0 w-full h-full opacity-100 z-21 cursor-grab active:cursor-grabbing"
        />
      </div>
    </div>
  );
};
