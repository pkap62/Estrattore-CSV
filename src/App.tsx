/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  Zap,
  Flame,
  Search,
  ArrowUpDown,
  Filter,
  Eye,
  Info,
  Receipt,
  CheckCircle2,
  Trash2,
  RotateCcw,
  FileText,
  Edit2,
  X,
  Save,
  PlusCircle,
} from 'lucide-react';
import { INITIAL_INVOICES } from './data/invoices';
import { InvoiceRecord } from './types';
import {
  DescriptionFormat,
  generateCsvString,
  downloadCsvFile,
  formatItalianDecimal,
  formatInvoiceDescription,
} from './utils/csv';
import { UploadSection } from './components/UploadSection';

export default function App() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'dueDate' | 'amount' | 'invoiceNumber'>('dueDate');
  const [sortAsc, setSortAsc] = useState(true);
  const [descFormat, setDescFormat] = useState<DescriptionFormat>('standard');
  const [showRawCsv, setShowRawCsv] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Editing state
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);

  // Uploaded records count
  const uploadedCount = useMemo(() => {
    return invoices.filter((inv) => inv.fileName || inv.id.startsWith('uploaded-')).length;
  }, [invoices]);

  // Dynamic distinct services
  const distinctServices = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      if (inv.service) set.add(inv.service);
    });
    return Array.from(set);
  }, [invoices]);

  // Totals calculations
  const totalUscite = useMemo(() => {
    return invoices
      .filter((inv) => !inv.isIncoming)
      .reduce((sum, inv) => sum + inv.amount, 0);
  }, [invoices]);

  const electricityStats = useMemo(() => {
    const list = invoices.filter((inv) => inv.service.toLowerCase().includes('elettrica') || inv.service.toLowerCase().includes('luce'));
    return {
      count: list.length,
      sum: list.reduce((s, inv) => s + inv.amount, 0),
    };
  }, [invoices]);

  const gasStats = useMemo(() => {
    const list = invoices.filter((inv) => inv.service.toLowerCase().includes('gas'));
    return {
      count: list.length,
      sum: list.reduce((s, inv) => s + inv.amount, 0),
    };
  }, [invoices]);

  const otherServicesStats = useMemo(() => {
    const list = invoices.filter((inv) => {
      const s = (inv.service || '').toLowerCase();
      const isElec = s.includes('luce') || s.includes('elettrica');
      const isGas = s.includes('gas');
      return !isElec && !isGas;
    });
    return {
      count: list.length,
      sum: list.reduce((s, inv) => s + inv.amount, 0),
    };
  }, [invoices]);

  // Helper to parse DD/MM/YYYY for reliable sorting
  const parseDate = (d: string) => {
    if (!d || !d.includes('/')) return 0;
    const [day, month, year] = d.split('/').map(Number);
    return new Date(year, (month || 1) - 1, day || 1).getTime();
  };

  // Filtered & sorted records
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        if (serviceFilter !== 'all' && inv.service !== serviceFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.dueDate.includes(q) ||
          inv.invoiceDate.includes(q) ||
          (inv.period && inv.period.toLowerCase().includes(q)) ||
          (inv.podOrPdr && inv.podOrPdr.toLowerCase().includes(q)) ||
          (inv.supplier && inv.supplier.toLowerCase().includes(q)) ||
          (inv.fileName && inv.fileName.toLowerCase().includes(q)) ||
          inv.amount.toString().includes(q)
        );
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'dueDate') {
          diff = parseDate(a.dueDate) - parseDate(b.dueDate);
        } else if (sortField === 'amount') {
          diff = a.amount - b.amount;
        } else if (sortField === 'invoiceNumber') {
          diff = a.invoiceNumber.localeCompare(b.invoiceNumber);
        }
        return sortAsc ? diff : -diff;
      });
  }, [invoices, serviceFilter, searchQuery, sortField, sortAsc]);

  // The generated CSV content based on current invoices and description setting
  const csvContent = useMemo(() => {
    return generateCsvString(invoices, descFormat);
  }, [invoices, descFormat]);

  const handleDownloadCsv = () => {
    if (invoices.length === 0) return;
    downloadCsvFile(csvContent, 'fatture_pagamenti.csv');
  };

  const handleInvoicesAdded = (newInvoices: InvoiceRecord[], mode: 'append' | 'replace') => {
    if (mode === 'replace') {
      setInvoices(newInvoices);
    } else {
      setInvoices((prev) => [...prev, ...newInvoices]);
    }
  };

  const handleDeleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  const handleRemoveInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  const handleClearUploadedInvoices = (idsToRemove?: string[]) => {
    if (idsToRemove && idsToRemove.length > 0) {
      const idSet = new Set(idsToRemove);
      setInvoices((prev) => prev.filter((inv) => !idSet.has(inv.id)));
    } else {
      setInvoices((prev) => prev.filter((inv) => !inv.fileName && !inv.id.startsWith('uploaded-')));
    }
  };

  const handleResetEverything = () => {
    setInvoices([]);
    setSearchQuery('');
    setServiceFilter('all');
    setResetTrigger((prev) => prev + 1);
  };

  const handleClearAllInvoices = () => {
    setShowResetAllModal(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === editingInvoice.id ? editingInvoice : inv))
    );
    setEditingInvoice(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Estrattore Fatture & Pagamenti CSV
              </h1>
              <p className="text-xs text-slate-500">
                Parrocchia Sacro Cuore al Romito &bull; Analisi automatica documenti e cartelle
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              id="btn-toggle-raw-csv"
              onClick={() => setShowRawCsv(!showRawCsv)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
            >
              <Eye className="w-4 h-4 text-slate-500" />
              <span>{showRawCsv ? 'Nascondi CSV' : 'Anteprima CSV'}</span>
            </button>

            <button
              id="btn-download-csv"
              onClick={handleDownloadCsv}
              disabled={invoices.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer"
              title={invoices.length === 0 ? 'Carica una o più fatture per scaricare il file CSV' : 'Scarica file CSV formattato'}
            >
              <Download className="w-4 h-4" />
              <span>Scarica CSV</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Verification & Status Banner */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">
                {invoices.length === 0
                  ? 'Pronto per l\'analisi delle fatture e la generazione del file CSV.'
                  : `${invoices.length} fatture di pagamento gestite per l'esportazione CSV.`}
                {uploadedCount > 0 && invoices.length !== uploadedCount && (
                  <span className="ml-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    +{uploadedCount} da file analizzati
                  </span>
                )}
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Specifiche attive: separatore <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded text-emerald-900">;</code>, campi racchiusi da <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded text-emerald-900">&quot;</code>, data scadenza in formato <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded text-emerald-900">DD/MM/YYYY</code> e decimali con virgola.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center flex-wrap">
            {invoices.length > 0 && (
              <button
                type="button"
                id="btn-clear-all-invoices"
                onClick={handleClearAllInvoices}
                className="text-xs font-semibold text-rose-700 hover:text-rose-950 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs hover:bg-rose-100 transition-colors cursor-pointer"
                title="Azzera tutto: svuota sia la tabella che i file caricati"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                Azzera tutto ({invoices.length})
              </button>
            )}
            <span className="text-xs font-semibold text-emerald-800 bg-white/80 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
              &quot;DATA&quot;;&quot;DESCRIZIONE&quot;;&quot;USCITE&quot;;&quot;ENTRATE&quot;
            </span>
          </div>
        </div>

        {/* Upload Section */}
        <UploadSection
          onInvoicesAdded={handleInvoicesAdded}
          onRemoveInvoice={handleRemoveInvoice}
          onClearUploadedInvoices={handleClearUploadedInvoices}
          onPromptResetAll={() => setShowResetAllModal(true)}
          resetTrigger={resetTrigger}
          existingCount={invoices.length}
          uploadedInvoicesCount={uploadedCount}
        />

        {/* Metrics Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Totale Uscite
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              &euro; {formatItalianDecimal(totalUscite)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {invoices.filter((i) => !i.isIncoming).length} fatture di spesa / pagamento
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Energia Elettrica
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              &euro; {formatItalianDecimal(electricityStats.sum)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {electricityStats.count} bollette elettriche
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Gas Naturale
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              &euro; {formatItalianDecimal(gasStats.sum)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {gasStats.count} bollette gas
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Altre Categorie
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              &euro; {formatItalianDecimal(otherServicesStats.sum)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {otherServicesStats.count} {otherServicesStats.count === 1 ? 'fattura (non luce/gas)' : 'fatture (non luce/gas)'}
            </p>
          </div>
        </div>

        {/* Raw CSV Preview Box (if toggled) */}
        {showRawCsv && (
          <div className="bg-slate-900 text-slate-100 rounded-xl p-5 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">
                  Anteprima Contenuto Raw CSV (fatture.csv)
                </span>
              </div>
              <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded">
                Formato standard: &quot;DATA&quot;;&quot;DESCRIZIONE&quot;;&quot;USCITE&quot;;&quot;ENTRATE&quot;
              </span>
            </div>
            <textarea
              readOnly
              value={csvContent}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="mt-3 w-full bg-slate-950 text-emerald-300/90 font-mono text-xs p-3 rounded-lg border border-slate-800 focus:outline-none h-44 resize-y leading-relaxed"
              title="Fai clic per selezionare tutto il testo"
            />
            <p className="text-[11px] text-slate-400 mt-2">
              Suggerimento: clicca sul riquadro per selezionare tutto il testo e copiarlo con Ctrl+C (o Cmd+C), oppure usa il pulsante &quot;Scarica CSV&quot; in alto a destra.
            </p>
          </div>
        )}

        {/* Filters and Search Bar - Only shown if invoices are present */}
        {invoices.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row gap-4 justify-between md:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca fattura, scadenza, fornitore, importo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Dynamic Service Filter Tabs */}
              <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-100/70 text-xs font-medium">
                <button
                  onClick={() => setServiceFilter('all')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    serviceFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tutte ({invoices.length})
                </button>
                {distinctServices.map((srv) => (
                  <button
                    key={srv}
                    onClick={() => setServiceFilter(srv)}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                      serviceFilter === srv
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {srv.toLowerCase().includes('luce') || srv.toLowerCase().includes('elettrica') ? (
                      <Zap className="w-3 h-3 text-amber-500" />
                    ) : srv.toLowerCase().includes('gas') ? (
                      <Flame className="w-3 h-3 text-sky-500" />
                    ) : (
                      <FileText className="w-3 h-3 text-indigo-500" />
                    )}
                    {srv} ({invoices.filter((i) => i.service === srv).length})
                  </button>
                ))}
              </div>

              {/* Description Format Selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Stile Descrizione:</span>
                <select
                  value={descFormat}
                  onChange={(e) => setDescFormat(e.target.value as DescriptionFormat)}
                  className="bg-white border border-slate-300 text-slate-700 py-1.5 px-2.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="standard">Standard (con Periodo)</option>
                  <option value="detailed">Dettagliata (con POD/PDR)</option>
                  <option value="compact">Compatta</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Elenco Scadenze e Pagamenti da Esportare nel CSV
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {invoices.length > 0
                  ? `Mostrati ${filteredInvoices.length} di ${invoices.length} record • Clicca sulle intestazioni per ordinare`
                  : 'Nessuna riga al momento'}
              </p>
            </div>
            {invoices.length > 0 && (
              <span className="text-xs text-slate-500 italic">
                * Ordinamento: per {sortField === 'dueDate' ? 'Data Scadenza' : sortField === 'amount' ? 'Importo' : 'Numero'} ({sortAsc ? 'crescente' : 'decrescente'})
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th
                    className={`py-3.5 px-4 transition-colors ${invoices.length > 0 ? 'cursor-pointer hover:bg-slate-200/60' : ''}`}
                    onClick={() => {
                      if (invoices.length === 0) return;
                      if (sortField === 'dueDate') {
                        setSortAsc(!sortAsc);
                      } else {
                        setSortField('dueDate');
                        setSortAsc(true);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>DATA (Scadenza)</span>
                      {invoices.length > 0 && <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                    </div>
                  </th>
                  <th className="py-3.5 px-4">DESCRIZIONE</th>
                  <th
                    className={`py-3.5 px-4 text-right transition-colors ${invoices.length > 0 ? 'cursor-pointer hover:bg-slate-200/60' : ''}`}
                    onClick={() => {
                      if (invoices.length === 0) return;
                      if (sortField === 'amount') {
                        setSortAsc(!sortAsc);
                      } else {
                        setSortField('amount');
                        setSortAsc(false);
                      }
                    }}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>USCITE (&euro;)</span>
                      {invoices.length > 0 && <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">ENTRATE</th>
                  <th className="py-3.5 px-4 text-center">SERVIZIO</th>
                  <th className="py-3.5 px-4">FORNITORE & RIFERIMENTI</th>
                  <th className="py-3.5 px-4 text-right">AZIONI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <p className="font-semibold text-slate-700">
                          {invoices.length === 0
                            ? 'Nessuna fattura caricata'
                            : 'Nessuna fattura corrisponde ai criteri di ricerca'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {invoices.length === 0
                            ? 'Trascina i file PDF/XML o carica una cartella di fatture nella sezione in alto per avviare l\'analisi ed esportare il CSV.'
                            : 'Modifica la parola chiave o i filtri di ricerca per visualizzare le fatture.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isElectricity =
                      inv.service.toLowerCase().includes('luce') ||
                      inv.service.toLowerCase().includes('elettrica');
                    const isGas = inv.service.toLowerCase().includes('gas');

                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* DATA (Scadenza) */}
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-xs">
                            {inv.dueDate}
                          </span>
                        </td>

                        {/* DESCRIZIONE */}
                        <td className="py-3 px-4 text-slate-800 max-w-md">
                          <div className="font-medium text-xs sm:text-sm">
                            {formatInvoiceDescription(inv, descFormat)}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                            {inv.invoiceDate && <span>Emessa: {inv.invoiceDate}</span>}
                            {inv.fileName && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded font-mono">
                                <FileText className="w-3 h-3" />
                                {inv.fileName}
                              </span>
                            )}
                            {inv.customerCode && <span>Cliente: {inv.customerCode}</span>}
                          </div>
                        </td>

                        {/* USCITE */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                          {!inv.isIncoming ? `${formatItalianDecimal(inv.amount)} €` : '-'}
                        </td>

                        {/* ENTRATE */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {inv.isIncoming ? `${formatItalianDecimal(inv.amount)} €` : '-'}
                        </td>

                        {/* SERVIZIO */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isElectricity ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Zap className="w-3 h-3 text-amber-500" />
                              Luce
                            </span>
                          ) : isGas ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                              <Flame className="w-3 h-3 text-sky-500" />
                              Gas
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {inv.service}
                            </span>
                          )}
                        </td>

                        {/* FORNITORE & RIFERIMENTI */}
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          <div className="font-semibold text-slate-700">
                            {inv.supplier}
                          </div>
                          {inv.podOrPdr && (
                            <div>
                              <span className="text-slate-500 font-mono">
                                {isElectricity ? 'POD' : isGas ? 'PDR' : 'ID'}: {inv.podOrPdr}
                              </span>
                            </div>
                          )}
                          {inv.pde && (
                            <div className="text-slate-400">
                              PDE: {inv.pde} {inv.consumption ? `| ${inv.consumption}` : ''}
                            </div>
                          )}
                        </td>

                        {/* AZIONI */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingInvoice(inv)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Modifica riga"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(inv.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Elimina riga"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <td className="py-3 px-4" colSpan={2}>
                    TOTALE USCITE ({filteredInvoices.filter((i) => !i.isIncoming).length} fatture di pagamento)
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-rose-700 text-base">
                    {formatItalianDecimal(
                      filteredInvoices.filter((i) => !i.isIncoming).reduce((sum, i) => sum + i.amount, 0)
                    )}{' '}
                    &euro;
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-700">
                    {filteredInvoices.some((i) => i.isIncoming)
                      ? `${formatItalianDecimal(
                          filteredInvoices.filter((i) => i.isIncoming).reduce((sum, i) => sum + i.amount, 0)
                        )} €`
                      : '-'}
                  </td>
                  <td className="py-3 px-4" colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editingInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-indigo-600" />
                  Modifica Dati Fattura
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Data Scadenza (DD/MM/YYYY)*
                    </label>
                    <input
                      type="text"
                      required
                      value={editingInvoice.dueDate}
                      onChange={(e) =>
                        setEditingInvoice({ ...editingInvoice, dueDate: e.target.value })
                      }
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Importo in &euro;*
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingInvoice.amount}
                      onChange={(e) =>
                        setEditingInvoice({
                          ...editingInvoice,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Numero Fattura
                    </label>
                    <input
                      type="text"
                      value={editingInvoice.invoiceNumber}
                      onChange={(e) =>
                        setEditingInvoice({ ...editingInvoice, invoiceNumber: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fornitore
                    </label>
                    <input
                      type="text"
                      value={editingInvoice.supplier}
                      onChange={(e) =>
                        setEditingInvoice({ ...editingInvoice, supplier: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Servizio
                  </label>
                  <input
                    type="text"
                    value={editingInvoice.service}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, service: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Periodo di fatturazione
                  </label>
                  <input
                    type="text"
                    value={editingInvoice.period || ''}
                    onChange={(e) =>
                      setEditingInvoice({ ...editingInvoice, period: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingInvoice(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salva Modifiche
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Custom In-App Modal for Reset Everything */}
        {showResetAllModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Azzerare tutto?</h3>
                  <p className="text-xs text-slate-500">Ripulitura completa della tabella e dei file</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mt-2">
                Confermi di voler azzerare tutto? Verranno rimosse <strong>tutte le {invoices.length} fatture</strong> dalla tabella contabile e verrà azzerata la coda dei file caricati.
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetAllModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  id="btn-confirm-reset-all"
                  onClick={() => {
                    handleResetEverything();
                    setShowResetAllModal(false);
                  }}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Sì, azzera tutto
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Technical notes & CSV format specification guide */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <Info className="w-4 h-4 text-slate-500" />
            <span>Riepilogo Specifiche Tracciato CSV Richiesto</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-bold text-slate-700 block mb-1">1. Colonne Intestazione</span>
              <code className="text-emerald-700 font-mono font-semibold">
                &quot;DATA&quot;;&quot;DESCRIZIONE&quot;;&quot;USCITE&quot;;&quot;ENTRATE&quot;
              </code>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-bold text-slate-700 block mb-1">2. Campo DATA</span>
              <p className="text-slate-600">
                Contiene la <strong>data di scadenza del pagamento</strong> in formato <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">DD/MM/YYYY</code>.
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-bold text-slate-700 block mb-1">3. Valori Decimali</span>
              <p className="text-slate-600">
                Delimitati rigorosamente dalla virgola (es. <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">342,25</code> o <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">1311,67</code>).
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-bold text-slate-700 block mb-1">4. Delimitatori e Virgolette</span>
              <p className="text-slate-600">
                Tutti i campi sono racchiusi tra doppi apici <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">&quot;</code> e separati dal punto e virgola <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">;</code>.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
