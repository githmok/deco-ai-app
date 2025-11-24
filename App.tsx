import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Sparkles, RefreshCw, Wand2, Download, Palette, Home, LayoutGrid, Brush, ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Save, Trash2, Images, Plus, Check, MessageCircle, Send, Link as LinkIcon, Key, CreditCard, CheckCircle2, Loader2, Moon, Sun } from 'lucide-react';
import ComparisonSlider from './components/ComparisonSlider';
import ChatInterface from './components/ChatInterface';
import WallpaperCalculator from './components/WallpaperCalculator';
import LicenseModal from './components/LicenseModal';
import { generateRoomRedesign, sendChatMessage } from './services/geminiService';
import { AppStatus, ChatMessage, DesignState, SavedDesign } from './types';

const STYLE_PRESETS = [
  { 
    id: 'modern', 
    name: 'مدرن', 
    icon: <LayoutGrid size={18} />,
    prompt: 'Modern style. Clean lines, neutral colors. Keep furniture exactly the same.' 
  },
  { 
    id: 'minimal', 
    name: 'مینیمال', 
    icon: <Home size={18} />,
    prompt: 'Minimalist style. Monochromatic, simple textures. Keep furniture exactly the same.' 
  },
  { 
    id: 'persian', 
    name: 'سنتی ایرانی', 
    icon: <Sparkles size={18} />,
    prompt: 'Traditional Iranian style. Persian rug patterns, warm tones. Keep furniture exactly the same.' 
  },
  { 
    id: 'fixed_texture', 
    name: 'فقط طرح کاغذ', 
    icon: <Brush size={18} />,
    prompt: 'STRICT_TEXTURE_ONLY' 
  },
];

// Default Assets
const DEFAULT_ROOM_IMAGE = "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop";

const DEFAULT_TEXTURES_LIST = [
  "https://images.unsplash.com/photo-1615800098779-1be435081f06?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1596136894372-87e35b3e6426?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1628020847253-e99d146db327?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1621260429768-45e5b6eb440b?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522444557997-d8687fa13c3b?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=600&auto=format&fit=crop",
];

// License Logic Constants
const STORAGE_KEYS = {
  INSTALL_DATE: 'decoai_install_date',
  LICENSE_KEY: 'decoai_license_key',
  GALLERY: 'decoai_gallery',
  CURRENT_STATE: 'decoai_current_state' // For persistence
};
const TRIAL_DAYS = 10; 
const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

// Helper to compress images AND convert URLs to base64 to avoid API errors
// Now handles Fetching remote URLs via Proxy to bypass CORS
const compressImage = async (input: string, maxWidth = 1024, quality = 0.8): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    let sourceStr = input;
    
    // If input is a URL (e.g. Unsplash or User Link), fetch it first to get the blob
    if (input.startsWith('http')) {
      try {
        // 1. Try Direct Fetch first
        let response = await fetch(input, { mode: 'cors' }).catch(() => null);
        
        // 2. If Direct fails (CORS error), try via Proxy
        if (!response || !response.ok) {
           // Using allorigins.win as a CORS proxy
           const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(input)}`;
           response = await fetch(proxyUrl);
        }

        if (!response || !response.ok) {
           throw new Error("Failed to fetch image even with proxy");
        }

        const blob = await response.blob();
        sourceStr = await new Promise((res) => {
           const reader = new FileReader();
           reader.onloadend = () => res(reader.result as string);
           reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("Failed to fetch remote image:", e);
        // Fallback: Continue and let the Image object try to load it. 
        // Note: If CORS fails here, canvas.toDataURL will fail later.
      }
    }

    const img = new Image();
    img.crossOrigin = "Anonymous"; // Enable CORS for external images
    img.src = sourceStr;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(img, 0, 0, width, height);
          // Always convert to JPEG base64
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          // Canvas tainted (CORS error) - This means the proxy failed or wasn't used
          console.error("Canvas Tainted:", e);
          reject(new Error("CORS_ERROR"));
        }
      } else {
        reject(new Error("CANVAS_ERROR"));
      }
    };
    
    img.onerror = (e) => {
      console.error("Image load failed", e);
      reject(new Error("LOAD_ERROR"));
    };
  });
};

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  
  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [designState, setDesignState] = useState<DesignState>({
    originalImage: DEFAULT_ROOM_IMAGE,
    generatedImage: null,
    textureImage: null,
    prompt: '',
  });

  // Default Textures (10 slots: 7 presets + 3 empty)
  const INITIAL_TEXTURES = [...DEFAULT_TEXTURES_LIST, null, null, null];
  const [textureSlots, setTextureSlots] = useState<(string | null)[]>(INITIAL_TEXTURES);
  const [selectedTextureIndex, setSelectedTextureIndex] = useState<number>(0);
  
  // Licensing State
  const [isLicenseLocked, setIsLicenseLocked] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');

  // History State for Undo/Redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Saved Designs (Gallery)
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'design' | 'chat' | 'gallery'>('design');
  
  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Feedback State for Buttons (Green Tick)
  const [successStates, setSuccessStates] = useState<{[key: string]: boolean}>({});
  // Loading State for specific buttons
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const activeTextureSlotRef = useRef<number>(0); 
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const showSuccess = (index: number, type: string) => {
    const key = `${index}-${type}`;
    setSuccessStates(prev => ({...prev, [key]: true}));
    setTimeout(() => {
      setSuccessStates(prev => {
        const next = {...prev};
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const isSuccess = (index: number, type: string) => !!successStates[`${index}-${type}`];
  const isLoading = (index: number, type: string) => !!loadingStates[`${type}-${index}`];

  // --- Persistence: Theme Effect ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // --- Persistence: Load State ---
  useEffect(() => {
    // 1. Gallery Load
    try {
      const storedGallery = localStorage.getItem(STORAGE_KEYS.GALLERY);
      if (storedGallery) {
        setSavedDesigns(JSON.parse(storedGallery));
      }
      
      // 2. Current State Load (Persistence)
      const storedState = localStorage.getItem(STORAGE_KEYS.CURRENT_STATE);
      if (storedState) {
        const parsed = JSON.parse(storedState);
        
        // Restore Active Tab
        if (parsed.activeTab) {
          setActiveTab(parsed.activeTab);
        }

        // Restore Design State
        if (parsed.designState) {
            // Fallback: If stored originalImage is null (e.g. from previous wipe), restore default
            if (!parsed.designState.originalImage) {
                parsed.designState.originalImage = DEFAULT_ROOM_IMAGE;
            }
            setDesignState(parsed.designState);
        }
        
        // Restore Textures
        if (parsed.textureSlots && Array.isArray(parsed.textureSlots)) {
            let loadedSlots = parsed.textureSlots;
            
            // Heuristic: If all slots are null (e.g. from previous wipe), restore defaults
            const allNull = loadedSlots.every((s: any) => s === null);
            if (allNull) {
                loadedSlots = [...DEFAULT_TEXTURES_LIST, null, null, null];
            }

            // Pad to 10 if older version had fewer
            if (loadedSlots.length < 10) {
               const diff = 10 - loadedSlots.length;
               loadedSlots = [...loadedSlots, ...Array(diff).fill(null)];
            }
            setTextureSlots(loadedSlots);
        }
        
        // Restore History (if saved)
        if (parsed.history && Array.isArray(parsed.history)) {
           setHistory(parsed.history);
           setHistoryIndex(parsed.historyIndex ?? -1);
        }
        
        // Restore Selection
        if (parsed.selectedTextureIndex !== undefined) {
            setSelectedTextureIndex(parsed.selectedTextureIndex);
        }
      }
      
      // Load License Key for Display
      const savedKey = localStorage.getItem(STORAGE_KEYS.LICENSE_KEY);
      if (savedKey) {
          setLicenseKeyInput(savedKey);
      }

    } catch (e) {
      console.error("Failed to load local storage data", e);
    }

    // 3. Trial & License Check
    const checkLicense = () => {
      const now = Date.now();
      let installDate = localStorage.getItem(STORAGE_KEYS.INSTALL_DATE);

      // If first run, set install date
      if (!installDate) {
        installDate = now.toString();
        localStorage.setItem(STORAGE_KEYS.INSTALL_DATE, installDate);
      }

      const savedLicense = localStorage.getItem(STORAGE_KEYS.LICENSE_KEY);
      const timeDiff = now - parseInt(installDate);
      
      // Condition: Trial Expired AND No Valid License stored
      if (timeDiff > TRIAL_DURATION_MS && !savedLicense) {
        setIsLicenseLocked(true);
      }
    };

    checkLicense();
  }, []);

  // --- Persistence: Save State on Change ---
  // Helper to force save (used by Save button)
  const forceSaveState = () => {
    const fullState = {
        designState,
        textureSlots,
        history,
        historyIndex,
        selectedTextureIndex,
        activeTab
    };
    try {
        localStorage.setItem(STORAGE_KEYS.CURRENT_STATE, JSON.stringify(fullState));
        return true;
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
             console.warn("Storage quota exceeded, trying to save compact state...");
             // Strategy: Drop history first to save texture slots
             const compactState = {
                designState: {
                   ...designState,
                   // If original image is huge, we might lose it, but textures are priority based on user request
                },
                textureSlots, // Keep textures
                history: [], // Drop history
                historyIndex: -1,
                selectedTextureIndex,
                activeTab
            };
            try {
                localStorage.setItem(STORAGE_KEYS.CURRENT_STATE, JSON.stringify(compactState));
                return true;
            } catch(e2) {
                console.error("Critical storage failure", e2);
                return false;
            }
        }
        return false;
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(forceSaveState, 1000); // Increased debounce to 1s
    return () => clearTimeout(timeoutId);
  }, [designState, textureSlots, history, historyIndex, selectedTextureIndex, activeTab]);

  // --- License Validation Logic ---
  const validateLicense = (key: string): boolean => {
    const cleanKey = key.trim().toUpperCase();
    const isValid = cleanKey.startsWith('DECO-') || cleanKey.startsWith('GOLD-');

    if (isValid) {
      localStorage.setItem(STORAGE_KEYS.LICENSE_KEY, cleanKey);
      setIsLicenseLocked(false);
      setLicenseKeyInput(cleanKey);
      alert('لایسنس با موفقیت فعال شد. از طراحی لذت ببرید!');
      return true;
    }
    return false;
  };

  const handleManualLicenseSubmit = () => {
      if (validateLicense(licenseKeyInput)) {
          // Success handled in validateLicense
      } else {
          alert('کد وارد شده نامعتبر است.');
      }
  };

  // Sync history with displayed image
  useEffect(() => {
    if (history.length > 0 && historyIndex >= 0 && history[historyIndex]) {
      setDesignState(prev => ({ ...prev, generatedImage: history[historyIndex] }));
    }
  }, [historyIndex, history]);

  // File Handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'texture') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = reader.result as string;
      try {
        // Optimize compression: Smaller size for textures to ensure persistence works
        const maxWidth = type === 'texture' ? 600 : 1280; 
        const quality = type === 'texture' ? 0.7 : 0.8;
        
        const compressed = await compressImage(result, maxWidth, quality);
        
        if (type === 'original') {
          setDesignState(prev => ({
            ...prev,
            originalImage: compressed,
            generatedImage: null
          }));
          setHistory([]);
          setHistoryIndex(-1);
        } else {
          const slotIndex = activeTextureSlotRef.current;
          const newSlots = [...textureSlots];
          newSlots[slotIndex] = compressed;
          setTextureSlots(newSlots);
          setSelectedTextureIndex(slotIndex);
        }
      } catch (error) {
        console.error("Image processing error", error);
        alert("خطا در پردازش تصویر. لطفاً دوباره تلاش کنید.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTextureUrlInput = async (index: number) => {
      let url = prompt("لطفاً لینک تصویر (URL) را وارد کنید:\nمثال: لینک مستقیم گوگل درایو یا سایت‌های عکس");
      if (url) {
          url = url.trim();
          if (!url) return;

          // Google Drive & Dropbox Link Helper
          if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
             // Extract File ID
             const idMatch = url.match(/(?:id=|\/d\/)([\w-]{25,})/);
             if (idMatch && idMatch[1]) {
                url = `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
             }
          }
          if (url.includes('dropbox.com') && url.endsWith('dl=0')) {
              url = url.replace('dl=0', 'raw=1');
          }

          setLoadingStates(prev => ({...prev, [`link-${index}`]: true}));

          try {
              // Use smaller size (600px) for texture slots to save storage space
              const compressed = await compressImage(url, 600, 0.7);
              const newSlots = [...textureSlots];
              newSlots[index] = compressed;
              setTextureSlots(newSlots);
              setSelectedTextureIndex(index);
              showSuccess(index, 'link');
          } catch (e: any) {
              console.error(e);
              if (e.message === 'CORS_ERROR' || (e.message && e.message.includes('CORS'))) {
                  alert("خطای دسترسی به تصویر (CORS). ما سعی کردیم از پروکسی استفاده کنیم اما موفق نشدیم. لطفاً لینک مستقیم‌تری وارد کنید یا تصویر را دانلود کرده و دستی آپلود کنید.");
              } else {
                  alert("خطا در دانلود تصویر. لطفاً از لینک مستقیم و معتبر استفاده کنید.");
              }
          } finally {
              setLoadingStates(prev => {
                  const next = {...prev};
                  delete next[`link-${index}`];
                  return next;
              });
          }
      }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = reader.result as string;
      
      try {
        // More aggressive compression for gallery storage to ensure persistence
        const compressed = await compressImage(result, 800, 0.7);
        const newDesign: SavedDesign = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          originalImage: compressed, 
          generatedImage: compressed,
          textureImage: null,
          prompt: 'وارد شده از گالری'
        };

        const updatedGallery = [newDesign, ...savedDesigns];
        localStorage.setItem(STORAGE_KEYS.GALLERY, JSON.stringify(updatedGallery));
        setSavedDesigns(updatedGallery);
      } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
           alert('حافظه گالری پر شده است. لطفاً برای افزودن تصویر جدید، چند طرح قدیمی را حذف کنید.');
        } else {
           alert('خطا در ذخیره تصویر.');
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const triggerTextureUpload = (index: number) => {
    activeTextureSlotRef.current = index;
    textureInputRef.current?.click();
  };

  const removeTexture = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Direct delete without confirmation for better UX
    showSuccess(index, 'delete');
    
    // Visual delay to show success tick before removing
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const newSlots = [...textureSlots];
    newSlots[index] = null;
    setTextureSlots(newSlots);
    
    if (selectedTextureIndex === index) {
        const firstValid = newSlots.findIndex(s => s !== null);
        setSelectedTextureIndex(firstValid !== -1 ? firstValid : 0);
    }
  };

  const saveTextureDefault = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const success = forceSaveState();
      if (success) {
          showSuccess(index, 'save');
      } else {
          alert("خطا در ذخیره‌سازی. حافظه مرورگر پر است. لطفاً تاریخچه یا گالری را پاکسازی کنید.");
      }
  };

  // Generation Handlers
  const handleGenerate = async (customPrompt?: string) => {
    if (!designState.originalImage) return;

    setStatus(AppStatus.GENERATING_IMAGE);
    try {
      const imageToSend = await compressImage(designState.originalImage);
      const currentActiveTexture = textureSlots[selectedTextureIndex];
      let textureToSend: string | undefined = undefined;

      if (customPrompt === 'STRICT_TEXTURE_ONLY') {
         if (!currentActiveTexture) {
            alert('برای استفاده از حالت "فقط طرح کاغذ" لطفاً ابتدا یک طرح کاغذ دیواری را انتخاب یا آپلود کنید.');
            setStatus(AppStatus.IDLE);
            return;
         }
         textureToSend = await compressImage(currentActiveTexture);
      } else if (currentActiveTexture) {
         textureToSend = await compressImage(currentActiveTexture);
      }

      const promptToUse = customPrompt || designState.prompt;
      if (!promptToUse) {
        alert('لطفاً یک سبک را انتخاب کنید یا توضیحی بنویسید.');
        setStatus(AppStatus.IDLE);
        return;
      }

      const generated = await generateRoomRedesign(
        imageToSend,
        promptToUse,
        textureToSend
      );

      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(generated);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      setDesignState(prev => ({ 
        ...prev, 
        generatedImage: generated, 
        prompt: promptToUse,
        textureImage: currentActiveTexture || null 
      }));
      setStatus(AppStatus.IDLE);
      
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: 'طرح جدید آماده شد! کیفیت تصویر بهینه شده است.',
        timestamp: Date.now(),
      };
      setChatHistory(prev => [...prev, newMsg]);

    } catch (error: any) {
      console.error(error);
      const isApiRefusal = error.message.includes('AI Refusal') || error.message.includes('No image data');
      const isCorsError = error.message === 'CORS_ERROR';
      const isLoadError = error.message === 'LOAD_ERROR';

      let errMsg = 'خطا در تولید تصویر. لطفاً دوباره تلاش کنید.';
      
      if (isApiRefusal) {
         errMsg = `هوش مصنوعی درخواست را رد کرد: ${error.message}`;
      } else if (isCorsError || isLoadError) {
         errMsg = 'خطا در پردازش تصویر اولیه یا طرح کاغذ. اگر از لینک استفاده کرده‌اید، ممکن است لینک منقضی شده باشد.';
      } else if (error.message.includes('403') || error.message.includes('permission')) {
          errMsg = 'خطای عدم دسترسی (403). لطفاً اتصال VPN خود را بررسی کنید (ایران تحریم است).';
      }

      alert(errMsg);
      setStatus(AppStatus.ERROR);
    }
  };

  // --- Storage Functions ---
  const handleSaveDesign = async () => {
    if (!designState.generatedImage || !designState.originalImage) return;

    try {
        // Optimize compression for gallery storage to ensure it fits in localStorage
        const compressedOriginal = await compressImage(designState.originalImage, 800, 0.7);
        const compressedGenerated = await compressImage(designState.generatedImage, 800, 0.7);
        
        let compressedTexture = null;
        const currentTexture = designState.textureImage || textureSlots[selectedTextureIndex];
        if (currentTexture) {
            compressedTexture = await compressImage(currentTexture, 600, 0.6);
        }

        const newDesign: SavedDesign = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            originalImage: compressedOriginal,
            generatedImage: compressedGenerated,
            textureImage: compressedTexture,
            prompt: designState.prompt || 'طراحی سفارشی'
        };

        const updatedGallery = [newDesign, ...savedDesigns];
        localStorage.setItem(STORAGE_KEYS.GALLERY, JSON.stringify(updatedGallery));
        setSavedDesigns(updatedGallery);
        alert('طرح با موفقیت در گالری ذخیره شد.');
        setActiveTab('gallery');

    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
             alert('حافظه مرورگر پر شده است. لطفاً برای ذخیره طرح جدید، برخی از طرح‌های قدیمی را از گالری حذف کنید.');
        } else {
             alert('خطا در ذخیره‌سازی رخ داد.');
        }
    }
  };

  const handleDeleteDesign = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('آیا از حذف این طرح اطمینان دارید؟')) {
      const updated = savedDesigns.filter(d => d.id !== id);
      setSavedDesigns(updated);
      localStorage.setItem(STORAGE_KEYS.GALLERY, JSON.stringify(updated));
    }
  };

  const handleLoadDesign = (design: SavedDesign) => {
    setDesignState({
      originalImage: design.originalImage,
      generatedImage: design.generatedImage,
      textureImage: design.textureImage,
      prompt: design.prompt
    });
    if (design.textureImage) {
        const newSlots = [...textureSlots];
        newSlots[0] = design.textureImage;
        setTextureSlots(newSlots);
        setSelectedTextureIndex(0);
    }
    setHistory([design.generatedImage]);
    setHistoryIndex(0);
    setActiveTab('design');
  };

  // --- Undo/Redo/Zoom/Pan ---
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
    } else if (historyIndex === 0) {
       if (window.confirm("آیا می‌خواهید به حالت اولیه (بدون طرح) برگردید؟")) {
         setHistory([]);
         setHistoryIndex(-1);
         setDesignState(prev => ({ ...prev, generatedImage: null }));
       }
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
    }
  };

  const handleChatSend = async (text: string) => {
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    setChatHistory(prev => [...prev, userMsg]);
    setStatus(AppStatus.THINKING_CHAT);
    try {
      const imageContext = designState.generatedImage || designState.originalImage;
      const response = await sendChatMessage(chatHistory, text, imageContext);
      setChatHistory(prev => [...prev, response]);
    } catch (error) { console.error(error); } finally { setStatus(AppStatus.IDLE); }
  };

  const handleZoom = (delta: number) => {
    setZoomLevel(prev => {
      const newZoom = Math.min(Math.max(prev + delta, 1), 5);
      if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        handleZoom(delta);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && zoomLevel > 1) {
      setPanPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };
  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden font-sans transition-colors duration-200" dir="rtl">
      
      {isLicenseLocked && <LicenseModal onSubmit={validateLicense} />}

      <div className="w-full md:w-[400px] bg-white dark:bg-gray-800 shadow-2xl z-20 flex flex-col h-full border-l border-gray-200 dark:border-gray-700 flex-shrink-0 transition-colors duration-200">
        <div className="p-6 bg-gradient-to-br from-primary to-gray-900 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Palette className="text-white/90" size={32} />
                طراحی کاغذ دیواری
              </h1>
              <p className="text-red-100 text-sm mt-2 opacity-90">تغییر طرح با حفظ کامل چیدمان</p>
            </div>
            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
              title={darkMode ? 'حالت روز' : 'حالت شب'}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button onClick={() => setActiveTab('design')} className={`flex-1 py-4 text-sm font-bold transition-all duration-200 ${activeTab === 'design' ? 'text-primary border-b-4 border-primary bg-red-50/50 dark:bg-red-900/20' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <div className="flex items-center justify-center gap-2"><Wand2 size={16} /> استودیو</div>
          </button>
          <button onClick={() => setActiveTab('gallery')} className={`flex-1 py-4 text-sm font-bold transition-all duration-200 ${activeTab === 'gallery' ? 'text-primary border-b-4 border-primary bg-red-50/50 dark:bg-red-900/20' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <div className="flex items-center justify-center gap-2"><Images size={16} /> گالری ({savedDesigns.length})</div>
          </button>
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-4 text-sm font-bold transition-all duration-200 ${activeTab === 'chat' ? 'text-primary border-b-4 border-primary bg-red-50/50 dark:bg-red-900/20' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <div className="flex items-center justify-center gap-2"><CreditCard size={16} /> خرید</div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-900">
          {activeTab === 'design' ? (
            <div className="p-6 space-y-8">
              
              {/* 1. Upload Room */}
              <div className="space-y-3 animate-fade-in">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  تصویر اتاق شما
                </label>
                <div onClick={() => fileInputRef.current?.click()} className={`relative border-2 border-dashed rounded-2xl p-1 transition-all cursor-pointer group overflow-hidden bg-white dark:bg-gray-800 ${designState.originalImage ? 'border-primary/50' : 'border-gray-300 dark:border-gray-600 hover:border-primary'}`}>
                  {designState.originalImage ? (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden shadow-sm">
                      <img src={designState.originalImage} alt="Room" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                        <div className="bg-white text-gray-800 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2"><RefreshCw size={14} /> تغییر عکس</div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                      <Upload className="w-8 h-8 mb-3 text-gray-300 dark:text-gray-600 group-hover:text-primary group-hover:scale-110 transition-all" />
                      <span className="text-xs font-medium">برای آپلود کلیک کنید</span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'original')} />
                </div>
              </div>

              {/* 2. Texture Upload Section */}
              <div className="space-y-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                     انتخاب طرح کاغذ (تا ۱۰ مورد)
                  </div>
                </label>
                
                <div className="flex gap-3 overflow-x-auto pb-4 pt-2 px-1 snap-x" style={{ scrollbarWidth: 'thin' }}>
                  {textureSlots.map((slot, index) => (
                    <div key={index} className="flex flex-col items-center gap-1">
                      <div 
                        className={`relative min-w-[80px] w-20 h-20 rounded-xl border-2 transition-all cursor-pointer overflow-hidden group snap-center shadow-sm flex-shrink-0
                          ${selectedTextureIndex === index ? 'border-primary ring-2 ring-primary/20 scale-105 z-10 shadow-md rotate-y-12' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:scale-105'}
                        `}
                        onClick={() => {
                          if (slot) setSelectedTextureIndex(index);
                          else triggerTextureUpload(index);
                        }}
                      >
                        {/* Number Badge */}
                        <div className="absolute top-0 left-0 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-br-lg z-20 font-mono border-b border-r border-white/10 shadow-sm">
                          {index + 1}
                        </div>

                        {slot ? (
                          <>
                            <img src={slot} className="w-full h-full object-cover" alt={`Texture ${index+1}`} />
                            {selectedTextureIndex === index && (
                              <div className="absolute top-1 right-1 bg-primary text-white w-4 h-4 rounded-full flex items-center justify-center shadow-sm z-20">
                                <Check size={10} />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                             <Plus size={20} className="mb-1" />
                             <span className="text-[9px]">افزودن</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Action Buttons for each slot */}
                      <div className="flex gap-1 mt-1 justify-center relative z-40">
                          {/* Link Import */}
                          <button 
                             onClick={(e) => { e.stopPropagation(); handleTextureUrlInput(index); }}
                             disabled={isLoading(index, 'link')}
                             className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-300 hover:text-blue-500 hover:border-blue-500 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                             title="دریافت از لینک"
                          >
                             {isLoading(index, 'link') ? (
                                 <Loader2 size={10} className="animate-spin text-primary" />
                             ) : isSuccess(index, 'link') ? (
                                 <Check size={10} className="text-green-600" />
                             ) : (
                                 <LinkIcon size={10} />
                             )}
                          </button>

                          {slot ? (
                            <>
                              {/* Save/Persist */}
                              <button 
                                onClick={(e) => saveTextureDefault(e, index)}
                                className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-300 hover:text-green-500 hover:border-green-500 shadow-sm transition-all cursor-pointer active:scale-95"
                                title="ذخیره به عنوان پیش‌فرض"
                              >
                                {isSuccess(index, 'save') ? <Check size={10} className="text-green-600" /> : <Save size={10} />}
                              </button>
                              {/* Delete */}
                              <button 
                                onClick={(e) => removeTexture(e, index)}
                                className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-300 hover:text-red-500 hover:border-red-500 shadow-sm transition-all cursor-pointer active:scale-95"
                                title="حذف"
                              >
                                {isSuccess(index, 'delete') ? <Check size={10} className="text-green-600" /> : <Trash2 size={10} />}
                              </button>
                            </>
                          ) : (
                             // Upload Button
                             <button 
                                onClick={(e) => { e.stopPropagation(); triggerTextureUpload(index); }}
                                className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-300 hover:text-primary hover:border-primary shadow-sm transition-all cursor-pointer active:scale-95"
                                title="آپلود فایل"
                             >
                                <Upload size={10} />
                             </button>
                          )}
                      </div>
                    </div>
                  ))}
                  <input ref={textureInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'texture')} />
                </div>
              </div>

              {/* 3. Styles */}
              <div className="space-y-3 animate-fade-in" style={{ animationDelay: '200ms' }}>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  انتخاب حالت طراحی
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {STYLE_PRESETS.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => handleGenerate(style.prompt)}
                      disabled={!designState.originalImage || status === AppStatus.GENERATING_IMAGE}
                      className="group relative p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary hover:bg-red-50 dark:hover:bg-gray-700 transition-all text-right shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none overflow-hidden"
                    >
                      <div className="relative z-10 flex flex-col gap-2">
                        <span className="text-primary group-hover:scale-110 transition-transform duration-300 origin-right">
                          {style.icon}
                        </span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 group-hover:text-primary">
                          {style.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700 animate-fade-in" style={{ animationDelay: '300ms' }}>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">توضیحات سفارشی:</label>
                <div className="relative">
                  <textarea 
                    className="w-full p-4 rounded-xl border-0 bg-white dark:bg-gray-800 shadow-inner ring-1 ring-gray-200 dark:ring-gray-700 text-sm focus:ring-2 focus:ring-primary/30 dark:text-gray-200 outline-none resize-none"
                    rows={3}
                    placeholder="توضیحات خود را بنویسید..."
                    value={designState.prompt}
                    onChange={(e) => setDesignState(prev => ({ ...prev, prompt: e.target.value }))}
                  />
                  <button
                    onClick={() => handleGenerate()}
                    disabled={!designState.originalImage || status === AppStatus.GENERATING_IMAGE}
                    className="absolute bottom-3 left-3 bg-primary text-white p-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all"
                  >
                    {status === AppStatus.GENERATING_IMAGE ? <RefreshCw className="animate-spin" size={16} /> : <Wand2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'gallery' ? (
             <div className="p-6 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 flex flex-col">
                <button 
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full py-3 mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary text-gray-600 dark:text-gray-300 hover:text-primary rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-sm flex-shrink-0"
                >
                   <Plus size={18} />
                   افزودن دستی طرح
                </button>
                <input ref={galleryInputRef} type="file" className="hidden" accept="image/*" onChange={handleGalleryUpload} />

                {savedDesigns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                     <Images size={48} className="mb-3 opacity-50" />
                     <p className="text-sm">هنوز طرحی ذخیره نکرده‌اید.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {savedDesigns.map((design) => (
                      <div key={design.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 group animate-fade-in">
                        <div className="relative h-32 rounded-lg overflow-hidden mb-3 bg-gray-100 dark:bg-gray-700">
                          <img src={design.generatedImage} alt="Saved" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                             <button onClick={() => handleLoadDesign(design)} className="bg-white text-primary text-xs px-3 py-1.5 rounded-full font-bold shadow-md hover:bg-gray-100 transition-colors">باز کردن</button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[150px]">{design.prompt || 'طرح دستی'}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(design.timestamp).toLocaleDateString('fa-IR')}</p>
                          </div>
                          <button onClick={(e) => handleDeleteDesign(design.id, e)} className="text-gray-300 dark:text-gray-600 hover:text-red-500 p-2 rounded-full hover:bg-red-50 dark:hover:bg-gray-700 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          ) : (
            <div className="h-full flex flex-col bg-white dark:bg-gray-800">
              
              {/* AppSite Branding Header */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex flex-col items-center text-center flex-shrink-0">
                <div className="flex gap-4 w-full justify-center">
                  <a href="https://t.me/AppSite1" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#0088cc] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#0077b5] transition-colors shadow-lg shadow-blue-200 dark:shadow-none">
                    <Send size={16} className="-rotate-45" />
                    تلگرام
                  </a>
                  <a href="https://eitaa.com/AppSite1" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#ff7900] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#e66d00] transition-colors shadow-lg shadow-orange-200 dark:shadow-none">
                    <MessageCircle size={16} />
                    ایتا
                  </a>
                </div>
              </div>

              <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
                <WallpaperCalculator />
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatInterface messages={chatHistory} onSendMessage={handleChatSend} isLoading={status === AppStatus.THINKING_CHAT} />
              </div>

              {/* License Box Section - Moved to Bottom */}
              <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex-shrink-0 shadow-md">
                 <div className="flex items-center gap-2 mb-3">
                    <Key className="text-yellow-400" size={18} />
                    <h3 className="font-bold text-sm">فعال‌سازی لایسنس</h3>
                 </div>
                 <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                    <div className="flex gap-2">
                       <input 
                         type="text"
                         value={licenseKeyInput}
                         onChange={(e) => setLicenseKeyInput(e.target.value)}
                         placeholder=""
                         className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 outline-none focus:border-primary font-mono text-center tracking-wider"
                       />
                       <button 
                          onClick={handleManualLicenseSubmit}
                          className="bg-primary hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg"
                       >
                          ثبت
                       </button>
                    </div>
                    {!isLicenseLocked && localStorage.getItem(STORAGE_KEYS.LICENSE_KEY) && (
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400 font-medium">
                            <CheckCircle2 size={12} />
                            لایسنس شما فعال است
                        </div>
                    )}
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-[#1a1a1a] flex flex-col overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

        {designState.generatedImage && (
           <div className="absolute top-6 right-6 z-30 flex gap-3 animate-fade-in">
             <button onClick={handleUndo} disabled={historyIndex <= 0} className="bg-white/10 backdrop-blur-md text-white px-3 py-2 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10 flex items-center justify-center shadow-lg"><Undo2 size={18} /></button>
             <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="bg-white/10 backdrop-blur-md text-white px-3 py-2 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10 flex items-center justify-center shadow-lg"><Redo2 size={18} /></button>
             <div className="w-px bg-white/20 mx-1"></div>
             <button onClick={handleSaveDesign} className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full hover:bg-white/20 transition-all border border-white/10 flex items-center gap-2 text-sm font-medium shadow-lg"><Save size={16} /><span className="hidden sm:inline">ذخیره</span></button>
             <a href={designState.generatedImage} download="decoai-design.jpg" className="bg-primary/80 backdrop-blur-md text-white px-4 py-2 rounded-full hover:bg-primary transition-all border border-white/10 flex items-center gap-2 text-sm font-medium shadow-lg"><Download size={16} /><span className="hidden sm:inline">دانلود</span></a>
           </div>
        )}

        {(designState.originalImage || designState.generatedImage) && (
          <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2 animate-fade-in">
             <button onClick={() => handleZoom(0.5)} className="bg-white/10 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/20 transition-all border border-white/10 shadow-lg"><ZoomIn size={20} /></button>
             <button onClick={() => setZoomLevel(1)} className="bg-white/10 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/20 transition-all border border-white/10 shadow-lg"><Maximize size={20} /></button>
             <button onClick={() => handleZoom(-0.5)} className="bg-white/10 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/20 transition-all border border-white/10 shadow-lg"><ZoomOut size={20} /></button>
          </div>
        )}

        <div ref={canvasContainerRef} className="flex-1 flex items-center justify-center p-4 md:p-12 w-full h-full overflow-hidden" onWheel={handleWheel}>
          {!designState.originalImage ? (
            <div className="text-center max-w-md animate-fade-in-up z-10">
              <div className="w-24 h-24 bg-gradient-to-tr from-primary to-gray-900 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-primary/20 rotate-3 hover:rotate-6 transition-transform duration-500"><ImageIcon size={48} className="text-white" /></div>
              <h2 className="text-3xl font-bold text-white mb-3">طراحی کاغذ دیواری</h2>
              <p className="text-gray-400 text-lg mb-8 leading-relaxed">تصویر اتاق خود را آپلود کنید و تنها طرح کاغذها را تغییر دهید.</p>
              <button onClick={() => fileInputRef.current?.click()} className="bg-white text-gray-900 px-8 py-4 rounded-full font-bold hover:bg-red-50 hover:scale-105 transition-all shadow-xl shadow-white/5 flex items-center gap-2 mx-auto"><Upload size={20} /> آپلود تصویر اتاق</button>
            </div>
          ) : !designState.generatedImage ? (
             <div className="relative w-full h-full flex items-center justify-center animate-scale-in">
                <div className="relative max-w-full max-h-full aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white/5 bg-black/50">
                  <img src={designState.originalImage} className="w-full h-full object-contain" alt="Original" />
                  
                  {status === AppStatus.GENERATING_IMAGE && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                       <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
                       <p className="text-white text-xl font-bold animate-pulse">در حال اعمال طرح کاغذ...</p>
                    </div>
                  )}
                </div>
             </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center animate-scale-in" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} style={{ cursor: zoomLevel > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}>
               <div className="relative w-full max-w-6xl aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white/5 bg-black transition-transform duration-75 ease-out" style={{ transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)` }}>
                 <ComparisonSlider beforeImage={designState.originalImage} afterImage={designState.generatedImage} />
               </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
        .animate-fade-in-up { animation: fade-in-up 0.7s ease-out forwards; }
        .animate-scale-in { animation: scale-in 0.5s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { bg-transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
};
export default App;