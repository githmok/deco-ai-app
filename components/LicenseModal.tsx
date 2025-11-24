import React, { useState } from 'react';
import { Lock, Key, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface LicenseModalProps {
  onSubmit: (key: string) => boolean;
}

const LicenseModal: React.FC<LicenseModalProps> = ({ onSubmit }) => {
  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = onSubmit(inputKey);
    if (!isValid) {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
        <div className="bg-gradient-to-r from-red-600 to-red-800 p-6 text-center text-white">
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-md">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-1">پایان مهلت تست رایگان</h2>
          <p className="text-red-100 text-sm">۱۰ روز استفاده رایگان شما به پایان رسیده است.</p>
        </div>
        
        <div className="p-8">
          <p className="text-gray-600 text-center mb-6 text-sm leading-relaxed">
            برای ادامه استفاده از امکانات طراحی کاغذ دیواری و هوش مصنوعی، لطفاً لایسنس خریداری شده را وارد نمایید.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Key size={16} className="text-primary" />
                کد لایسنس
              </label>
              <input
                type="text"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setError(false);
                }}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className={`w-full p-3 border-2 rounded-xl text-center font-mono text-lg tracking-widest uppercase outline-none transition-all
                  ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-primary'}`}
              />
              {error && (
                <div className="flex items-center gap-1 text-red-600 text-xs mt-2 font-medium">
                  <XCircle size={14} />
                  کد وارد شده نامعتبر است.
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              فعال‌سازی و ورود
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
             <div className="flex items-center justify-center gap-2 text-yellow-600 bg-yellow-50 p-3 rounded-lg text-xs mb-3">
                <AlertTriangle size={16} />
                <span>نیاز به خرید دارید؟</span>
             </div>
             <button className="text-primary text-sm font-bold hover:underline">
                خرید کد لایسنس از وبسایت ما
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicenseModal;