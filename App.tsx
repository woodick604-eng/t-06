
import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { geminiService } from './services/geminiService';
import { AppStatus, UsageStats } from './types';

// Estimació de costos per al dictat (Gemini 3 Flash)
const COST_PER_1M_INPUT_EUR = 0.10;
const COST_PER_1M_OUTPUT_EUR = 0.40;

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [report, setReport] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  
  // Seguiment de consum
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const reportRef = useRef<HTMLTextAreaElement>(null);

  const updateUsage = (usage: UsageStats) => {
    setTotalTokens(prev => prev + usage.totalTokens);
    setTotalCost(prev => prev + usage.estimatedCostEur);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
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
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/webm',
                  data: base64Audio
                }
              },
              {
                text: "Actua com un redactor professional dels Mossos d'Esquadra. Transcriu aquest dictat i processa-ho directament: corregeix la gramàtica, elimina crossis (eeeh, mmm, doncs...), i redacta-ho en llenguatge policial formal. Si el dictat és en castellà, processa-ho en castellà. Si és en català, en català. NO incloguis matrícules ni noms de persones. Només retorna el text processat."
              }
            ]
          }
        ],
        config: {
          temperature: 0.1
        }
      });

      const processedText = response.text || '';
      setInputText(prev => (prev ? prev + '\n' + processedText : processedText));

      const usageMetadata = (response as any).usageMetadata;
      if (usageMetadata) {
        const inputCost = (usageMetadata.promptTokenCount / 1000000) * COST_PER_1M_INPUT_EUR;
        const outputCost = (usageMetadata.candidatesTokenCount / 1000000) * COST_PER_1M_OUTPUT_EUR;
        updateUsage({
          promptTokens: usageMetadata.promptTokenCount,
          candidatesTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
          estimatedCostEur: inputCost + outputCost
        });
      }

    } catch (err) {
      console.error('Error processant àudio:', err);
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus(AppStatus.LISTENING);
    } catch (err) {
      console.error('Error accedint al micròfon:', err);
      alert('Cal permís per al micròfon.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus(AppStatus.IDLE);
    }
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();

  const handleSend = async () => {
    if (!inputText.trim()) return;
    setStatus(AppStatus.GENERATING);
    const result = await geminiService.generateReport(inputText);
    setReport(result.text);
    if (result.usage) updateUsage(result.usage);
    setStatus(AppStatus.EDITING);
  };

  const sendEmail = () => {
    const natMatch = report.match(/NAT\s*[:\-\s]*(\d+)/i);
    const nat = natMatch ? natMatch[1] : 'SENSE_NAT';
    const recipients = "itpg31459@mossos.cat,itpg7255@mossos.cat";
    const subject = `Informe Accident - NAT ${nat}`;
    const body = encodeURIComponent(report);
    window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(report);
      alert('Informe copiat al porta-retalls.');
    } catch (err) {
      alert('Error al copiar.');
    }
  };

  const reset = () => {
    if (window.confirm('Vols esborrar tota la sessió operativa actual?')) {
      setInputText('');
      setReport('');
      setStatus(AppStatus.IDLE);
    }
  };

  return (
    <div className="min-h-screen bg-[#060a14] flex flex-col font-sans text-slate-200 selection:bg-rose-500/30 overflow-x-hidden">
      
      {/* HEADER CORPORATIU */}
      <header className="bg-[#002D56] text-white p-4 md:p-6 lg:p-8 shadow-2xl flex justify-between items-center sticky top-0 z-50 border-b-4 border-[#E30613]">
        <div className="flex items-center space-x-4 md:space-x-8">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-[#E30613] rounded-xl shadow-[0_0_20px_rgba(227,6,19,0.3)] flex items-center justify-center font-black text-xl md:text-3xl border-2 border-white/20">ME</div>
          <div>
            <h1 className="text-xl md:text-3xl lg:text-4xl font-black tracking-widest uppercase leading-none">Accidents T06</h1>
            <p className="text-[10px] md:text-xs lg:text-sm uppercase tracking-[0.5em] font-bold text-white/80 mt-2">UNITAT REGIONAL DE TRÀNSIT • SISTEMA DE REDACCIÓ</p>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end">
          <div className="text-[11px] lg:text-sm font-black text-white bg-black/30 px-4 py-1.5 rounded-lg border border-white/10 uppercase tracking-widest">ESTAT: OPERATIU</div>
          <div className="text-[9px] font-bold text-white/40 mt-2 uppercase tracking-tighter">AI CORE X-BUILD v2.5 PRO</div>
        </div>
      </header>

      {/* WIDGET DE CONSUM MINIMITZAT */}
      <div className="fixed bottom-4 right-4 z-[70] bg-[#002D56] border border-slate-700 shadow-xl rounded-xl p-2 md:p-3 border-l-4 border-l-[#E30613] opacity-80 hover:opacity-100 transition-all">
        <div className="flex flex-col items-end">
          <div className="text-[7px] md:text-[9px] font-black uppercase tracking-tighter text-slate-400">CONSUM</div>
          <div className="flex items-center space-x-2">
            <span className="text-[8px] font-bold text-slate-500">{totalTokens.toLocaleString()} TKN</span>
            <span className="text-xs md:text-sm font-black text-white">{totalCost.toFixed(4)}€</span>
          </div>
        </div>
      </div>

      {/* CONTINGUT PRINCIPAL */}
      <main className={`flex-1 w-full mx-auto px-4 py-6 md:py-10 lg:py-14 transition-all duration-700 pb-48 ${report ? 'max-w-[1800px]' : 'max-w-5xl'}`}>
        
        <div className={`grid gap-8 md:gap-12 lg:gap-16 ${report ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          
          {/* COLUMNA ESQUERRA: ENTRADA / DICTAT */}
          <section className="flex flex-col space-y-6">
            <div className={`bg-slate-900/50 rounded-[2.5rem] border-2 transition-all duration-500 overflow-hidden flex flex-col relative ${isRecording ? 'border-[#E30613] pulse-red bg-[#E30613]/5' : 'border-slate-800 shadow-2xl shadow-black/40'}`}>
              
              {(isProcessingAudio || status === AppStatus.GENERATING) && <div className="scan-line"></div>}

              <div className={`px-8 py-5 md:py-8 flex justify-between items-center ${isRecording ? 'bg-[#E30613]/30' : 'bg-[#002D56]/60'}`}>
                <div className="flex items-center space-x-5">
                  <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse shadow-[0_0_20px_rgba(244,63,94,1)]' : 'bg-slate-700'}`}></div>
                  <h2 className="text-sm md:text-lg lg:text-xl font-black uppercase tracking-[0.2em] text-white">
                    {isRecording ? 'CAPTANT TRANSMISSIÓ' : '1. RECOLLIDA DE DADES BRUTES'}
                  </h2>
                </div>
                
                <button 
                  onClick={toggleRecording}
                  className={`p-7 md:p-10 rounded-full shadow-2xl transition-all active:scale-90 border-4 ${
                    isRecording 
                    ? 'bg-[#E30613] border-white/30 text-white animate-pulse scale-110' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  aria-label="Dictat per veu"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 md:h-12 md:w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    {isRecording ? <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" /> : <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />}
                    {!isRecording && <path d="M19 10v2a7 7 0 0 1-14 0v-2" />}
                    {!isRecording && <line x1="12" y1="19" x2="12" y2="23" />}
                  </svg>
                </button>
              </div>
              
              <div className="relative flex-1">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className={`w-full h-80 md:h-[500px] lg:h-[650px] p-8 md:p-12 lg:p-16 text-slate-200 text-lg md:text-2xl lg:text-[16px] lg:font-['Arial'] font-medium placeholder-slate-700 focus:outline-none resize-none leading-relaxed bg-transparent scrollbar-thin scrollbar-thumb-slate-800 transition-opacity duration-300 ${isProcessingAudio ? 'opacity-40' : 'opacity-100'}`}
                  placeholder={isRecording ? "Escoltant..." : "Introduïu dades o feu servir el dictat..."}
                  spellCheck={false}
                  disabled={isRecording || isProcessingAudio}
                />
                
                {(status === AppStatus.GENERATING && !report) || isProcessingAudio ? (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center z-20">
                    <div className="w-20 h-20 border-8 border-slate-800 border-t-[#E30613] rounded-full animate-spin mb-10 shadow-[0_0_30px_rgba(227,6,19,0.3)]"></div>
                    <p className="font-black text-white uppercase tracking-[0.3em] text-sm md:text-lg lg:text-xl">
                      {isProcessingAudio ? 'PROCESSANT DICTAT...' : 'GENERANT EVOLUCIÓ T-06...'}
                    </p>
                    <p className="text-xs text-slate-500 mt-4 uppercase font-bold tracking-widest">Anàlisi de llenguatge policial actiu</p>
                  </div>
                ) : null}
              </div>

              <div className="p-6 md:p-10 lg:p-12 bg-slate-950/60 border-t-4 border-slate-800 flex flex-col sm:flex-row gap-6 justify-between items-center">
                <button onClick={reset} className="w-full sm:w-auto text-[11px] lg:text-sm font-black text-slate-600 hover:text-[#E30613] uppercase tracking-[0.4em] px-8 py-4 transition-all active:scale-95">Reset Sessió</button>
                <button 
                  onClick={handleSend}
                  disabled={status === AppStatus.GENERATING || !inputText.trim() || isRecording || isProcessingAudio}
                  className="w-full sm:w-auto px-12 py-6 md:px-16 md:py-8 bg-[#002D56] text-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,45,86,0.5)] font-black text-sm md:text-xl lg:text-2xl tracking-[0.1em] hover:bg-[#003a6e] disabled:opacity-5 transition-all uppercase flex justify-center items-center space-x-5 active:scale-95 border-b-8 border-[#001D36]"
                >
                  <span>Generar Informe T06</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          {/* COLUMNA DRETA: INFORME GENERAT */}
          {report && (
            <section className="flex flex-col space-y-6 animate-in fade-in slide-in-from-right-20 duration-1000">
              <div className="bg-slate-900 rounded-[3rem] border-4 border-[#002D56] shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-full border-t-[#E30613] border-t-[12px] relative">
                
                {status === AppStatus.GENERATING && <div className="scan-line"></div>}

                <div className="p-8 md:p-10 lg:p-12 bg-[#002D56] flex flex-col sm:flex-row gap-6 justify-between items-center shadow-2xl relative z-10">
                  <div className="flex items-center space-x-6 self-start sm:self-center">
                    <div className="bg-[#E30613] text-xs font-black px-4 py-1.5 rounded-lg shadow-2xl text-white tracking-widest">MINUTA T06</div>
                    <div className="flex flex-col">
                      <span className="text-sm md:text-xl lg:text-2xl font-black uppercase tracking-[0.15em] text-white leading-none">INFORME DE REDACCIÓ</span>
                      <span className="text-[10px] md:text-xs lg:text-sm font-bold text-emerald-400 uppercase tracking-widest mt-2 flex items-center">
                        <span className="w-3 h-3 bg-emerald-500 rounded-full mr-3 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]"></span>
                        Validació AI completada
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-4 w-full sm:w-auto">
                    <button 
                      onClick={copyToClipboard} 
                      className="flex-1 sm:flex-none bg-white/10 hover:bg-white/20 text-white font-black text-xs md:text-sm px-8 py-5 rounded-2xl uppercase transition-all flex items-center justify-center space-x-3 border-2 border-white/10 active:scale-95"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeWidth="3" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2" />
                      </svg>
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>

                <div className={`flex-1 p-8 md:p-14 lg:p-20 bg-[#0c1220] transition-opacity duration-500 ${status === AppStatus.GENERATING ? 'opacity-30' : 'opacity-100'}`}>
                  <textarea
                    ref={reportRef}
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                    className="w-full h-[500px] md:h-full lg:min-h-[750px] text-slate-100 leading-[1.6] lg:font-['Arial'] font-sans text-lg lg:text-[16px] font-semibold border-none focus:ring-0 focus:outline-none resize-none bg-transparent selection:bg-[#E30613]/50 scrollbar-thin scrollbar-thumb-slate-800"
                    spellCheck={false}
                  />
                </div>

                <div className="p-8 md:p-12 lg:p-14 bg-[#002D56]/10 border-t-2 border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-10">
                  <div className="text-center lg:text-left">
                    <div className="text-[11px] md:text-sm font-black text-slate-500 uppercase tracking-[0.4em] mb-4">
                      UNITAT TÈCNICA DE SUPORT
                    </div>
                    <div className="text-xs md:text-base font-bold text-slate-400 px-6 py-3 bg-slate-950/90 rounded-2xl border-2 border-slate-800/50 inline-block uppercase tracking-widest shadow-xl">
                      MOSSOS D'ESQUADRA • TRÀNSIT
                    </div>
                  </div>
                  
                  <button 
                    onClick={sendEmail}
                    className="w-full lg:w-auto bg-emerald-700 hover:bg-emerald-600 text-white font-black text-sm md:text-xl lg:text-2xl px-16 py-8 rounded-[2.5rem] shadow-[0_25px_60px_rgba(4,120,87,0.4)] uppercase transition-all flex items-center justify-center space-x-6 active:scale-95 border-b-[10px] border-emerald-900"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 lg:h-10 lg:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Enviar Email</span>
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="p-10 md:p-16 text-center bg-[#000d1a] border-t-2 border-slate-900/50 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10 opacity-50">
          <p className="text-xs md:text-sm font-black tracking-[0.6em] uppercase text-slate-500">Mossos d'Esquadra • Generalitat de Catalunya</p>
          <div className="flex items-center space-x-12 grayscale opacity-30">
             <div className="w-24 h-8 bg-slate-800 rounded-lg"></div>
             <div className="w-16 h-8 bg-slate-800 rounded-lg"></div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
