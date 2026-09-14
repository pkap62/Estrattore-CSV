import React, { useState, useRef } from 'react';
import {
  Upload,
  FolderUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RotateCcw,
  StopCircle,
  Trash2,
  Ban,
  Layers,
} from 'lucide-react';
import { InvoiceRecord, UploadTask } from '../types';

interface UploadSectionProps {
  onInvoicesAdded: (newInvoices: InvoiceRecord[], mode: 'append' | 'replace') => void;
  onRemoveInvoice?: (invoiceId: string) => void;
  onClearUploadedInvoices?: (invoiceIds?: string[]) => void;
  onPromptResetAll?: () => void;
  resetTrigger?: number;
  existingCount: number;
  uploadedInvoicesCount?: number;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onInvoicesAdded,
  onRemoveInvoice,
  onClearUploadedInvoices,
  onPromptResetAll,
  resetTrigger = 0,
  existingCount,
  uploadedInvoicesCount = 0,
}) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedResults, setCompletedResults] = useState<InvoiceRecord[]>([]);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const cancelProcessingRef = useRef<boolean>(false);

  // Listen to external reset trigger
  React.useEffect(() => {
    if (resetTrigger > 0) {
      cancelProcessingRef.current = true;
      setIsProcessing(false);
      setTasks([]);
      setCompletedResults([]);
      setUploadNotice(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }, [resetTrigger]);

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (file) =>
        file.name.toLowerCase().endsWith('.pdf') ||
        file.name.toLowerCase().endsWith('.xml') ||
        file.name.toLowerCase().endsWith('.p7m') ||
        file.name.toLowerCase().endsWith('.txt') ||
        file.name.toLowerCase().endsWith('.csv') ||
        file.name.toLowerCase().endsWith('.png') ||
        file.name.toLowerCase().endsWith('.jpg') ||
        file.name.toLowerCase().endsWith('.jpeg') ||
        file.type.includes('pdf') ||
        file.type.includes('image') ||
        file.type.includes('text') ||
        file.type.includes('xml')
    );

    if (fileArray.length === 0) {
      setUploadNotice('Nessun file supportato (.pdf, .xml, .p7m, immagini) trovato nella selezione. Riprova con un\'altra cartella o file.');
      return;
    }

    setUploadNotice(null);
    cancelProcessingRef.current = false;

    const newTasks: UploadTask[] = fileArray.map((file) => ({
      id: Math.random().toString(36).substring(2, 10),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || file.name.split('.').pop() || 'unknown',
      status: 'pending',
      progress: 0,
    }));

    setTasks((prev) => [...prev, ...newTasks]);

    // Automatically trigger processing
    processQueue(fileArray, newTasks);
  };

  const processQueue = async (files: File[], newTasks: UploadTask[]) => {
    setIsProcessing(true);
    const results: InvoiceRecord[] = [];

    for (let i = 0; i < files.length; i++) {
      // Check if user requested cancellation
      if (cancelProcessingRef.current) {
        setTasks((prev) =>
          prev.map((t) =>
            t.status === 'pending' || t.status === 'analyzing'
              ? { ...t, status: 'cancelled', progress: 100, errorMessage: 'Analisi interrotta' }
              : t
          )
        );
        break;
      }

      const file = files[i];
      const task = newTasks[i];

      // Update status to analyzing
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'analyzing', progress: 30 } : t))
      );

      try {
        let base64Data = '';
        let textContent = '';

        if (
          file.type.includes('text') ||
          file.name.toLowerCase().endsWith('.xml') ||
          file.name.toLowerCase().endsWith('.txt') ||
          file.name.toLowerCase().endsWith('.csv')
        ) {
          textContent = await file.text();
        } else {
          // Read as data URL and strip header
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const base64 = res.split(',')[1] || '';
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        if (cancelProcessingRef.current) break;

        const res = await fetch('/api/analyze-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data,
            textContent,
          }),
        });

        // Small yield to allow UI to breathe
        await new Promise((resolve) => setTimeout(resolve, 60));

        if (cancelProcessingRef.current) break;

        if (!res.ok) {
          throw new Error(`Errore server (${res.status})`);
        }

        const json = await res.json();
        if (json.success && (json.data || (json.items && json.items.length > 0))) {
          const rawItems: any[] = Array.isArray(json.items) && json.items.length > 0 ? json.items : [json.data];
          
          const newInvoices: InvoiceRecord[] = rawItems.map((item, idx) => ({
            id: item.id || `${Math.random().toString(36).substring(2, 9)}-${idx}`,
            invoiceNumber: item.invoiceNumber || 'S.N.',
            invoiceDate: item.invoiceDate || item.dueDate || '',
            dueDate: item.dueDate,
            supplier: item.supplier || 'Fornitore',
            service: item.service || 'Spesa Fornitura',
            period: item.period || '',
            customerCode: item.customerCode || '',
            pde: item.pde || '',
            podOrPdr: item.podOrPdr || '',
            amount: Number(item.amount) || 0,
            recipient: item.recipient || 'Parrocchia Sacro Cuore al Romito',
            consumption: item.consumption || '',
            fileName: file.name,
            isIncoming: Boolean(item.isIncoming),
            source: json.source,
          }));

          results.push(...newInvoices);

          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, status: 'success', progress: 100, result: newInvoices[0] } : t
            )
          );
        } else {
          throw new Error(json.error || 'Dati non validi');
        }
      } catch (err: any) {
        console.error(`Errore su ${file.name}:`, err);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'error', progress: 100, errorMessage: err.message || 'Errore di analisi' }
              : t
          )
        );
      }
    }

    setIsProcessing(false);
    if (results.length > 0) {
      setCompletedResults((prev) => [...prev, ...results]);
      onInvoicesAdded(results, 'append');
    }
  };

  const handleStopAnalysis = () => {
    cancelProcessingRef.current = true;
    setIsProcessing(false);
  };

  const handleResetAnalysis = () => {
    if (onPromptResetAll) {
      onPromptResetAll();
      return;
    }

    cancelProcessingRef.current = true;
    setIsProcessing(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';

    const idsToRemove = completedResults.map((r) => r.id);
    setTasks([]);
    setCompletedResults([]);
    setUploadNotice(null);

    if (onClearUploadedInvoices) {
      onClearUploadedInvoices(idsToRemove.length > 0 ? idsToRemove : undefined);
    }
  };

  const handleRemoveSingleTask = (task: UploadTask) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (task.result) {
      setCompletedResults((prev) => prev.filter((r) => r.id !== task.result!.id));
      if (onRemoveInvoice) {
        onRemoveInvoice(task.result.id);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const successCount = tasks.filter((t) => t.status === 'success').length;
  const errorCount = tasks.filter((t) => t.status === 'error').length;
  const analyzingCount = tasks.filter((t) => t.status === 'analyzing').length;
  const hasExtractedData = completedResults.length > 0 || uploadedInvoicesCount > 0;

  return (
    <div id="upload-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            Caricamento ed Estrazione Fatture
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Trascina o seleziona i file (PDF, XML FatturaPA, P7M, immagini). Il sistema estrae automaticamente scadenza, importo, fornitore e periodo.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Stop analysis button if currently active */}
          {isProcessing && (
            <button
              type="button"
              id="btn-stop-analysis"
              onClick={handleStopAnalysis}
              className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
              title="Interrompi l'analisi dei file in corso"
            >
              <StopCircle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              Interrompi analisi
            </button>
          )}

          {/* Reset all button */}
          {(tasks.length > 0 || hasExtractedData || existingCount > 0) && !isProcessing && (
            <button
              type="button"
              id="btn-reset-analysis"
              onClick={handleResetAnalysis}
              className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 flex items-center gap-1.5 border border-rose-200 rounded-lg font-medium transition-colors shadow-2xs cursor-pointer"
              title="Azzera tutto: ripulisci sia la tabella che i file caricati"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Azzera tutto
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Upload notice if invalid file types selected */}
        {uploadNotice && (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{uploadNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadNotice(null)}
              className="text-amber-700 hover:text-amber-950 p-1 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Drag & Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 scale-[1.005]'
              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-800">
              Trascina qui le fatture o usa i pulsanti sottostanti
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Supporta file singoli multipli o intere cartelle con file PDF, XML (FatturaPA), P7M e immagini
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* Hidden file input with multiple selection support */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xml,.p7m,.png,.jpg,.jpeg,.txt,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFiles(e.target.files);
                  }
                  if (e.target) e.target.value = '';
                }}
              />

              {/* Hidden folder input */}
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFiles(e.target.files);
                  }
                  if (e.target) e.target.value = '';
                }}
              />

              <button
                type="button"
                id="btn-upload-files"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Seleziona File Fatture
              </button>

              <button
                type="button"
                id="btn-upload-folder"
                onClick={() => folderInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-white hover:bg-indigo-50 active:bg-indigo-100 border border-indigo-300 text-indigo-700 disabled:opacity-50 rounded-lg text-xs sm:text-sm font-semibold shadow-2xs flex items-center gap-2 transition-colors cursor-pointer"
                title="Carica tutti i file all'interno di una cartella del computer"
              >
                <FolderUp className="w-4 h-4 text-indigo-600" />
                Carica Cartella Fatture
              </button>
            </div>
          </div>
        </div>

        {/* Processing status banner */}
        {tasks.length > 0 && (
          <div className="mt-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Avanzamento Analisi ({tasks.length} file)
                </span>
                {isProcessing && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-indigo-700 font-medium bg-indigo-100 px-2 py-0.5 rounded-full">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Elaborazione in corso...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-700 font-medium">✓ {successCount} completati</span>
                {errorCount > 0 && <span className="text-rose-600 font-medium">✗ {errorCount} errori</span>}
                {analyzingCount > 0 && <span className="text-indigo-600 font-medium">⏳ {analyzingCount} in analisi</span>}
              </div>
            </div>

            {/* Task list preview */}
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {tasks.map((task) => (
                <div key={task.id} className="pt-2 flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {task.status === 'analyzing' && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin flex-shrink-0" />}
                    {task.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                    {task.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />}
                    {task.status === 'cancelled' && <Ban className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                    {task.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />}
                    <span className="truncate font-medium text-slate-800">{task.fileName}</span>
                    <span className="text-slate-400">({(task.fileSize / 1024).toFixed(0)} KB)</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {task.status === 'success' && task.result && (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-mono font-medium">
                        Scadenza: {task.result.dueDate} | € {task.result.amount.toFixed(2)}
                      </span>
                    )}
                    {task.status === 'error' && (
                      <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                        {task.errorMessage || 'Errore'}
                      </span>
                    )}
                    {task.status === 'cancelled' && (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                        Interrotta
                      </span>
                    )}
                    {task.status === 'analyzing' && (
                      <span className="text-indigo-600 text-[11px] font-medium">
                        Estrazione dati contabili...
                      </span>
                    )}
                    {task.status === 'pending' && (
                      <span className="text-slate-400 text-[11px]">In attesa</span>
                    )}

                    {/* Single task remove button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveSingleTask(task)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                      title="Rimuovi questo file dall'analisi"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

