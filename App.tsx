
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { geminiService } from './services/geminiService';
import { AppStatus, UsageStats } from './types';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [lastProcessedInput, setLastProcessedInput] = useState('');
  const [report, setReport] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleReset = () => {
    if (window.confirm('Vols esborrar tot el contingut actual i començar de nou?')) {
      setInputText('');
      setLastProcessedInput('');
      setReport('');
      setStatus(AppStatus.IDLE);
      setTotalCost(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
          { text: "Transcriu aquest dictat policial. Corregeix gramàtica i manté registre formal. NO inventis dades, matrícules ni noms. Elimina asteriscs i qualsevol format markdown. El resultat ha de ser text net." }
        ]}],
        config: { temperature: 0.1 }
      });
      const processedText = (response.text || '').replace(/\*/g, '');
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
    const cleanResultText = result.text.replace(/\*/g, '');
    setReport(cleanResultText);
    setLastProcessedInput(inputText);
    
    if (result.usage) updateUsage(result.usage);
    setStatus(AppStatus.EDITING);
    
    if (!lastProcessedInput) {
      setTimeout(() => {
        document.getElementById('report-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const sendEmail = () => {
    const natMatch = report.match(/NAT\s*(\d+(\/\d+)?)/i);
    const nat = natMatch ? natMatch[1] : 'SENSE_NAT';
    const yearShort = new Date().getFullYear().toString().slice(-2);
    const fullNatForSubject = nat.includes('/') ? nat : `${nat}/${yearShort}`;
    
    const recipients = "aadsuar@mossos.cat,itpg7255@mossos.cat";
    const subject = `Valoració de l'agent actuant del NAT ${fullNatForSubject} ART MN`;
    
    const cleanReport = report.replace(/\*/g, '');
    const cleanInput = inputText.replace(/\*/g, '');
    
    const fullBody = `**PROBABLE EVOLUCIO T-06**\n\n${cleanReport}\n\n\n\n--------------------------------------------------\n\n**RELAT DE L'AGENT PER SEGURETAT**\n\n${cleanInput}`;
    
    const mailtoUrl = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
    window.location.href = mailtoUrl;
  };

  const openImageProcessor = () => {
    window.open('https://processador-d-imatges-d-informes-d-accidents-per-61923779161.us-west1.run.app/', '_blank');
  };

  const isModified = report !== '' && inputText !== lastProcessedInput;
  const buttonLabel = isModified ? 'Actualitzar T-06' : 'Generar T-06';

  return (
    <div className="min-h-screen bg-[#060a14] text-slate-100 flex flex-col">
      <header className="sticky top-0 z-50 bg-[#002D56] border-b-4 border-[#E30613] p-4 flex justify-between items-center shadow-2xl">
        <div className="flex items-center space-x-3">
          <div className="bg-[#E30613] w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl shadow-[0_0_15px_rgba(227,6,19,0.5)]">ME</div>
          <div>
            <h1 className="text-sm md:text-lg font-black tracking-widest uppercase">T06 EVOLUCIÓ</h1>
            <p className="text-[8px] uppercase tracking-tighter text-white/40">SISTEMA DE REDACCIÓ CONTINUA</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1">
          <div className="flex items-center space-x-4">
            <span className="text-[10px] font-bold text-white/70 tracking-widest">@5085</span>
            <button 
              onClick={handleReset} 
              className="text-[9px] font-black text-white/50 hover:text-white hover:border-white/40 uppercase tracking-widest border border-white/10 px-3 py-1 rounded transition-colors active:scale-90"
            >
              Reset
            </button>
          </div>
          <span className="text-[8px] font-mono text-white/30 tracking-widest">{totalCost.toFixed(4)}€</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 space-y-12 pb-40">
        
        {/* ENTRADA DE RELAT */}
        <section className={`space-y-4 transition-all duration-500 ${isRecording ? 'scale-[1.01]' : ''}`}>
          <div className="flex items-center space-x-2 border-l-4 border-slate-700 pl-3">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
              {isRecording ? 'Gravant relat...' : isProcessingAudio ? 'Processant dictat...' : "Relat de l'agent actuant"}
            </span>
            {isRecording && <span className="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>}
          </div>
          
          <div className={`relative bg-slate-900/30 rounded-2xl border transition-all duration-300 ${isRecording ? 'border-red-900/50 shadow-[0_0_30px_rgba(227,6,19,0.2)]' : 'border-slate-800 focus-within:border-slate-600'}`}>
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="auto-expand w-full p-6 md:p-10 text-[16px] leading-relaxed font-['Arial'] bg-transparent outline-none placeholder-slate-800"
              placeholder="Dicta o escriu el relat de l'accident..."
              disabled={isProcessingAudio || status === AppStatus.GENERATING}
            />
            {isProcessingAudio && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl backdrop-blur-sm z-30">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                  <span className="text-[9px] font-black tracking-widest animate-pulse">NETEJANT TEXT...</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* INFORME T-06 */}
        {report && (
          <section id="report-section" className="space-y-6 pt-10 border-t-2 border-slate-800 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3 border-l-4 border-[#E30613] pl-3">
                <span className="text-lg md:text-2xl font-black uppercase tracking-widest text-[#E30613]">Evolució T-06</span>
              </div>
              <button 
                onClick={() => { navigator.clipboard.writeText(report); alert('Copiat!'); }}
                className="bg-slate-800 p-2 rounded-lg hover:bg-slate-700 transition-colors active:scale-95"
                title="Copiar al porta-retalls"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2" /></svg>
              </button>
            </div>
            
            <div className={`relative bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col transition-all duration-500 ${status === AppStatus.GENERATING ? 'processing-pulse' : ''}`}>
              {status === AppStatus.GENERATING && <div className="scan-line"></div>}
              
              <textarea
                ref={outputRef}
                value={report}
                onChange={(e) => setReport(e.target.value)}
                className={`auto-expand w-full p-8 md:p-14 text-[16px] font-semibold leading-relaxed font-['Arial'] bg-[#0c1220] outline-none text-slate-100 transition-opacity duration-300 ${status === AppStatus.GENERATING ? 'opacity-30' : 'opacity-100'}`}
                spellCheck={false}
              />

              {status === AppStatus.GENERATING && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-[#E30613]/20 border-t-[#E30613] rounded-full animate-spin mb-3"></div>
                    <span className="text-[10px] font-black tracking-[0.4em] text-[#E30613] animate-pulse">INTEGRANT DADES...</span>
                  </div>
                </div>
              )}
              
              <div className="p-4 md:p-6 bg-black/20 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                <button 
                  onClick={openImageProcessor}
                  className="hidden lg:flex bg-slate-800 hover:bg-slate-700 text-white/70 px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-xl transition-all items-center space-x-2 border border-white/5 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span>Fotos (Escriptori)</span>
                </button>
                <button 
                  onClick={sendEmail}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center space-x-3 border border-white/10 active:scale-95 hover:scale-105 w-full md:w-auto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" /></svg>
                  <span>Enviar Correu T-06</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {status === AppStatus.GENERATING && !report && (
          <div className="flex flex-col items-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-slate-800 border-t-[#E30613] rounded-full animate-spin mb-6"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-[#002D56] rounded-full animate-spin-slow"></div>
            </div>
            <p className="text-[9px] font-black tracking-[0.5em] text-white/50 animate-pulse uppercase">IA GENERANT INFORME...</p>
          </div>
        )}
      </main>

      <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end space-y-4">
        {inputText.length > 5 && (
          <button 
            onClick={handleGenerate}
            disabled={status === AppStatus.GENERATING}
            className={`px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl transition-all flex items-center space-x-3 border-2 border-white/10 active:scale-95 hover:brightness-110 hover:scale-105 ${
              status === AppStatus.GENERATING ? 'btn-loading' : isModified ? 'bg-[#E30613] text-white animate-pulse' : 'bg-[#002D56] text-white'
            }`}
          >
            <span className={status === AppStatus.GENERATING ? 'invisible' : ''}>{buttonLabel}</span>
            {status !== AppStatus.GENERATING && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            )}
          </button>
        )}

        <div className="relative">
          {isRecording && <div className="recording-wave"></div>}
          <button 
            onClick={toggleRecording}
            disabled={status === AppStatus.GENERATING}
            className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${
              isRecording 
              ? 'bg-rose-600 text-white record-btn-active scale-110 shadow-[0_0_50px_rgba(227,6,19,0.5)]' 
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
        PG-ME • ÀREA DE TRÀNSIT • UNITAT T-06 • COST ACUMULAT: {totalCost.toFixed(4)}€
      </footer>
    </div>
  );
};

export default App;
