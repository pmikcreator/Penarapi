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
  ChevronRight
} from 'lucide-react';
import { formatText } from './lib/gemini.ts';
import { cn } from './lib/utils.ts';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isFormatting, setIsFormatting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [googleAuthStatus, setGoogleAuthStatus] = useState<boolean | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check Auth Status on mount
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

    // Listen for OAuth Success Message
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleAuthStatus(true);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleGoogleExport = async () => {
    if (!output) return;

    if (!googleAuthStatus) {
      // Initiate OAuth
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
          content: output // Sending raw markdown content (Docs might need raw text/convert)
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

  const applyFormat = (type: 'bold' | 'italic' | 'list' | 'h1' | 'h2' | 'table') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = '';

    switch (type) {
      case 'bold':
        replacement = `**${selectedText || 'Teks Tebal'}**`;
        break;
      case 'italic':
        replacement = `*${selectedText || 'Teks Miring'}*`;
        break;
      case 'list':
        replacement = `\n- ${selectedText || 'Poin Baru'}`;
        break;
      case 'h1':
        replacement = `\n# ${selectedText || 'Judul Utama'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selectedText || 'Sub-judul'}\n`;
        break;
      case 'table':
        replacement = `\n\n| Kolom 1 | Kolom 2 |\n|---------|---------|\n| Baris 1 | Data 1 |\n| Baris 2 | Data 2 |\n\n`;
        break;
    }

    const newValue = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    setInput(newValue);
    
    // Recovery focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2 + (selectedText ? replacement.length - 4 : replacement.length));
    }, 0);
  };

  // Extract headings for Table of Contents
  const toc = useMemo(() => {
    const headingLines = output.split('\n').filter(line => line.startsWith('#'));
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
  }, [output]);

  // Load saved draft on mount
  useEffect(() => {
    const savedInput = localStorage.getItem('penarapi_draft_input');
    const savedOutput = localStorage.getItem('penarapi_draft_output');
    if (savedInput) setInput(savedInput);
    if (savedOutput) setOutput(savedOutput);
  }, []);

  // Save to localStorage when input or output changes
  useEffect(() => {
    localStorage.setItem('penarapi_draft_input', input);
    localStorage.setItem('penarapi_draft_output', output);
  }, [input, output]);

  const sampleText = `Sejarah Singkat Teknologi AI
AI adalah kecerdasan buatan yang diciptakan untuk meniru kecerdasan manusia.
Perkembangan Awal
Turing test oleh Alan Turing.
Dartmouth Workshop 1956.
Machine Learning dan Deep Learning
Saat ini AI digunakan di mana-mana:
- Mobil otonom
- Rekomendasi film
- Chatbot cerdas

| Aspek | AI Klasik | AI Modern |
|-------|-----------|-----------|
| Pengetahuan | Terbatas | Luas |
| Fleksibilitas | Rendah | Tinggi |

Masa Depan AI
Kita tidak pernah tahu apa yang akan terjadi selanjutnya.`;

  const handleFormat = async () => {
    if (!input.trim()) return;
    setIsFormatting(true);
    try {
      const formatted = await formatText(input);
      setOutput(formatted);
    } catch (error) {
      alert('Gagal merapikan teks. Pastikan koneksi internet stabil.');
    } finally {
      setIsFormatting(false);
    }
  };

  const handleCopy = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleDownload = () => {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'penarapi-formatted-book.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm('Bersihkan semua teks?')) {
      setInput('');
      setOutput('');
      localStorage.removeItem('penarapi_draft_input');
      localStorage.removeItem('penarapi_draft_output');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col font-sans">
      {/* Header */}
      <header className="h-[70px] bg-[var(--color-bg)] border-b-2 border-[var(--color-ink)] flex items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-3">
          <BookOpen className="text-[var(--color-ink)] w-6 h-6" />
          <h1 className="font-logo text-2xl font-black uppercase tracking-tighter text-[var(--color-ink)]">
            PenaRapi <span className="text-[var(--color-muted)] font-normal text-lg tracking-normal">// Editor</span>
          </h1>
        </div>
        
          <div className="flex items-center gap-4">
            <button
              onClick={handleClear}
              className="p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
              title="Bersihkan"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-[var(--color-border)]" />
            
            <button
              onClick={handleGoogleExport}
              disabled={!output || isExporting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border-2 border-[#4285F4] font-bold text-[10px] uppercase transition-all hover:bg-[#4285F4] hover:text-white disabled:opacity-30",
                googleAuthStatus ? "text-[#4285F4]" : "bg-[#4285F4] text-white"
              )}
            >
              {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              {googleAuthStatus ? "Open in Docs" : "Connect Google Docs"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!output}
              className="px-6 py-2 border-2 border-[var(--color-ink)] bg-transparent text-[var(--color-ink)] font-bold text-xs uppercase transition-all hover:bg-[var(--color-ink)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hidden sm:block"
            >
              Export TXT
            </button>
          </div>
      </header>

      <main className="flex-1 flex flex-col md:grid md:grid-cols-2">
        {/* Left Side: Input */}
        <div className="flex flex-col border-r border-[var(--color-border)] bg-[#FAFAFA] p-6 lg:p-10 space-y-4">
          <div className="flex items-center justify-between uppercase tracking-widest text-[11px] font-extrabold text-[var(--color-muted)]">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4" />
              <span>Raw Input (Paste Here)</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setInput(sampleText)}
                className="hover:text-[var(--color-ink)] transition-colors"
                title="Gunakan contoh teks"
              >
                Coba Contoh
              </button>
              <span>|</span>
              <span>{input.length} Chars</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 p-2 border-y border-[var(--color-border)] bg-white/50">
            <button 
              onClick={() => applyFormat('h1')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => applyFormat('h2')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
            <button 
              onClick={() => applyFormat('bold')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button 
              onClick={() => applyFormat('italic')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button 
              onClick={() => applyFormat('list')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => applyFormat('table')}
              className="p-1.5 hover:bg-[var(--color-ink)] hover:text-white rounded transition-colors"
              title="Insert Table"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck="false"
            placeholder="Tempel teks acak, draf tulisan, atau poin-poin ide Anda di sini..."
            className="flex-1 w-full bg-transparent border-none outline-none resize-none font-sans text-[15px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/50 py-10"
          />
          
          <button
            onClick={handleFormat}
            disabled={isFormatting || !input.trim()}
            className={cn(
              "w-full py-4 px-6 border-2 border-[var(--color-ink)] flex items-center justify-center gap-3 font-black text-sm uppercase transition-all active:scale-[0.98]",
              isFormatting || !input.trim() 
                ? "opacity-30 cursor-not-allowed" 
                : "bg-[var(--color-ink)] text-white hover:bg-transparent hover:text-[var(--color-ink)]"
            )}
          >
            {isFormatting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Formatting...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Auto-Format
              </>
            )}
          </button>
        </div>

        {/* Right Side: Preview */}
        <div className="flex flex-col bg-white p-6 lg:p-10 space-y-4 shadow-[inset_10px_0_20px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between uppercase tracking-widest text-[11px] font-extrabold text-[var(--color-muted)]">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Formatted Preview</span>
            </div>
            
            <button
              onClick={handleCopy}
              disabled={!output}
              className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors disabled:opacity-30"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto book-preview pr-4 pt-10 pb-20 scroll-smooth">
            <AnimatePresence mode="wait">
              {output ? (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Table of Contents Section */}
                  {toc.length > 0 && (
                    <div className="mb-12 p-8 border-2 border-[var(--color-ink)] bg-[var(--color-bg)] rounded-sm print:hidden">
                      <div className="flex items-center gap-2 mb-6 border-b border-[var(--color-ink)] pb-2">
                        <List className="w-5 h-5" />
                        <h2 className="!m-0 !text-xl !font-black !uppercase !tracking-widest !font-logo">Daftar Isi</h2>
                      </div>
                      <nav className="space-y-2">
                        {toc.map((item, index) => (
                          <a
                            key={`${item.id}-${index}`}
                            href={`#${item.id}`}
                            className={cn(
                              "block transition-all hover:text-[var(--color-accent)] hover:translate-x-1 decoration-[var(--color-ink)]/10 hover:decoration-[var(--color-accent)]",
                              item.level === 1 ? "font-bold text-lg uppercase" : 
                              item.level === 2 ? "font-medium text-base ml-4 italic" : 
                              "text-sm ml-8 text-[var(--color-muted)]"
                            )}
                          >
                            <span className="inline-block mr-2 opacity-30 select-none">
                              {item.level === 1 ? '—' : item.level === 2 ? '•' : '◦'}
                            </span>
                            {item.text}
                          </a>
                        ))}
                      </nav>
                    </div>
                  )}

                  <ReactMarkdown 
                    rehypePlugins={[rehypeSlug]} 
                    remarkPlugins={[remarkGfm]}
                  >
                    {output}
                  </ReactMarkdown>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted)]/30 text-center uppercase tracking-widest font-black">
                  <RotateCcw className="w-16 h-16 mb-4 opacity-10" />
                  <p className="text-sm">Waiting for input</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="h-10 border-t border-[var(--color-border)] flex items-center justify-between px-6 md:px-10 text-[10px] font-bold uppercase tracking-[2px] text-[var(--color-muted)] bg-[var(--color-bg)]">
        <div>Characters: {output.length} | Pages: {Math.max(1, Math.ceil(output.length / 2500))}</div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          AI Engine: Gemini-3-Flash
        </div>
      </footer>
    </div>
  );
}
