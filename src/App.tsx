/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { 
  FileText, 
  Sparkles, 
  Copy, 
  Download, 
  Check, 
  RotateCcw, 
  Type, 
  BookOpen,
  Loader2,
  Trash2,
  List,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Table as TableIcon,
  ExternalLink,
  Undo,
  Redo,
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
  ChevronDown,
  BarChart2,
  Palette,
  Image as ImageIcon,
  Zap,
  Globe,
  LogIn,
  LogOut,
  Save,
  Cloud,
  CloudOff,
  AlertCircle,
  User as UserIcon,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { formatText, generateCoverImage, generateOutline, modifyTone, getEditingSuggestions, suggestCoverThemes, type Suggestion } from './lib/gemini.ts';
import { cn } from './lib/utils.ts';
import { compressImage } from './lib/imageUtils.ts';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  onAuthStateChanged, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  type User
} from './lib/firebase.ts';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Chapter {
  id: string;
  title: string;
  content: string;
}

interface SortableChapterItemProps {
  chapter: Chapter;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  syncStatus: string;
}

function SortableChapterItem({ chapter, isActive, onSelect, onDelete, isDeleting, syncStatus }: SortableChapterItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="group relative"
      {...attributes}
    >
      <button
        onClick={() => onSelect(chapter.id)}
        {...listeners}
        className={cn(
          "w-full text-left p-3 rounded-md text-sm font-medium transition-all flex items-center gap-3 relative overflow-hidden cursor-grab active:cursor-grabbing",
          isActive 
            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" 
            : "hover:bg-white/50 opacity-70 hover:opacity-100"
        )}
      >
        <FileText className="w-4 h-4 opacity-30 shrink-0" />
        <span className="truncate flex-1">{chapter.title}</span>
        {isActive && syncStatus === 'saving' && (
          <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-tighter text-blue-500 animate-pulse">
            <div className="w-1 h-1 bg-current rounded-full animate-bounce" />
            <span>Syncing</span>
          </div>
        )}
      </button>
      {!isDeleting && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(chapter.id); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:text-red-500 transition-all z-10"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

type Theme = 'classic' | 'modern' | 'nature' | 'dark' | 'midnight';

export default function App() {
  const initialChapters: Chapter[] = [
    { id: 'preface', title: 'Kata Pengantar', content: 'Tuliskan kata pengantar Anda di sini...' },
    { id: '1', title: 'Bab 1: Pendahuluan', content: '' }
  ];

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [activeChapterId, setActiveChapterId] = useState('preface');
  const [isFormatting, setIsFormatting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [isModifyingTone, setIsModifyingTone] = useState(false);
  const [showBrainstormModal, setShowBrainstormModal] = useState(false);
  const [showAuditorModal, setShowAuditorModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Custom Cover State
  const [coverForm, setCoverForm] = useState({
    title: '',
    author: '',
    visualDesc: '',
    theme: '',
    logoUrl: ''
  });
  const [suggestedThemes, setSuggestedThemes] = useState<string[]>([]);
  const [isSuggestingThemes, setIsSuggestingThemes] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [brainstormTopic, setBrainstormTopic] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [googleAuthStatus, setGoogleAuthStatus] = useState<boolean | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Theme>('classic');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showToneDropdown, setShowToneDropdown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Firebase Auth & Data State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  
  // History per chapter
  const [histories, setHistories] = useState<Record<string, { stack: string[], index: number }>>({
    '1': { stack: [''], index: 0 }
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isHistoryUpdate = useRef(false);

  const activeChapter = useMemo(() => 
    chapters.find(c => c.id === activeChapterId) || chapters[0]
  , [chapters, activeChapterId]);

  const fullContent = useMemo(() => 
    chapters.map(c => `# ${c.title}\n\n${c.content}`).join('\n\n---\n\n')
  , [chapters]);

  const updateActiveChapterContent = (newContent: string) => {
    setChapters(prev => prev.map(c => 
      c.id === activeChapterId ? { ...c, content: newContent } : c
    ));
  };

  const updateActiveChapterTitle = (newTitle: string) => {
    setChapters(prev => prev.map(c => 
      c.id === activeChapterId ? { ...c, title: newTitle } : c
    ));
  };

  const addChapter = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newChapter = { id: newId, title: `Bab ${chapters.length + 1}`, content: '' };
    setChapters(prev => [...prev, newChapter]);
    setHistories(prev => ({ ...prev, [newId]: { stack: [''], index: 0 } }));
    setActiveChapterId(newId);
  };

  const deleteChapter = (id: string) => {
    if (chapters.length <= 1) return;
    if (confirm('Hapus bab ini?')) {
      const newChapters = chapters.filter(c => c.id !== id);
      setChapters(newChapters);
      if (activeChapterId === id) {
        setActiveChapterId(newChapters[0].id);
      }
    }
  };

  const pushToHistory = useCallback((id: string, newVal: string) => {
    setHistories(prev => {
      const h = prev[id] || { stack: [''], index: 0 };
      const newStack = h.stack.slice(0, h.index + 1);
      if (newStack[newStack.length - 1] === newVal) return prev;
      newStack.push(newVal);
      if (newStack.length > 50) newStack.shift();
      return {
        ...prev,
        [id]: { stack: newStack, index: newStack.length - 1 }
      };
    });
  }, []);

  const undo = () => {
    const h = histories[activeChapterId];
    if (h && h.index > 0) {
      const prevIndex = h.index - 1;
      isHistoryUpdate.current = true;
      setHistories(prev => ({
        ...prev,
        [activeChapterId]: { ...h, index: prevIndex }
      }));
      updateActiveChapterContent(h.stack[prevIndex]);
    }
  };

  const redo = () => {
    const h = histories[activeChapterId];
    if (h && h.index < h.stack.length - 1) {
      const nextIndex = h.index + 1;
      isHistoryUpdate.current = true;
      setHistories(prev => ({
        ...prev,
        [activeChapterId]: { ...h, index: nextIndex }
      }));
      updateActiveChapterContent(h.stack[nextIndex]);
    }
  };

  useEffect(() => {
    if (isHistoryUpdate.current) {
      isHistoryUpdate.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const h = histories[activeChapterId];
      if (h && activeChapter.content !== h.stack[h.index]) {
        pushToHistory(activeChapterId, activeChapter.content);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeChapter.content, activeChapterId, pushToHistory, histories]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasContent = chapters.some(c => {
        if (c.id === 'preface') return c.content !== 'Tuliskan kata pengantar Anda di sini...';
        return c.content.trim().length > 0;
      });
      if (hasContent) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [chapters]);

  // --- Firebase Sync Logic ---

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load existing project or create default one
  useEffect(() => {
    if (!user) {
      setCurrentProjectId(null);
      return;
    }

    const q = query(
      collection(db, 'projects'), 
      where('ownerId', '==', user.uid), 
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty && !currentProjectId) {
        const firstDoc = snapshot.docs[0];
        setCurrentProjectId(firstDoc.id);
        const data = firstDoc.data();
        if (data.currentTheme) setCurrentTheme(data.currentTheme as Theme);
        
        // Load cover separately to keep main doc small
        getDoc(doc(db, 'projects', firstDoc.id, 'assets', 'cover')).then(coverDoc => {
          if (coverDoc.exists()) setCoverImage(coverDoc.data().data);
        });
      } else if (snapshot.empty && !currentProjectId) {
        // Create initial project for new user
        const newId = `proj_${Date.now()}`;
        setDoc(doc(db, 'projects', newId), {
          title: 'Buku Baru Saya',
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          currentTheme: 'classic'
        }).then(() => setCurrentProjectId(newId));
      }
    });

    return () => unsub();
  }, [user, currentProjectId]);

  // Load chapters from Firestore
  useEffect(() => {
    if (!user || !currentProjectId) return;

    const q = query(collection(db, 'projects', currentProjectId, 'chapters'), orderBy('order'));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const remoteChapters = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Chapter[];
        
        // Only update if remote is different to avoid loops
        setChapters(prev => {
          if (JSON.stringify(prev) === JSON.stringify(remoteChapters)) return prev;
          return remoteChapters;
        });
      }
    });

    return () => unsub();
  }, [user, currentProjectId]);

  // Auto-save Chapters to Firestore
  useEffect(() => {
    if (!user || !currentProjectId) return;

    const timer = setTimeout(async () => {
      setSyncStatus('saving');
      try {
        const batch = writeBatch(db);
        
        // Update project metadata (MINIMAL DATA)
        batch.update(doc(db, 'projects', currentProjectId), {
          updatedAt: serverTimestamp(),
          currentTheme,
          title: coverForm.title || chapters[0].title // Sync title
        });

        // Save cover separately IF exists and if changed (or just always for simplicity but to dedicated doc)
        if (coverImage) {
          // Safeguard: check size before sending (1MB limit is ~1.3M chars in base64)
          if (coverImage.length < 1000000) {
            batch.set(doc(db, 'projects', currentProjectId, 'assets', 'cover'), {
              data: coverImage,
              updatedAt: serverTimestamp()
            });
          } else {
            console.warn("Cover image too large to sync:", coverImage.length);
          }
        }

        // Update chapters (this is a simple overwrite pattern for first pass)
        // Note: For large books, we'd only sync the modified document
        for (let i = 0; i < chapters.length; i++) {
          const c = chapters[i];
          batch.set(doc(db, 'projects', currentProjectId, 'chapters', c.id), {
            title: c.title,
            content: c.content,
            order: i,
            updatedAt: serverTimestamp()
          });
        }
        
        await batch.commit();
        setSyncStatus('synced');
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error("Save error:", e);
        setSyncStatus('offline');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [chapters, currentTheme, coverImage, user, currentProjectId]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setGoogleAuthStatus(data.authenticated);
    } catch (e) {
      setGoogleAuthStatus(false);
    }
  };

  useEffect(() => {
    checkAuth();
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleAuthStatus(true);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const toggleFullscreen = () => {
    if (!previewRef.current) return;
    
    if (!document.fullscreenElement) {
      previewRef.current.requestFullscreen().catch(err => {
        alert(`Gagal masuk mode fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setChapters((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleGoogleExport = async () => {
    if (!fullContent) return;
    // Keep old Google Docs logic for now as requested or fallback
    // In many apps, Google Auth for Docs might still need its own token
    if (!googleAuthStatus) {
      try {
        const res = await fetch('/api/auth/google/url');
        const data = await res.json();
        if (data.url) {
          window.open(data.url, 'google_auth', 'width=600,height=700');
        }
      } catch (e) {
        alert('Gagal menghubungkan ke Google. Periksa konfigurasi API.');
      }
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch('/api/export/google-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Draf PenaRapi - ' + new Date().toLocaleDateString(),
          content: fullContent
        })
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      alert('Gagal mengekspor ke Google Docs.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      alert('Gagal masuk dengan Google.');
    }
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
      // Ensure state is reset without full reload first
      setUser(null);
      setCurrentProjectId(null);
      setSyncStatus('synced');
    } catch (e) {
      alert('Gagal keluar.');
    }
  };

  const applyFormat = (type: 'bold' | 'italic' | 'list' | 'h1' | 'h2' | 'table' | 'image') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = '';
    switch (type) {
      case 'bold': replacement = `**${selectedText || 'Teks Tebal'}**`; break;
      case 'italic': replacement = `*${selectedText || 'Teks Miring'}*`; break;
      case 'list': replacement = `\n- ${selectedText || 'Poin Baru'}`; break;
      case 'h1': replacement = `\n# ${selectedText || 'Judul Utama'}\n`; break;
      case 'h2': replacement = `\n## ${selectedText || 'Sub-judul'}\n`; break;
      case 'table': replacement = `\n\n| Kolom 1 | Kolom 2 |\n|---------|---------|\n| Baris 1 | Data 1 |\n| Baris 2 | Data 2 |\n\n`; break;
      case 'image': replacement = `\n![Judul Gambar](https://picsum.photos/seed/writing/800/600)\n`; break;
    }
    const newValue = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    updateActiveChapterContent(newValue);
    pushToHistory(activeChapterId, newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2 + (selectedText ? replacement.length - 4 : replacement.length));
    }, 0);
  };

  const toc = useMemo(() => {
    const headingLines = fullContent.split('\n').filter(line => line.startsWith('#'));
    return headingLines.map(line => {
      const level = line.match(/^#+/)?.[0].length || 0;
      const text = line.replace(/^#+\s*/, '').trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return { id, text, level };
    }).filter(item => item.level > 0 && item.level <= 3);
  }, [fullContent]);

  useEffect(() => {
    if (user) return; // Use Firebase for authenticated users
    const savedChapters = localStorage.getItem('penarapi_draft_chapters');
    const savedCover = localStorage.getItem('penarapi_draft_cover');
    const savedTheme = localStorage.getItem('penarapi_draft_theme');
    
    if (savedChapters) {
      const parsed = JSON.parse(savedChapters);
      setChapters(parsed);
      setActiveChapterId(parsed[0].id);
      
      const newHistories: Record<string, { stack: string[], index: number }> = {};
      parsed.forEach((c: Chapter) => {
        newHistories[c.id] = { stack: [c.content], index: 0 };
      });
      setHistories(newHistories);
    }
    if (savedCover) setCoverImage(savedCover);
    if (savedTheme) setCurrentTheme(savedTheme as Theme);
  }, [user]);

  useEffect(() => {
    if (user) return; // Skip localStorage if logged in
    localStorage.setItem('penarapi_draft_chapters', JSON.stringify(chapters));
    localStorage.setItem('penarapi_draft_theme', currentTheme);
    if (coverImage) localStorage.setItem('penarapi_draft_cover', coverImage);
    else localStorage.removeItem('penarapi_draft_cover');
  }, [chapters, coverImage, currentTheme, user]);

  const handleFormat = async () => {
    if (!activeChapter.content.trim()) return;
    setIsFormatting(true);
    try {
      const formatted = await formatText(activeChapter.content);
      updateActiveChapterContent(formatted);
      pushToHistory(activeChapterId, formatted);
    } catch (error) {
      alert('Gagal merapikan teks. Pastikan koneksi internet stabil.');
    } finally {
      setIsFormatting(false);
    }
  };

  const handleCopy = useCallback(() => {
    if (!fullContent) return;
    navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullContent]);

  const handleDownload = () => {
    if (!fullContent) return;
    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'penarapi-formatted-book.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setShowResetConfirm(false);
    const initialChapters: Chapter[] = [
      { id: 'preface', title: 'Kata Pengantar', content: 'Tuliskan kata pengantar Anda di sini...' },
      { id: '1', title: 'Bab 1: Pendahuluan', content: '' }
    ];
    setChapters(initialChapters);
    setActiveChapterId('preface');
    setCoverImage(null);
    setHistories({ 
      'preface': { stack: ['Tuliskan kata pengantar Anda di sini...'], index: 0 },
      '1': { stack: [''], index: 0 } 
    });
    localStorage.removeItem('penarapi_draft_chapters');
    localStorage.removeItem('penarapi_draft_cover');
  };

  const handleBrainstorm = async () => {
    if (!brainstormTopic.trim()) return;
    setIsBrainstorming(true);
    try {
      const outline = await generateOutline(brainstormTopic);
      // Create new chapters from outline (simplified: put in active chapter)
      updateActiveChapterContent(outline);
      updateActiveChapterTitle(`Outline: ${brainstormTopic}`);
      setShowBrainstormModal(false);
    } catch (e) {
      alert('Gagal membuat outline.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleToneChange = async (tone: string) => {
    if (!activeChapter.content.trim()) return;
    setIsModifyingTone(true);
    try {
      const newText = await modifyTone(activeChapter.content, tone);
      updateActiveChapterContent(newText);
      pushToHistory(activeChapterId, newText);
    } catch (e) {
      alert('Gagal mengubah nada tulisan.');
    } finally {
      setIsModifyingTone(false);
    }
  };

  const handleAudit = async () => {
    if (!activeChapter.content.trim()) return;
    setIsAnalyzing(true);
    setShowAuditorModal(true);
    try {
      const results = await getEditingSuggestions(activeChapter.content);
      setSuggestions(results);
    } catch (e) {
      alert('Gagal menganalisis teks.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestion = (s: Suggestion) => {
    const newContent = activeChapter.content.replace(s.original, s.replacement);
    updateActiveChapterContent(newContent);
    pushToHistory(activeChapterId, newContent);
    setSuggestions(prev => prev.filter(item => item !== s));
  };

  const handleGenerateCover = async () => {
    setIsGeneratingCover(true);
    try {
      const imageUrl = await generateCoverImage({
        title: coverForm.title,
        author: coverForm.author,
        visualDesc: coverForm.visualDesc,
        theme: coverForm.theme,
        logoUrl: coverForm.logoUrl
      });
      
      // Compress BEFORE storing to stay under 1MB even in assets doc
      const compressed = await compressImage(imageUrl, 800, 0.5);
      setCoverImage(compressed);
      setShowCoverModal(false);
    } catch (error) {
      alert('Gagal menghasilkan cover. Coba lagi nanti.');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleSuggestThemes = async () => {
    if (!coverForm.title.trim()) return;
    setIsSuggestingThemes(true);
    try {
      const themes = await suggestCoverThemes(coverForm.title);
      setSuggestedThemes(themes);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggestingThemes(false);
    }
  };

  const themes: { id: Theme; label: string; icon: any }[] = [
    { id: 'classic', label: 'Classic Paper', icon: BookOpen },
    { id: 'modern', label: 'Modern Minimal', icon: Type },
    { id: 'nature', label: 'Nature Olive', icon: Palette },
    { id: 'dark', label: 'Dark Editorial', icon: BarChart2 },
    { id: 'midnight', label: 'Midnight Blue', icon: Settings },
  ];

  return (
    <div className={cn(
      "min-h-screen flex flex-col font-sans transition-colors duration-500",
      currentTheme === 'dark' ? "bg-zinc-900 border-zinc-800" : 
      currentTheme === 'midnight' ? "bg-slate-950 border-slate-900" :
      "bg-[var(--color-bg)]"
    )}>
      {/* Header */}
      <header className={cn(
        "h-[80px] border-b flex items-center justify-between px-6 md:px-12 z-50 transition-all",
        currentTheme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white shadow-2xl" : 
        currentTheme === 'midnight' ? "bg-slate-950 border-slate-900 text-slate-100 shadow-2xl" :
        "bg-white border-gray-100 shadow-sm"
      )}>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowSidebar(!showSidebar)} 
            className="p-3 hover:bg-black/5 rounded-2xl transition-all active:scale-95 group"
          >
            {showSidebar ? <ChevronLeft className="w-5 h-5 opacity-40 group-hover:opacity-100" /> : <ChevronRight className="w-5 h-5 opacity-40 group-hover:opacity-100" />}
          </button>
          
          <div className="flex items-center gap-4">
            <div className="p-2 bg-black text-white rounded-xl shadow-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="font-logo text-2xl font-black uppercase tracking-tighter hidden sm:block">
              PenaRapi
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          {/* Sync Status Badge */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border",
            !user ? "bg-amber-50 border-amber-100 text-amber-600" :
            syncStatus === 'synced' ? "bg-green-50 border-green-100 text-green-700" :
            syncStatus === 'saving' ? "bg-blue-50 border-blue-100 text-blue-600" :
            "bg-red-50 border-red-100 text-red-600"
          )}>
            {!user ? (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Local Mode</span>
              </div>
            ) : syncStatus === 'synced' ? (
              <div className="flex items-center gap-2 animate-in fade-in duration-500">
                <Cloud className="w-3.5 h-3.5" /> 
                <span className="hidden lg:inline">{lastSavedAt ? `Auto-saved ${lastSavedAt}` : 'Securely Synced'}</span>
                <span className="lg:hidden">{lastSavedAt || 'Synced'}</span>
              </div>
            ) : syncStatus === 'saving' ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 
                <span className="animate-pulse">Saving...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CloudOff className="w-3.5 h-3.5" /> 
                <span>Sync Error</span>
              </div>
            )}
          </div>

          <div className="h-8 w-px bg-gray-200 mx-2 hidden md:block" />

          {/* User Profile / Auth */}
          {!user ? (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="p-1 border-2 border-green-500/20 rounded-2xl bg-white shadow-sm overflow-hidden flex items-center gap-2 group">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-[14px]" alt="Avatar" />
                <span className="text-[10px] font-bold pr-2 hidden md:block max-w-[100px] truncate">{user.displayName?.split(' ')[0]}</span>
              </div>
              <button 
                onClick={() => setShowLogoutConfirm(true)} 
                className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all opacity-40 hover:opacity-100"
                title="Logout"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>
          )}

          <div className="h-8 w-px bg-gray-200 mx-1 hidden lg:block" />

          {/* Theme Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              className={cn(
                "p-3 rounded-2xl transition-all shadow-sm border",
                currentTheme === 'dark' || currentTheme === 'midnight' ? "bg-zinc-800 border-zinc-700 hover:bg-zinc-700" : "bg-white border-gray-100 hover:bg-gray-50 text-zinc-900"
              )}
            >
              {(() => {
                const active = themes.find(t => t.id === currentTheme);
                const Icon = active?.icon || Palette;
                return (
                  <Icon className="w-5 h-5" />
                );
              })()}
            </button>

            <AnimatePresence>
              {showThemeDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemeDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.95 }}
                    className={cn(
                      "absolute right-0 mt-3 w-64 rounded-3xl shadow-2xl border p-3 z-50",
                      currentTheme === 'dark' ? "bg-zinc-800 border-zinc-700" : 
                      currentTheme === 'midnight' ? "bg-slate-900 border-slate-800" :
                      "bg-white border-gray-50"
                    )}
                  >
                    <div className="px-3 py-2 mb-2">
                       <p className="text-[9px] font-black uppercase tracking-widest opacity-30">Select Visual Style</p>
                    </div>
                    <div className="space-y-1">
                      {themes.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setCurrentTheme(t.id);
                            setShowThemeDropdown(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all",
                            currentTheme === t.id 
                              ? (currentTheme === 'dark' || currentTheme === 'midnight' ? "bg-white/10 text-white" : "bg-black text-white shadow-lg")
                              : "hover:bg-black/5 opacity-70 hover:opacity-100"
                          )}
                        >
                          <t.icon className="w-4 h-4" />
                          <span className="text-[11px] font-bold uppercase tracking-wider">{t.label}</span>
                          {currentTheme === t.id && <Check className="w-3 h-3 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowResetConfirm(true)} 
              className="p-3 opacity-30 hover:opacity-100 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all" 
              title="Reset Project"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={handleGoogleExport} 
                disabled={!fullContent || isExporting} 
                className={cn(
                  "p-3 rounded-2xl border-2 transition-all disabled:opacity-30 flex items-center gap-2",
                  googleAuthStatus ? "border-[#4285F4] text-[#4285F4] hover:bg-[#4285F4] hover:text-white" : "bg-[#4285F4] border-[#4285F4] text-white hover:opacity-90"
                )}
                title="Export to Google Docs"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                <span className="text-[10px] font-black uppercase tracking-wider hidden lg:block">Docs</span>
              </button>
              <button 
                onClick={handleDownload} 
                disabled={!fullContent} 
                className="px-6 py-3 bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-zinc-800 disabled:opacity-30 shadow-xl active:scale-95"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Chapter Navigator */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className={cn(
                "border-r flex flex-col z-40 transition-colors",
                currentTheme === 'dark' ? "bg-zinc-800 border-zinc-700 text-zinc-300" : 
                currentTheme === 'midnight' ? "bg-slate-900 border-slate-800 text-slate-400" :
                "bg-[#F5F5F3] border-[var(--color-border)]"
              )}
            >
              <div className="p-4 flex items-center justify-between border-b border-current/10">
                <span className="text-[10px] font-black uppercase tracking-[2px] opacity-50">Chapters</span>
                <button onClick={addChapter} className="p-1 px-2 bg-current/5 hover:bg-current/10 rounded flex items-center gap-1 text-[10px] font-bold">
                  <Plus className="w-3 h-3" /> ADD
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={chapters.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {chapters.map((chapter) => (
                      <SortableChapterItem 
                        key={chapter.id}
                        chapter={chapter}
                        isActive={activeChapterId === chapter.id}
                        syncStatus={syncStatus}
                        onSelect={setActiveChapterId}
                        onDelete={deleteChapter}
                        isDeleting={chapters.length <= 1}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Sidebar Analytics Widget */}
              <div className="p-6 border-t border-current/10 space-y-4">
                <button 
                  onClick={() => setShowBrainstormModal(true)}
                  className="w-full py-3 px-4 bg-current text-white rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg"
                >
                  <Sparkles className="w-4 h-4" />
                  Brainstorm Outline
                </button>

                <button 
                  onClick={handleAudit}
                  className="w-full py-3 px-4 bg-white text-black border-2 border-black rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-md mt-2"
                >
                  <Check className="w-4 h-4" />
                  AI Auditor
                </button>

                <button 
                  onClick={() => setShowCoverModal(true)}
                  disabled={isGeneratingCover}
                  className="w-full py-3 px-4 bg-amber-500 text-white rounded-lg flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg mt-2 disabled:opacity-50"
                >
                  {isGeneratingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  Cover Studio
                </button>

                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[2px] opacity-40">
                  <BarChart2 className="w-3 h-3" />
                  Analytics
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white/40 p-3 rounded-lg border border-white/20">
                    <div className="text-xl font-logo font-black tracking-tighter">
                      {fullContent.split(/\s+/).filter(Boolean).length}
                    </div>
                    <div className="text-[8px] uppercase tracking-wider font-bold opacity-50">Words</div>
                  </div>
                  <div className="bg-white/40 p-3 rounded-lg border border-white/20">
                    <div className="text-xl font-logo font-black tracking-tighter">
                      {Math.ceil(fullContent.split(/\s+/).filter(Boolean).length * 4.8 / 1000)}
                    </div>
                    <div className="text-[8px] uppercase tracking-wider font-bold opacity-50">Minutes</div>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col md:grid md:grid-cols-2 relative h-full">
          {/* Left: Input Editor */}
          <div className={cn(
            "flex flex-col border-r h-full p-6 lg:p-10 space-y-4 transition-colors",
            currentTheme === 'dark' ? "bg-zinc-900 border-zinc-700" : 
            currentTheme === 'midnight' ? "bg-slate-950 border-slate-900" :
            "bg-[#FAFAFA] border-[var(--color-border)]"
          )}>
            <div className="flex items-center justify-between uppercase tracking-widest text-[11px] font-extrabold opacity-40">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <input 
                  value={activeChapter.title} 
                  onChange={(e) => updateActiveChapterTitle(e.target.value)}
                  className="bg-transparent border-none outline-none focus:ring-0 w-40 hover:bg-current/5 rounded px-1 transition-all"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className={isFormatting ? "animate-pulse" : ""}>{activeChapter.content.length} Chars</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1 p-2 border-y border-current/10 bg-white/30 backdrop-blur rounded-lg shadow-sm">
              <button onClick={() => applyFormat('h1')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
              <button onClick={() => applyFormat('h2')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Heading 2"><Heading2 className="w-4 h-4" /></button>
              <div className="w-px h-4 bg-current opacity-10 mx-1" />
              <button onClick={() => applyFormat('bold')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Bold"><Bold className="w-4 h-4" /></button>
              <button onClick={() => applyFormat('italic')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Italic"><Italic className="w-4 h-4" /></button>
              <button onClick={() => applyFormat('list')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="List"><List className="w-4 h-4" /></button>
              <button onClick={() => applyFormat('table')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Table"><TableIcon className="w-4 h-4" /></button>
              <button onClick={() => applyFormat('image')} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors" title="Image"><ImageIcon className="w-4 h-4" /></button>
              
              <div className="w-px h-4 bg-current opacity-10 mx-1" />
              
              <div className="relative">
                <button 
                  onClick={() => setShowToneDropdown(!showToneDropdown)}
                  className="px-2 py-1 hover:bg-black/5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-[10px] font-black uppercase">Tone</span>
                  <ChevronDown className={cn("w-3 h-3 opacity-50 transition-transform", showToneDropdown && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {showToneDropdown && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setShowToneDropdown(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 mt-2 w-48 bg-white shadow-2xl rounded-xl p-2 border border-black/5 z-[70] origin-top-left"
                      >
                        <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest opacity-30">Select Style</p>
                        {['Profesional', 'Puitis', 'Santai', 'Inspiratif', 'Horor'].map(t => (
                          <button 
                            key={t}
                            onClick={() => {
                              handleToneChange(t);
                              setShowToneDropdown(false);
                            }}
                            className="w-full text-left p-3 hover:bg-black/5 rounded-lg text-xs text-black font-bold uppercase tracking-tight flex items-center justify-between transition-all group"
                          >
                            <span>{t}</span>
                            {isModifyingTone && <Loader2 className="w-3 h-3 animate-spin opacity-30" />}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="w-px h-4 bg-current opacity-10 mx-1 flex-1" />
              <button onClick={undo} disabled={histories[activeChapterId]?.index <= 0} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors disabled:opacity-10" title="Undo"><Undo className="w-4 h-4" /></button>
              <button onClick={redo} disabled={histories[activeChapterId]?.index >= (histories[activeChapterId]?.stack.length || 0) - 1} className="p-1.5 hover:bg-black hover:text-white rounded transition-colors disabled:opacity-10" title="Redo"><Redo className="w-4 h-4" /></button>
            </div>
            
            <textarea 
              ref={textareaRef} 
              value={activeChapter.content} 
              onChange={(e) => updateActiveChapterContent(e.target.value)} 
              spellCheck="false" 
              placeholder="Mulai menulis bab ini di sini..." 
              className={cn(
                "flex-1 w-full bg-transparent border-none outline-none resize-none font-sans text-[15px] leading-relaxed placeholder:opacity-30 py-10",
                currentTheme === 'dark' || currentTheme === 'midnight' ? "text-white" : "text-black"
              )} 
            />
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleGenerateCover} 
                disabled={isGeneratingCover} 
                className={cn(
                  "w-full py-4 px-6 border-2 flex items-center justify-center gap-3 font-black text-sm uppercase transition-all active:scale-[0.98]", 
                  isGeneratingCover ? "opacity-30 cursor-not-allowed" : "bg-white border-black text-black hover:bg-black hover:text-white"
                )}
              >
                {isGeneratingCover ? <><Loader2 className="w-5 h-5 animate-spin" />Generating...</> : <><BookOpen className="w-5 h-5" />{coverImage ? 'Regenerate Cover' : 'Generate Cover'}</>}
              </button>
              <button 
                onClick={handleFormat} 
                disabled={isFormatting || !activeChapter.content.trim()} 
                className={cn(
                  "w-full py-4 px-6 border-2 border-black flex items-center justify-center gap-3 font-black text-sm uppercase transition-all active:scale-[0.98]", 
                  isFormatting || !activeChapter.content.trim() ? "opacity-30 cursor-not-allowed" : "bg-black text-white hover:bg-transparent hover:text-black"
                )}
              >
                {isFormatting ? <><Loader2 className="w-5 h-5 animate-spin" />Formatting...</> : <><Sparkles className="w-5 h-5" />Auto-Format with AI</>}
              </button>
            </div>
          </div>

          {/* Right: Formatted Preview (Full Book) */}
          <div 
            ref={previewRef}
            className={cn(
              "flex flex-col p-6 lg:p-10 space-y-4 transition-all shadow-[inset_10px_0_20px_rgba(0,0,0,0.02)]",
              currentTheme === 'dark' ? "bg-zinc-900 text-zinc-100" : 
              currentTheme === 'midnight' ? "bg-slate-950 text-slate-100" :
              "bg-white text-zinc-900",
              isFullscreen && "p-10 lg:p-20 overflow-y-auto"
            )}
          >
            <div className="flex items-center justify-between uppercase tracking-widest text-[11px] font-extrabold opacity-40">
              <div className="flex items-center gap-2"><FileText className="w-4 h-4" /><span>Full Book Preview</span></div>
              <div className="flex items-center gap-4">
                <button onClick={toggleFullscreen} className="flex items-center gap-2 hover:opacity-100 transition-colors group">
                  {isFullscreen ? (
                    <><Minimize2 className="w-4 h-4 group-hover:scale-110 transition-transform" /><span>Exit Fullscreen</span></>
                  ) : (
                    <><Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" /><span>Full Preview</span></>
                  )}
                </button>
                <div className="w-px h-3 bg-current opacity-20" />
                <button onClick={handleCopy} disabled={!fullContent} className="flex items-center gap-2 hover:opacity-100 transition-colors disabled:opacity-10">
                  {copied ? <><Check className="w-4 h-4 text-green-600" /><span>Copied</span></> : <><Copy className="w-4 h-4" /><span>Copy All</span></>}
                </button>
              </div>
            </div>

            <div className={cn(
              "flex-1 overflow-y-auto book-preview pt-10 pb-20 scroll-smooth custom-scrollbar",
              isFullscreen ? "bg-zinc-200" : "bg-slate-50",
              `theme-${currentTheme}`
            )}>
              <div className={cn(
                "w-full max-w-4xl mx-auto px-4 lg:px-8",
                isFullscreen && "max-w-5xl"
              )}>
                <AnimatePresence mode="wait">
                  {chapters.length > 0 && chapters[0].content ? (
                    <motion.div key="full-book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="space-y-12">
                      {/* Cover Page */}
                      {coverImage && (
                        <div className="book-page bg-white shadow-xl p-0 overflow-hidden rounded-sm aspect-[3/4] max-w-2xl mx-auto relative group">
                          <img src={coverImage} alt="Ebook Cover" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          <button onClick={() => setCoverImage(null)} className="absolute top-4 right-4 p-2 bg-white/90 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50" title="Remove Cover"><Trash2 className="w-4 h-4 text-red-600" /></button>
                        </div>
                      )}

                      {/* TOC Page */}
                      {toc.length > 0 && (
                        <div className="book-page bg-white shadow-lg p-12 lg:p-20 min-h-[400px]">
                          <div className="text-center mb-12 border-b-2 border-zinc-900 pb-4">
                            <h2 className="!m-0 !text-2xl !font-black !uppercase !tracking-[10px] !font-logo">Daftar Isi</h2>
                          </div>
                          <nav className="space-y-4">
                            {toc.map((item, index) => (
                              <a key={`${item.id}-${index}`} href={`#${item.id}`} className={cn("flex items-center justify-between border-b border-zinc-100 py-3 transition-all hover:bg-zinc-50 group", item.level === 1 ? "font-bold text-lg uppercase" : "ml-8 italic opacity-70")}>
                                <span className="group-hover:translate-x-1 transition-transform">{item.text}</span>
                                <span className="opacity-20 text-[10px]">••••</span>
                              </a>
                            ))}
                          </nav>
                        </div>
                      )}

                      {/* Content Pages */}
                      {chapters.map((c) => (
                        <div key={c.id} className="book-page bg-white shadow-lg p-12 lg:p-24 min-h-[800px] relative">
                          <div className="absolute top-8 left-12 text-[10px] font-black uppercase tracking-widest opacity-20 pointer-events-none">
                            {coverForm.title || "Draf Buku"}
                          </div>
                          <ReactMarkdown rehypePlugins={[rehypeSlug]} remarkPlugins={[remarkGfm]}>
                            {`# ${c.title}\n\n${c.content}`}
                          </ReactMarkdown>
                          <div className="mt-20 border-t pt-8 text-center text-[10px] font-bold opacity-10">
                            PenaRapi Digital Press
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <div className="h-[600px] flex flex-col items-center justify-center opacity-10 text-center uppercase tracking-widest font-black">
                      <RotateCcw className="w-16 h-16 mb-4" /><p className="text-sm">Blank Page</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className={cn(
        "h-10 border-t flex items-center justify-between px-6 md:px-10 text-[10px] font-bold uppercase tracking-[2px] opacity-50 z-50 transition-colors",
        currentTheme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white" : 
        currentTheme === 'midnight' ? "bg-slate-950 border-slate-900 text-slate-100" :
        "bg-[var(--color-bg)] border-[var(--color-border)]"
      )}>
        <div>Chapters: {chapters.length} | Avg. Ease: {Math.max(60, 100 - fullContent.length / 5000).toFixed(0)}%</div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" />System Online: Gemini-Pro</div>
      </footer>

      {/* Brainstorm Modal */}
      <AnimatePresence>
        {showBrainstormModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBrainstormModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                 <Sparkles className="w-40 h-40 text-black rotate-12" />
               </div>
               <div className="relative z-10">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-black text-white rounded-2xl"><Zap className="w-6 h-6" /></div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tighter">AI Brainstorm</h2>
                      <p className="text-xs font-bold uppercase opacity-40">Generate Book Outline</p>
                    </div>
                 </div>
                 
                 <p className="text-sm text-gray-500 mb-6">Sebutkan topik atau tema buku yang ingin Anda buat, dan AI akan membuatkan kerangka bab untuk Anda.</p>
                 
                 <div className="space-y-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase opacity-40">Topic / Theme</label>
                     <input 
                       value={brainstormTopic} 
                       onChange={(e) => setBrainstormTopic(e.target.value)} 
                       placeholder="Misal: Sejarah Kopi di Indonesia" 
                       className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none transition-all font-medium text-sm"
                     />
                   </div>
                   
                   <button 
                     onClick={handleBrainstorm} 
                     disabled={isBrainstorming || !brainstormTopic.trim()}
                     className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                   >
                     {isBrainstorming ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Generate Outline'}
                   </button>
                 </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auditor Modal */}
      <AnimatePresence>
        {showAuditorModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAuditorModal(false)} />
            <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }} className="relative bg-white w-full max-w-xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
               <div className="p-8 border-b flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500 text-white rounded-2xl"><Check className="w-6 h-6" /></div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tighter">AI Auditor</h2>
                      <p className="text-xs font-bold uppercase opacity-40">Grammar & Style Suggestions</p>
                    </div>
                 </div>
                 <button onClick={() => setShowAuditorModal(false)} className="p-2 hover:bg-black/5 rounded-full"><ChevronRight className="w-6 h-6" /></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 space-y-6">
                 {isAnalyzing ? (
                   <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                     <Loader2 className="w-12 h-12 animate-spin" />
                     <p className="text-[10px] font-black uppercase tracking-[3px]">Analyzing your text...</p>
                   </div>
                 ) : suggestions.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20 italic">
                     <div className="p-6 border-4 border-dashed rounded-full"><Check className="w-12 h-12" /></div>
                     <p className="text-sm font-bold uppercase">No issues found. Your text is clean!</p>
                   </div>
                 ) : (
                   suggestions.map((s, idx) => (
                     <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        key={idx} 
                        className="bg-gray-50 border rounded-2xl p-6 relative overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
                      >
                       <div className={cn(
                         "absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest",
                         s.category === 'grammar' ? "bg-red-500 text-white" :
                         s.category === 'style' ? "bg-blue-500 text-white" : "bg-amber-500 text-white"
                       )}>
                         {s.category}
                       </div>
                       
                       <div className="space-y-4">
                         <div className="flex items-start gap-4">
                           <div className="flex-1 space-y-2">
                             <p className="text-[10px] font-black uppercase opacity-30">Change</p>
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className="bg-red-100 text-red-700 line-through px-2 py-1 rounded-md text-sm font-serif">{s.original}</span>
                               <ChevronRight className="w-4 h-4 opacity-30" />
                               <span className="bg-green-100 text-green-700 font-bold px-2 py-1 rounded-md text-sm font-serif">{s.replacement}</span>
                             </div>
                           </div>
                         </div>
                         
                         <div className="space-y-1">
                           <p className="text-[10px] font-black uppercase opacity-30">Reason</p>
                           <p className="text-sm text-gray-700 font-medium italic">"{s.reason}"</p>
                         </div>
                         
                         <button 
                           onClick={() => applySuggestion(s)}
                           className="w-full py-3 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-[0.98] transition-all"
                         >
                           Apply Suggestion
                         </button>
                       </div>
                     </motion.div>
                   ))
                 )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cover Studio Modal */}
      <AnimatePresence>
        {showCoverModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCoverModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white w-full max-w-2xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
               <div className="p-8 border-b flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500 text-white rounded-2xl"><ImageIcon className="w-6 h-6" /></div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tighter">Cover Studio</h2>
                      <p className="text-xs font-bold uppercase opacity-40">Design your perfect book cover</p>
                    </div>
                 </div>
                 <button onClick={() => setShowCoverModal(false)} className="p-2 hover:bg-black/5 rounded-full"><ChevronRight className="w-6 h-6" /></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 space-y-8">
                 <div className="grid md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Book Title</label>
                       <div className="flex gap-2">
                        <input 
                          value={coverForm.title}
                          onChange={(e) => setCoverForm({...coverForm, title: e.target.value})}
                          placeholder="Masukkan judul buku..."
                          className="flex-1 p-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none font-bold text-sm"
                        />
                        <button 
                          onClick={handleSuggestThemes}
                          disabled={isSuggestingThemes || !coverForm.title}
                          className="px-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-tighter hover:scale-105 transition-all disabled:opacity-20"
                        >
                          {isSuggestingThemes ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ideas"}
                        </button>
                       </div>
                     </div>

                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Author Name</label>
                       <input 
                         value={coverForm.author}
                         onChange={(e) => setCoverForm({...coverForm, author: e.target.value})}
                         placeholder="Nama Penulis..."
                         className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none font-bold text-sm"
                       />
                     </div>

                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Visual Description</label>
                       <textarea 
                         rows={4}
                         value={coverForm.visualDesc}
                         onChange={(e) => setCoverForm({...coverForm, visualDesc: e.target.value})}
                         placeholder="Gambarkan suasana sampul yang diinginkan (misal: nuansa futuristik medis, minimalis, dll)..."
                         className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none font-medium text-sm resize-none"
                       />
                     </div>
                   </div>

                   <div className="space-y-6">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Logo URL (Optional)</label>
                       <input 
                         value={coverForm.logoUrl}
                         onChange={(e) => setCoverForm({...coverForm, logoUrl: e.target.value})}
                         placeholder="https://link-ke-logo.png"
                         className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none text-sm"
                       />
                     </div>

                     <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-40">AI Suggestion Themes</label>
                       <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                         {suggestedThemes.length > 0 ? suggestedThemes.map((t, i) => (
                           <button 
                             key={i}
                             onClick={() => setCoverForm({...coverForm, theme: t})}
                             className={cn(
                               "w-full p-4 rounded-2xl text-left text-xs font-bold transition-all border-2",
                               coverForm.theme === t ? "bg-black text-white border-black" : "bg-gray-50 border-transparent hover:border-black/20"
                             )}
                           >
                             {t}
                           </button>
                         )) : (
                            <div className="p-10 border-2 border-dashed rounded-2xl text-center opacity-20 italic text-xs">
                              Masukkan judul untuk melihat ide tema...
                            </div>
                         )}
                       </div>
                     </div>
                   </div>
                 </div>

                 <div className="pt-8 border-t">
                    <button 
                      onClick={handleGenerateCover}
                      disabled={isGeneratingCover || !coverForm.title}
                      className="w-full py-5 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-[5px] text-sm hover:scale-[1.01] active:scale-[0.99] transition-all shadow-xl disabled:opacity-30 disabled:scale-100"
                    >
                      {isGeneratingCover ? (
                        <div className="flex items-center justify-center gap-4">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>MENGHASILKAN KARYA...</span>
                        </div>
                      ) : "GENERATE E-BOOK COVER"}
                    </button>
                 </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 text-center space-y-6">
               <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                 <LogOut className="w-8 h-8" />
               </div>
               <div className="space-y-2">
                 <h2 className="text-xl font-black uppercase tracking-tight">Keluar Akun?</h2>
                 <p className="text-sm font-medium opacity-50 px-4 text-zinc-600">Pastikan draf Anda sudah tersinkronisasi sebelum keluar untuk menjaga keamanan data.</p>
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all">Batal</button>
                 <button onClick={handleLogout} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-lg active:scale-95">Ya, Keluar</button>
               </div>
            </motion.div>
          </div>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-8 text-center space-y-6">
               <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto">
                 <Trash2 className="w-8 h-8" />
               </div>
               <div className="space-y-2">
                 <h2 className="text-xl font-black uppercase tracking-tight">Reset Project?</h2>
                 <p className="text-sm font-medium opacity-50 px-4 text-zinc-600">Seluruh teks draf akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan!</p>
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 bg-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all">Batal</button>
                 <button onClick={handleClear} className="flex-1 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all shadow-lg active:scale-95">Hapus Semua</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
