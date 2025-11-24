import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';

interface ComparisonSliderProps {
  beforeImage: string;
  afterImage: string;
  className?: string;
}

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ beforeImage, afterImage, className }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Detect Mobile Orientation
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMove = (clientX: number, clientY: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      if (isMobile) {
        // Vertical Logic (Top to Bottom) for Mobile
        const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
        const percentage = (y / rect.height) * 100;
        setSliderPosition(percentage);
      } else {
        // Horizontal Logic (Left to Right) for Desktop
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percentage = (x / rect.width) * 100;
        setSliderPosition(percentage);
      }
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    isDragging.current = true;
  };
  
  const onMouseUp = () => (isDragging.current = false);
  
  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
     isDragging.current = true;
     handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => (isDragging.current = false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none group ${isMobile ? 'cursor-row-resize' : 'cursor-col-resize'} ${className}`}
      onMouseMove={onMouseMove}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(e); handleMove(e.clientX, e.clientY); }} 
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart}
    >
      {/* After Image (Background / "New Design") */}
      <img 
        src={afterImage} 
        alt="After" 
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      
      {/* Label After ("New Design") */}
      {/* Condition: Fade out when slider passes 50% towards the right (Original view) */}
      <div 
        className={`absolute ${isMobile ? 'bottom-4' : 'top-4'} right-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm z-10 pointer-events-none border border-white/10 shadow-lg transition-opacity duration-300`}
        style={{ opacity: sliderPosition < 55 ? 1 : 0 }}
      >
        طرح جدید
      </div>

      {/* Before Image (Clipped / "Original") */}
      <div 
        className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none shadow-[0_0_20px_rgba(0,0,0,0.3)]"
        style={{ 
          width: isMobile ? '100%' : `${sliderPosition}%`,
          height: isMobile ? `${sliderPosition}%` : '100%',
          borderBottom: isMobile ? '2px solid white' : 'none',
          borderRight: !isMobile ? '2px solid white' : 'none',
        }}
      >
        <img 
          src={beforeImage} 
          alt="Before" 
          className="absolute inset-0 w-full h-full object-cover max-w-none"
          style={{ 
            width: containerRef.current?.offsetWidth || '100%',
            height: containerRef.current?.offsetHeight || '100%' 
          }} 
        />
        {/* Label Before ("Original") */}
        {/* Condition: Fade out when slider is very close to 0 (Left) where Original is hidden */}
         <div 
           className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm z-10 border border-white/10 shadow-lg transition-opacity duration-300"
           style={{ opacity: sliderPosition > 10 ? 1 : 0 }}
         >
          طرح اصلی
        </div>
      </div>

      {/* Slider Handle */}
      <div 
        className={`absolute z-20 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center ${isMobile ? 'w-full h-0' : 'h-full w-0'}`}
        style={{ 
          left: isMobile ? '0' : `${sliderPosition}%`,
          top: isMobile ? `${sliderPosition}%` : '0',
        }}
      >
        <div 
          className="absolute w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xl text-primary border-2 border-gray-100 hover:scale-110 transition-transform cursor-pointer"
          style={{
            transform: 'translate(-50%, -50%)'
          }}
        >
          {isMobile ? <ArrowUpDown size={18} /> : <ArrowLeftRight size={18} />}
        </div>
      </div>
    </div>
  );
};

export default ComparisonSlider;