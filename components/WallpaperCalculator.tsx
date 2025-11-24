import React, { useState, useEffect } from 'react';
import { Calculator, Ruler } from 'lucide-react';

const ROLL_WIDTHS = [45, 60, 90, 120];

const WallpaperCalculator: React.FC = () => {
  const [wallWidth, setWallWidth] = useState<string>('');
  const [wallHeight, setWallHeight] = useState<string>('');
  const [rollWidth, setRollWidth] = useState<number>(45);
  const [result, setResult] = useState<{ totalLength: number; strips: number; area: number } | null>(null);

  const calculate = () => {
    const w = parseFloat(wallWidth);
    const h = parseFloat(wallHeight);

    if (!w || !h || w <= 0 || h <= 0) {
      setResult(null);
      return;
    }

    // Logic:
    // 1. Calculate how many vertical strips are needed (Width / Roll Width)
    const strips = Math.ceil(w / rollWidth);
    
    // 2. Total length needed (Strips * Height)
    // We add 10cm margin to height for cutting
    const heightWithMargin = h + 10; 
    const totalLengthCm = strips * heightWithMargin;
    const totalLengthMeters = totalLengthCm / 100;

    const areaM2 = (w * h) / 10000;

    setResult({
      totalLength: parseFloat(totalLengthMeters.toFixed(2)),
      strips: strips,
      area: parseFloat(areaM2.toFixed(2))
    });
  };

  useEffect(() => {
    calculate();
  }, [wallWidth, wallHeight, rollWidth]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-2 mb-4 text-gray-800 border-b pb-2">
        <Calculator size={18} className="text-primary" />
        <h3 className="font-bold text-sm">محاسبه متراژ کاغذ دیواری</h3>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">عرض دیوار (cm)</label>
            <input
              type="number"
              value={wallWidth}
              onChange={(e) => setWallWidth(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none bg-gray-50 text-left"
              placeholder="مثلاً 300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ارتفاع دیوار (cm)</label>
            <input
              type="number"
              value={wallHeight}
              onChange={(e) => setWallHeight(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none bg-gray-50 text-left"
              placeholder="مثلاً 280"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">عرض رول کاغذ (cm)</label>
          <div className="grid grid-cols-4 gap-2">
            {ROLL_WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => setRollWidth(w)}
                className={`py-1 px-2 rounded-md text-xs font-medium transition-colors border ${
                  rollWidth === w
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-600">تعداد ردیف (قواره):</span>
              <span className="text-sm font-bold text-gray-800">{result.strips} عدد</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-600">طول کل مورد نیاز:</span>
              <span className="text-sm font-bold text-primary">{result.totalLength} متر</span>
            </div>
            <div className="text-[10px] text-gray-400 mt-2 text-center">
              * با احتساب ۱۰ سانتی‌متر اضافه برای برش
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WallpaperCalculator;
