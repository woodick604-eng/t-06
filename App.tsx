
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { geminiService } from './services/geminiService';
import { AppStatus, UsageStats } from './types';

const COST_PER_1M_INPUT_EUR = 0.10;
const COST_PER_1M_OUTPUT_EUR = 0.40;

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [report, setReport] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-ajust de l'alçada de les textàrees per evitar scrolls interns
  const adjustHeight = (ref: React.RefObject<HTMLTextAreaElement>) => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  };

  useEffect(() => { adjustHeight(inputRef); }, [inputText]);
  useEffect(() => { adjustHeight(outputRef); }, [report]);

  const updateUsage = (usage: UsageStats) => {
    setTotalCost(prev => prev + usage.estimatedCostEur);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessingAudio(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const base64Audio = await blobToBase64(audioBlob);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [
          { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
          { text: "Actua com un redactor professional dels Mossos d'Esquadra. Transcriu aquest dictat i processa-ho directament: corregeix la gramàtica i redacta-ho en llenguatge policial formal. Si el dictat és en castellà, processa-ho en castellà. Si és en català, en català. NO incloguis matrícules ni noms. Només text processat." }
        ]}],
        config: { temperature: 0.1 }
      });
      const processedText = response.text || '';
      setInputText(prev => (prev ? prev + '\n' + processedText : processedText));
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setStatus(AppStatus.IDLE);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current);
          await processAudio(blob);
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        setIsRecording(true);
        setStatus(AppStatus.LISTENING);
      } catch (err) {
        alert('Micròfon no disponible.');
      }
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setStatus(AppStatus.GENERATING);
    const result = await geminiService.generateReport(inputText);
    setReport(result.text);
    if (result.usage) updateUsage(result.usage);
    setStatus(AppStatus.EDITING);
    // Scroll suau cap a l'informe
    setTimeout(() => {
      document.getElementById('report-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const sendEmail = () => {
    const natMatch = report.match(/NAT\s*(\d+)/i);
    const nat = natMatch ? natMatch[1] : 'SENSE_NAT';
    const recipients = "itpg31459@mossos.cat,itpg7255@mossos.cat";
    const subject = `Informe Accident - NAT ${nat}`;
    const body = encodeURIComponent(report);
    window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-[#060a14] text-slate-100 flex flex-col">
      
      <header className="sticky top-0 z-50 bg-[#002D56] border-b-4 border-[#E30613] p-4 flex justify-between items-center shadow-2xl">
        <div className="flex items-center space-x-3">
          <div className="bg-[#E30613] w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl">ME</div>
          <div>
            <h1 className="text-sm md:text-lg font-black tracking-widest uppercase">T06 EVOLUCIÓ</h1>
            <p className="text-[8px] uppercase tracking-tighter text-white/40">SISTEMA DE REDACCIÓ CONTINUA</p>
          </div>
        </div>
        <button onClick={() => window.confirm('Reiniciar?') && window.location.reload()} className="text-[9px] font-black text-white/50 hover:text-white uppercase tracking-widest border border-white/10 px-3 py-1 rounded">Reset</button>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 space-y-12 pb-40">
        
        {/* ENTRADA DE DADES */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 border-l-4 border-slate-700 pl-3">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Recollida de fets</span>
          </div>
          <div className="relative bg-slate-900/30 rounded-2xl border border-slate-800 focus-within:border-slate-600 transition-colors">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="auto-expand w-full p-6 md:p-10 text-[16px] leading-relaxed font-['Arial'] bg-transparent outline-none placeholder-slate-800"
              placeholder="Dicta o escriu aquí els fets de l'accident..."
              disabled={isProcessingAudio || status === AppStatus.GENERATING}
            />
            {isProcessingAudio && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl backdrop-blur-sm">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                  <span className="text-[9px] font-black tracking-widest">TRANSCRIU...</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* INFORME GENERAT */}
        {report && (
          <section id="report-section" className="space-y-6 pt-10 border-t-2 border-slate-800 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3 border-l-4 border-[#E30613] pl-3">
                <span className="text-lg md:text-2xl font-black uppercase tracking-widest text-[#E30613]">Probable evolució T-06</span>
              </div>
              <button 
                onClick={() => { navigator.clipboard.writeText(report); alert('Copiat!'); }}
                className="bg-slate-800 p-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2" /></svg>
              </button>
            </div>
            
            <div className="relative bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col">
              {status === AppStatus.GENERATING && <div className="scan-line"></div>}
              <textarea
                ref={outputRef}
                value={report}
                onChange={(e) => setReport(e.target.value)}
                className="auto-expand w-full p-8 md:p-14 text-[16px] leading-relaxed font-['Arial'] font-semibold bg-[#0c1220] outline-none text-slate-100"
                spellCheck={false}
              />
              
              {/* BOTÓ ENVIAR EMAIL - INTEGRAT AL FINAL DEL DOCUMENT I MÉS PETIT */}
              <div className="p-6 md:p-8 bg-black/20 border-t border-white/5 flex justify-center md:justify-end">
                <button 
                  onClick={sendEmail}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center space-x-3 border border-white/10 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <span>Enviar per Email</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {status === AppStatus.GENERATING && !report && (
          <div className="flex flex-col items-center py-20 animate-pulse">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-[#E30613] rounded-full animate-spin mb-6"></div>
            <p className="text-[9px] font-black tracking-[0.5em] text-white/50">IA PROCESSANT T06...</p>
          </div>
        )}
      </main>

      {/* --- BOTONS FLOTANTS (ESTRICTAMENT NECESSARIS) --- */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end space-y-4">
        
        {/* BOTÓ GENERAR (Flotant fins que es crea el report) */}
        {!report && inputText.length > 10 && status !== AppStatus.GENERATING && (
          <button 
            onClick={handleGenerate}
            className="bg-[#002D56] text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform flex items-center space-x-3 border-2 border-white/10"
          >
            <span>Generar T06</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        )}

        {/* BOTÓ MICRO (Sempre flotant per accessibilitat ràpida) */}
        <div className="relative">
          {isRecording && <div className="recording-wave"></div>}
          <button 
            onClick={toggleRecording}
            disabled={status === AppStatus.GENERATING}
            className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${
              isRecording 
              ? 'bg-rose-600 text-white record-btn-active scale-110' 
              : 'bg-slate-800 text-slate-400 border-2 border-slate-700'
            }`}
          >
            {isRecording ? (
              <div className="w-6 h-6 bg-white rounded-sm animate-pulse"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
            )}
          </button>
        </div>
      </div>

      <footer className="p-4 bg-black/40 text-[8px] font-black text-slate-700 text-center tracking-[0.5em] uppercase border-t border-white/5">
        PG-ME • ÀREA DE TRÀNSIT • COST: {totalCost.toFixed(4)}€
      </footer>
    </div>
  );
};

export default App;
