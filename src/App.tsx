/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Music, 
  Upload, 
  Link as LinkIcon, 
  Loader2, 
  Sparkles, 
  FileAudio, 
  AlertCircle,
  ChevronRight,
  RefreshCcw,
  Languages,
  Sun,
  Moon,
  Monitor,
  User,
  Disc,
  History,
  Trash2,
  Clock,
  X,
  Copy,
  Check,
  Wand2,
  Mic2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';

// Initialize Gemini API
// Move initialization inside the function to ensure up-to-date API key
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type Theme = 'dark' | 'light' | 'system';

interface AnalysisResult {
  title: string;
  artist: string;
  genre: string;
  mood: string;
  keywords: string[];
  explanation: string;
  sourceTitle?: string;
  sunoPrompt?: string;
  sunoPromptKr?: string;
  sunoReasoning?: string;
}

interface YouTubeMetadata {
  videoId: string | null;
  thumbnail: string | null;
}

interface HistoryItem extends AnalysisResult {
  id: string;
  timestamp: number;
  thumbnail?: string | null;
  videoId?: string | null;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('file');
  const [ytMetadata, setYtMetadata] = useState<YouTubeMetadata>({ videoId: null, thumbnail: null });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('music-vibe-history');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentSunoPrompt, setCurrentSunoPrompt] = useState("");
  const [vocalType, setVocalType] = useState<'none' | 'male' | 'female'>('none');
  const [vocalStyle, setVocalStyle] = useState<string>('none');
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('music-vibe-theme') as Theme) || 'system';
    }
    return 'system';
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme effect
  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: Theme) => {
      root.classList.remove('light', 'dark');
      if (t === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(t);
      }
    };

    applyTheme(theme);
    localStorage.setItem('music-vibe-theme', theme);

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // History persistence
  useEffect(() => {
    localStorage.setItem('music-vibe-history', JSON.stringify(history));
  }, [history]);

  // Sync Suno prompt when result changes
  useEffect(() => {
    if (result?.sunoPrompt) {
      setCurrentSunoPrompt(result.sunoPrompt);
      setVocalType('none');
      setVocalStyle('none');
    } else {
      setCurrentSunoPrompt("");
    }
  }, [result]);

  const addToHistory = (item: AnalysisResult, yt: YouTubeMetadata) => {
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      thumbnail: yt.thumbnail,
      videoId: yt.videoId
    };
    setHistory(prev => [newItem, ...prev].slice(0, 20));
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
    setIsConfirmingClear(false);
  };

  const selectHistoryItem = (item: HistoryItem) => {
    setResult(item);
    setYtMetadata({ videoId: item.videoId || null, thumbnail: item.thumbnail || null });
    setShowHistory(false);
    setIsConfirmingClear(false);
    setCopied(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const appendToPrompt = (keyword: string) => {
    setCurrentSunoPrompt(prev => {
      const trimmed = prev.trim();
      if (trimmed.toLowerCase().includes(keyword.toLowerCase())) return prev;
      return trimmed.endsWith(',') ? `${trimmed} ${keyword}` : (trimmed ? `${trimmed}, ${keyword}` : keyword);
    });
  };

  const toggleVocal = (type: 'male' | 'female' | 'none') => {
    const maleKeywords = ['male vocals', 'male voice', 'man vocals'];
    const femaleKeywords = ['female vocals', 'female voice', 'woman vocals'];
    const allVocalKeywords = [...maleKeywords, ...femaleKeywords];
    const instrumentalKeywords = ['instrumental', 'no vocals', 'no voice'];
    
    const nextType = (type === 'none' || vocalType === type) ? 'none' : type;
    setVocalType(nextType);

    setCurrentSunoPrompt(prev => {
      // Split by comma, trim, and filter out any existing vocal type keywords and instrumental keywords
      const parts = prev.split(',').map(p => p.trim()).filter(p => p !== "");
      let filteredParts = parts.filter(p => 
        !allVocalKeywords.some(k => p.toLowerCase().includes(k.toLowerCase()))
      );

      if (nextType === 'none') {
        // If switching to none, we might want to add 'instrumental' back if it's not there
        if (!filteredParts.some(p => instrumentalKeywords.includes(p.toLowerCase()))) {
          filteredParts.push('instrumental');
        }
        return filteredParts.join(', ');
      }

      // If adding vocals, remove instrumental keywords
      filteredParts = filteredParts.filter(p => !instrumentalKeywords.includes(p.toLowerCase()));

      const baseKeyword = nextType === 'male' ? 'male vocals' : 'female vocals';
      const finalKeyword = vocalStyle !== 'none' ? `${vocalStyle} ${baseKeyword}` : baseKeyword;
      
      // Append to the end as requested
      return [...filteredParts, finalKeyword].join(', ');
    });
  };

  const setVocalDetail = (style: string) => {
    const styles = [
      'mysterious', 'whispering', 'soulful', 'powerful', 'soft', 'emotional', 
      'breathy', 'gritty', 'raspy', 'ethereal', 'aggressive', 'melancholic',
      'operatic', 'nasal', 'vibrant', 'husky', 'smooth', 'raw'
    ];
    
    const nextStyle = (vocalStyle === style) ? 'none' : style;
    setVocalStyle(nextStyle);

    setCurrentSunoPrompt(prev => {
      const parts = prev.split(',').map(p => p.trim()).filter(p => p !== "");
      
      const maleKeywords = ['male vocals', 'male voice', 'man vocals'];
      const femaleKeywords = ['female vocals', 'female voice', 'woman vocals'];
      const allVocalKeywords = [...maleKeywords, ...femaleKeywords];

      let genderIndex = -1;
      parts.forEach((p, i) => {
        if (allVocalKeywords.some(k => p.toLowerCase().includes(k.toLowerCase()))) {
          genderIndex = i;
        }
      });

      if (genderIndex !== -1) {
        // Prepend style to the gender keyword
        let genderPart = parts[genderIndex];
        // Remove any existing style from this part
        styles.forEach(s => {
          genderPart = genderPart.replace(new RegExp(`\\b${s}\\b`, 'gi'), '').trim();
        });
        
        const newParts = [...parts];
        newParts[genderIndex] = nextStyle === 'none' ? genderPart : `${nextStyle} ${genderPart}`;
        return newParts.join(', ');
      } else {
        // No gender found, handle style as standalone at the end
        const filteredParts = parts.filter(p => !styles.some(s => p.toLowerCase() === s.toLowerCase()));
        if (nextStyle === 'none') return filteredParts.join(', ');
        return [...filteredParts, nextStyle].join(', ');
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 15 * 1024 * 1024) { // 15MB limit
        setError('파일 크기가 너무 큽니다. 15MB 이하의 오디오 파일을 선택해주세요.');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const analyzeMusic = async () => {
    if (activeTab === 'file' && !file) {
      setError('먼저 오디오 파일을 선택해주세요.');
      return;
    }

    if (activeTab === 'file' && file) {
      // Limit file size to 15MB to avoid payload issues
      if (file.size > 15 * 1024 * 1024) {
        setError('파일 크기가 너무 큽니다. 15MB 이하의 오디오 파일을 선택해주세요.');
        return;
      }
    }

    if (activeTab === 'url' && !url) {
      setError('유효한 음악 링크를 입력해주세요.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setVocalType('none');
    setVocalStyle('none');
    setYtMetadata({ videoId: null, thumbnail: null });

    try {
      // Check for API key selection if using Pro model (URL tab)
      if (activeTab === 'url') {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
          // After opening the dialog, we assume the user will select a key.
          // The instructions say to proceed after triggering openSelectKey.
        }
      }

      const keywordReference = `
        [Suno AI Prompt Reference Keywords]
        - Genre: afrobeat, ambient, blues, classical, country, disco, dubstep, EDM, electronic, folk, funk, gospel, hip-hop, house, indie, jazz, K-pop, latin, metal, pop, punk, R&B, reggae, rock, soul, techno, trap
        - Mood: aggressive, anxious, bittersweet, chill, dark, dramatic, dreamy, energetic, epic, ethereal, euphoric, groovy, hopeful, intense, intimate, melancholic, mysterious, nostalgic, peaceful, playful, romantic, sensual, triumphant, upbeat
        - Tempo: adagio, allegro, andante, double-time, downtempo, half-time, largo, midtempo, moderato, presto, uptempo, vivace
        - Techniques/Instruments: 808 sub-bass, ambient sounds, arpeggios, breakdown, build-up, call and response, distortion, drop, drum fills, dynamic range, funk groove, gate/stutter, glitch effects, heavy bass, layered vocals, lo-fi, orchestral elements, pitch shift, reverb/delay, saturation, sidechain compression, stereo width, synth pads, trap beats, vinyl crackle, acoustic guitar, bass guitar, bongo, cello, conga, cymbals, drum machine, electric guitar, flute, Hammond organ, harmonica, harp, keyboard, maracas, organ, percussion, piano, saxophone, shaker, snare drum, strings (section), synthesizer, tabla, tambourine, timpani, trumpet, ukulele, vibraphone, violin
      `;

      let prompt = "";
      let contents: any;

      if (activeTab === 'file' && file) {
        const base64Data = await fileToBase64(file);
        prompt = `이 오디오 파일을 분석해주세요. 곡의 제목(Title)과 아티스트(Artist)를 식별하고, 장르와 분위기를 한국어로 설명해주세요. 
        또한 10-15개의 묘사적인 영어 키워드(English Keywords)를 제공해주세요. 
        마지막으로, 분석된 곡의 스타일을 바탕으로 Suno AI(음악 생성 AI)에서 사용할 수 있는 최적의 영어 프롬프트(sunoPrompt)를 생성해주세요. 
        
        [중요 지침]
        - Suno AI 프롬프트(sunoPrompt)는 기본적으로 보컬이 없는 연주곡(instrumental) 스타일로 생성해주세요.
        - 또한 다음 두 필드를 추가해주세요:
        - sunoPromptKr: 생성된 영어 프롬프트를 한국어로 자연스럽게 번역한 내용
        - sunoReasoning: 왜 이런 프롬프트(장르, 악기, 분위기 선택 이유 등)가 생성되었는지에 대한 상세한 설명 (한국어)
        
        프롬프트는 장르, 분위기, 템포, 악기 구성을 포함해야 하며, 아래 제공된 키워드 레퍼런스를 참고하되 그 범위에 국한되지 않고 창의적으로 작성하세요.
        
        ${keywordReference}
        
        결과는 JSON 형식으로 반환해주세요.`;
        
        contents = {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: file.type, data: base64Data } }
          ]
        };
      } else {
        const videoId = getYouTubeId(url);
        if (videoId) {
          setYtMetadata({
            videoId,
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          });
        }

        prompt = `다음 음악 링크를 정밀 분석해주세요: ${url}

        [분석 필수 지침]
        1. 반드시 'googleSearch' 도구를 사용하여 이 링크가 어떤 곡인지 정확한 정보를 검색하세요.
        2. 링크의 제목이나 메타데이터에만 의존하지 말고, 실제 공식 음원 정보를 찾으세요.
        3. 검색 결과에서 확인된 공식 곡 제목(Title)과 아티스트(Artist)를 'title'과 'artist' 필드에 넣으세요.
        4. 링크 자체의 제목(유튜브 영상 제목 등)은 'sourceTitle' 필드에 넣으세요.
        5. 해당 곡의 실제 장르, 분위기, 가사의 의미를 한국어로 심층 분석하여 'explanation' 필드에 넣으세요.
        6. 10-15개의 묘사적인 영어 키워드(English Keywords)를 생성하여 'keywords' 필드에 넣으세요.
        7. 분석된 곡의 스타일을 바탕으로 Suno AI(음악 생성 AI)에서 사용할 수 있는 최적의 영어 프롬프트(sunoPrompt)를 생성하세요. 
           [중요] Suno AI 프롬프트(sunoPrompt)는 기본적으로 보컬이 없는 연주곡(instrumental) 스타일로 생성해주세요.
           또한 다음 두 필드를 추가하세요:
           - sunoPromptKr: 생성된 영어 프롬프트를 한국어로 자연스럽게 번역한 내용
           - sunoReasoning: 왜 이런 프롬프트(장르, 악기, 분위기 선택 이유 등)가 생성되었는지에 대한 상세한 설명 (한국어)
           
           프롬프트는 장르, 분위기, 템포, 악기 구성을 포함해야 하며, 아래 제공된 키워드 레퍼런스를 참고하되 그 범위에 국한되지 않고 창의적으로 작성하세요.

        ${keywordReference}
        
        [주의] 절대 이전 대화의 예시(헤이즈 등)를 반복하지 마세요. 현재 입력된 링크(${url})에만 집중하세요.`;
        
        contents = { parts: [{ text: prompt }] };
      }

      // Create a new instance right before the call to ensure up-to-date API key
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const response = await ai.models.generateContent({
        model: activeTab === 'url' ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview",
        contents: contents,
        config: {
          tools: activeTab === 'url' ? [{ googleSearch: {} }] : undefined,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "공식 곡 제목" },
              artist: { type: "string", description: "공식 아티스트 이름" },
              sourceTitle: { type: "string", description: "원본 영상/링크의 제목" },
              genre: { type: "string", description: "음악 장르 (한국어)" },
              mood: { type: "string", description: "음악 분위기 (한국어)" },
              keywords: { 
                type: "array",
                items: { type: "string" },
                description: "묘사적인 영어 키워드 리스트"
              },
              explanation: { type: "string", description: "분석 결과에 대한 상세 설명 (한국어)" },
              sunoPrompt: { type: "string", description: "Suno AI용 생성 프롬프트 (영어)" },
              sunoPromptKr: { type: "string", description: "Suno AI 프롬프트 한국어 번역" },
              sunoReasoning: { type: "string", description: "프롬프트 생성 근거 및 의도 설명 (한국어)" }
            },
            required: ["title", "artist", "genre", "mood", "keywords", "explanation", "sunoPrompt", "sunoPromptKr", "sunoReasoning"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text) as AnalysisResult;
        setResult(parsed);
        
        // Add to history
        const currentYt = {
          videoId: getYouTubeId(url),
          thumbnail: getYouTubeId(url) ? `https://img.youtube.com/vi/${getYouTubeId(url)}/maxresdefault.jpg` : null
        };
        addToHistory(parsed, currentYt);
      }
    } catch (err: any) {
      console.error("Analysis failed:", err);
      
      let errorMessage = "분석 중 오류가 발생했습니다. 다시 시도해주세요.";
      
      if (err.message?.includes("Requested entity was not found")) {
        errorMessage = "API 키 선택이 필요하거나 잘못되었습니다. 다시 선택해주세요.";
        (window as any).aistudio.openSelectKey();
      } else if (err.message?.includes("xhr error") || err.message?.includes("Rpc failed")) {
        errorMessage = "네트워크 연결 또는 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      }
      
      setError(err.message || errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setUrl('');
    setResult(null);
    setError(null);
    setVocalType('none');
    setVocalStyle('none');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0c] text-zinc-900 dark:text-white font-sans selection:bg-serenity/30 transition-colors duration-300">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-serenity-dark/10 dark:bg-serenity-dark/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-600/10 dark:bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Theme Switcher */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={cn(
            "p-2.5 rounded-full transition-all bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 backdrop-blur-xl shadow-sm",
            showHistory ? "text-serenity-dark dark:text-serenity-light" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          )}
          title="분석 기록"
        >
          <History className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-full backdrop-blur-xl shadow-sm">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "p-2 rounded-full transition-all",
                theme === t 
                  ? "bg-white dark:bg-white/10 text-serenity-dark dark:text-serenity-light shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              )}
              title={t === 'light' ? '라이트 모드' : t === 'dark' ? '다크 모드' : '시스템 설정'}
            >
              {t === 'light' && <Sun className="w-4 h-4" />}
              {t === 'dark' && <Moon className="w-4 h-4" />}
              {t === 'system' && <Monitor className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </div>

      {/* History Sidebar Overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowHistory(false);
                setIsConfirmingClear(false);
              }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-[#0f0f11] border-l border-zinc-200 dark:border-white/10 z-[70] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-serenity" />
                  <h2 className="text-lg font-bold">분석 기록</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setShowHistory(false);
                      setIsConfirmingClear(false);
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3 opacity-60">
                    <Clock className="w-12 h-12" />
                    <p>아직 분석 기록이 없습니다.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => selectHistoryItem(item)}
                      className="group relative bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl p-4 cursor-pointer hover:border-serenity/50 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                    >
                      <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-zinc-200 dark:bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Disc className="w-8 h-8 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm truncate pr-6">{item.title}</h3>
                          <p className="text-xs text-zinc-500 truncate">{item.artist}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-serenity/10 text-serenity-dark dark:text-serenity-light font-medium">
                              {item.genre}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="absolute top-4 right-4 p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))
                )}
              </div>

              {history.length > 0 && (
                <div className="p-4 border-t border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                  {isConfirmingClear ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-center text-zinc-500 mb-1">모든 기록을 삭제하시겠습니까?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsConfirmingClear(false)}
                          className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 text-sm font-bold"
                        >
                          취소
                        </button>
                        <button
                          onClick={clearHistory}
                          className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-500/20"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsConfirmingClear(true)}
                      className="w-full py-3.5 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-red-500 text-zinc-600 dark:text-zinc-400 hover:text-white border border-zinc-200 dark:border-white/10 hover:border-red-500 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      전체 기록 삭제
                    </button>
                  )}
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <header className="text-center mb-16 max-w-2xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-serenity-dark dark:text-serenity-light text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI 기반 음악 인텔리전스</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-b from-zinc-900 to-zinc-500 dark:from-white dark:to-white/60 bg-clip-text text-transparent"
          >
            음악 바이브 체크
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto"
          >
            음악 파일을 업로드하거나 링크를 붙여넣어 곡의 숨겨진 영혼을 발견해보세요.
            제목, 아티스트, 장르, 분위기, 그리고 영어 키워드를 즉시 알려드립니다.
          </motion.p>
        </header>

        {/* Main Interface */}
        <div className="max-w-2xl mx-auto bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-3xl p-1 md:p-2 backdrop-blur-xl shadow-2xl">
          <div className="bg-white dark:bg-[#121214] rounded-[1.4rem] overflow-hidden border border-zinc-200 dark:border-transparent">
            {/* Tabs */}
            <div className="flex border-b border-zinc-100 dark:border-white/5">
              <button
                onClick={() => setActiveTab('file')}
                className={cn(
                  "flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2",
                  activeTab === 'file' ? "text-serenity-dark dark:text-white bg-zinc-50 dark:bg-white/5" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                <Upload className="w-4 h-4" />
                파일 업로드
              </button>
              <button
                onClick={() => setActiveTab('url')}
                className={cn(
                  "flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2",
                  activeTab === 'url' ? "text-serenity-dark dark:text-white bg-zinc-50 dark:bg-white/5" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                <LinkIcon className="w-4 h-4" />
                링크 붙여넣기
              </button>
            </div>

            <div className="p-8">
              <AnimatePresence mode="wait">
                {activeTab === 'file' ? (
                  <motion.div
                    key="file-tab"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-6"
                  >
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "group relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
                        file ? "border-serenity/50 bg-serenity/5" : "border-zinc-200 dark:border-white/10 hover:border-serenity/30 hover:bg-zinc-50 dark:hover:bg-white/5"
                      )}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="audio/*"
                        className="hidden"
                      />
                      <div className="flex flex-col items-center gap-4">
                        <div className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                          file ? "bg-serenity text-white" : "bg-zinc-100 dark:bg-white/5 text-zinc-400"
                        )}>
                          {file ? <FileAudio className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                        </div>
                        <div>
                          <p className="text-lg font-medium text-zinc-900 dark:text-white">
                            {file ? file.name : "오디오 파일을 선택하세요"}
                          </p>
                          <p className="text-sm text-zinc-500 mt-1">
                            MP3, WAV, M4A (최대 20MB)
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="url-tab"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-6"
                  >
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                        <LinkIcon className="w-5 h-5" />
                      </div>
                      <input 
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="YouTube, Spotify, SoundCloud 링크를 붙여넣으세요..."
                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-serenity/50 transition-all"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 px-2">
                      * AI가 구글 검색을 통해 해당 링크의 곡 정보를 식별하고 분석합니다.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500 dark:text-red-400 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}

              <div className="mt-8">
                <button
                  onClick={analyzeMusic}
                  disabled={isAnalyzing || (activeTab === 'file' ? !file : !url)}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2",
                    isAnalyzing 
                      ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed" 
                      : "bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98]"
                  )}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      바이브 분석 중...
                    </>
                  ) : (
                    <>
                      분석 시작하기
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Info & Basic Analysis */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Song Info Card */}
                  <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[2rem] p-8 shadow-xl">
                    <div className="flex flex-col items-center text-center gap-6">
                      <div className="relative w-40 h-40 shrink-0">
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-serenity to-blue-600 flex items-center justify-center text-white shadow-lg overflow-hidden">
                          {ytMetadata.thumbnail ? (
                            <img 
                              src={ytMetadata.thumbnail} 
                              alt="Thumbnail" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (ytMetadata.videoId) {
                                  (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${ytMetadata.videoId}/hqdefault.jpg`;
                                }
                              }}
                            />
                          ) : (
                            <Disc className="w-20 h-20 animate-[spin_8s_linear_infinite]" />
                          )}
                        </div>
                      </div>
                      <div className="w-full min-w-0">
                        <div className="flex items-center justify-center gap-2 text-serenity-dark dark:text-serenity-light mb-2">
                          <Music className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-widest">
                            {ytMetadata.videoId ? "YouTube Identified" : "File Identified"}
                          </span>
                        </div>
                        <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-2 truncate">
                          {result.title}
                        </h2>
                        <div className="flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <User className="w-4 h-4" />
                          <span className="text-xl font-medium truncate">{result.artist}</span>
                        </div>
                        {ytMetadata.videoId && (
                          <div className="mt-4 flex justify-center">
                            <a 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-zinc-400 hover:text-serenity transition-colors flex items-center gap-1.5"
                            >
                              원본 영상 보기 <ChevronRight className="w-4 h-4" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Genre Card */}
                    <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-3xl p-6">
                      <div className="flex items-center gap-3 mb-3 text-serenity-dark dark:text-serenity-light">
                        <Music className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">장르</span>
                      </div>
                      <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{result.genre}</h3>
                    </div>

                    {/* Mood Card */}
                    <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-3xl p-6">
                      <div className="flex items-center gap-3 mb-3 text-blue-600 dark:text-blue-400">
                        <Sparkles className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">분위기</span>
                      </div>
                      <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{result.mood}</h3>
                    </div>
                  </div>

                  {/* Keywords Section */}
                  <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[2rem] p-8">
                    <div className="flex items-center gap-3 mb-6 text-emerald-600 dark:text-emerald-400">
                      <Languages className="w-5 h-5" />
                      <span className="text-xs font-bold uppercase tracking-wider">영어 키워드</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.keywords.map((keyword, i) => (
                        <motion.span
                          key={keyword}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="px-4 py-2 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 text-sm hover:border-serenity/50 transition-colors cursor-default"
                        >
                          {keyword}
                        </motion.span>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button
                      onClick={reset}
                      className="flex items-center gap-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm font-medium"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      다른 곡 분석하기
                    </button>
                  </div>
                </div>

                {/* Right Column: Suno AI & Detailed Report */}
                <div className="lg:col-span-8 space-y-8">
                  {/* Suno AI Prompt Section */}
                  {result.sunoPrompt && (
                    <div className="bg-gradient-to-br from-serenity/10 to-blue-600/10 border border-serenity/20 dark:border-serenity/30 rounded-[2.5rem] p-10 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                        <Wand2 className="w-40 h-40" />
                      </div>
                      
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-3 text-serenity-dark dark:text-serenity-light">
                            <Wand2 className="w-6 h-6" />
                            <span className="text-sm font-bold uppercase tracking-wider">Suno AI 생성 프롬프트</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(currentSunoPrompt)}
                            className={cn(
                              "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all",
                              copied 
                                ? "bg-emerald-500 text-white" 
                                : "bg-white dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/20 border border-zinc-200 dark:border-white/10"
                            )}
                          >
                            {copied ? (
                              <>
                                <Check className="w-4 h-4" />
                                복사됨!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                프롬프트 복사
                              </>
                            )}
                          </button>
                        </div>
                        
                        <div className="space-y-8">
                          <div className="bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-white/50 dark:border-white/5 rounded-[2rem] p-8">
                            <div className="flex flex-col gap-6">
                              <div>
                                <span className="text-xs font-bold text-serenity uppercase tracking-tighter mb-2 block">English Prompt (Editable)</span>
                                <textarea
                                  value={currentSunoPrompt}
                                  onChange={(e) => setCurrentSunoPrompt(e.target.value)}
                                  className="w-full bg-transparent text-xl md:text-2xl font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed italic border-none focus:ring-0 p-0 resize-none min-h-[120px]"
                                  placeholder="프롬프트를 입력하거나 아래 키워드를 추가하세요..."
                                />
                              </div>
                              {result.sunoPromptKr && (
                                <div className="pt-6 border-t border-zinc-200 dark:border-white/5">
                                  <span className="text-xs font-bold text-blue-500 uppercase tracking-tighter mb-2 block">Korean Translation</span>
                                  <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                    {result.sunoPromptKr}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Vocal Selection */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                              <Mic2 className="w-4 h-4" />
                              보컬 성별 (Vocal Gender)
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {[
                                { id: 'male', label: '남성 보컬 (Male)', icon: <User className="w-4 h-4" /> },
                                { id: 'female', label: '여성 보컬 (Female)', icon: <User className="w-4 h-4" /> }
                              ].map((v) => (
                                <button
                                  key={v.id}
                                  onClick={() => toggleVocal(v.id as 'male' | 'female')}
                                  className={cn(
                                    "px-5 py-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm font-bold",
                                    vocalType === v.id
                                      ? "bg-serenity text-white border-serenity shadow-lg shadow-serenity/20"
                                      : "bg-white/40 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-serenity/50"
                                  )}
                                >
                                  {v.icon}
                                  {v.label}
                                </button>
                              ))}
                              <button
                                onClick={() => toggleVocal('none')}
                                className={cn(
                                  "px-5 py-2.5 rounded-xl border transition-all text-sm font-bold",
                                  vocalType === 'none'
                                    ? "bg-zinc-800 text-white border-zinc-800"
                                    : "bg-white/40 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400"
                                )}
                              >
                                보컬 없음 (No Vocals)
                              </button>
                            </div>
                          </div>

                          {/* Vocal Style Selection */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                              <Sparkles className="w-4 h-4" />
                              보컬 스타일 (Vocal Style)
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {[
                                { id: 'mysterious', label: '신비로운 (Mysterious)' },
                                { id: 'whispering', label: '속삭이는 (Whispering)' },
                                { id: 'soulful', label: '소울풀한 (Soulful)' },
                                { id: 'powerful', label: '파워풀한 (Powerful)' },
                                { id: 'soft', label: '부드러운 (Soft)' },
                                { id: 'emotional', label: '감성적인 (Emotional)' },
                                { id: 'breathy', label: '숨소리가 섞인 (Breathy)' },
                                { id: 'gritty', label: '거친 (Gritty)' },
                                { id: 'raspy', label: '허스키한 (Raspy)' },
                                { id: 'ethereal', label: '천상의 (Ethereal)' },
                                { id: 'aggressive', label: '공격적인 (Aggressive)' },
                                { id: 'melancholic', label: '우울한 (Melancholic)' },
                                { id: 'operatic', label: '오페라 같은 (Operatic)' },
                                { id: 'nasal', label: '비음 섞인 (Nasal)' },
                                { id: 'vibrant', label: '활기찬 (Vibrant)' },
                                { id: 'husky', label: '허스키한 (Husky)' },
                                { id: 'smooth', label: '매끄러운 (Smooth)' },
                                { id: 'raw', label: '날것의 (Raw)' }
                              ].map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => setVocalDetail(s.id)}
                                  className={cn(
                                    "px-4 py-2 rounded-xl border transition-all text-xs font-bold",
                                    vocalStyle === s.id
                                      ? "bg-serenity text-white border-serenity shadow-md shadow-serenity/10"
                                      : "bg-white/40 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:border-serenity/30"
                                  )}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quick Add Keywords */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                              <RefreshCcw className="w-4 h-4" />
                              추천 키워드 추가 (Quick Add)
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {['lo-fi', 'synthwave', 'acoustic', 'cinematic', 'jazz', 'rock', 'pop', 'hip-hop', 'chill', 'dreamy', 'energetic', 'dark', 'peaceful', 'epic', 'nostalgic']
                                .filter(k => !currentSunoPrompt.toLowerCase().includes(k.toLowerCase()))
                                .map((k) => (
                                <button
                                  key={k}
                                  onClick={() => appendToPrompt(k)}
                                  className="px-4 py-2 rounded-xl bg-white/40 dark:bg-white/5 hover:bg-serenity hover:text-white border border-zinc-200 dark:border-white/10 text-sm font-semibold transition-all"
                                >
                                  + {k}
                                </button>
                              ))}
                            </div>
                          </div>

                          {result.sunoReasoning && (
                            <div className="bg-serenity/5 dark:bg-white/5 rounded-[2rem] p-8 border border-serenity/10">
                              <div className="flex items-center gap-3 mb-4 text-serenity-dark dark:text-serenity-light">
                                <Sparkles className="w-5 h-5" />
                                <span className="text-xs font-bold uppercase tracking-wider">프롬프트 생성 의도</span>
                              </div>
                              <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                {result.sunoReasoning}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Explanation Section */}
                  <div className="bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-[2rem] p-10">
                    <div className="flex items-center gap-3 mb-6 text-zinc-500 dark:text-zinc-400">
                      <AlertCircle className="w-6 h-6" />
                      <span className="text-sm font-bold uppercase tracking-wider">상세 분석 리포트</span>
                    </div>
                    <div className="prose prose-zinc dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 leading-relaxed text-lg">
                      <Markdown>{result.explanation}</Markdown>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="mt-24 text-center text-zinc-400 dark:text-zinc-600 text-sm">
          <p>© 2026 Music Vibe Analyzer. Powered by Gemini 3 Flash.</p>
        </footer>
      </main>
    </div>
  );
}
