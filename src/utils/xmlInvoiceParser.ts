/**
 * High-Precision Italian Electronic Invoice (FatturaPA / SDI) & XML Parser
 * Handles:
 * - FatturaPA XML versions 1.2, 1.2.1, 1.2.2 (B2B, B2C, PA)
 * - XML Namespaces (p:, ns2:, b:, ds:, etc.)
 * - CAdES .xml.p7m signed files extraction
 * - Document types: TD01 (Fattura ordinaria), TD04 (Nota di credito -> Entrata/Rimborso), TD06 (Parcella), etc.
 * - Multi-installment payments (<DettaglioPagamento>)
 * - Multi-line items (<DettaglioLinee>) with period (<PeriodoInizio> - <PeriodoFine>)
 * - Accurate totals (<ImportoTotaleDocumento>, <DatiRiepilogo> imponibile + IVA, <ImportoPagamento>)
 * - Energy/Gas identifiers: POD (Luce) & PDR (Gas) from <AltriDatiGestionali> or description
 * - Supplier (<CedentePrestatore>) and Recipient (<CessionarioCommittente>)
 */

import { XMLParser } from 'fast-xml-parser';

export interface ExtractedInvoiceData {
  invoiceNumber: string;
  invoiceDate: string; // DD/MM/YYYY
  dueDate: string; // DD/MM/YYYY
  hasGenuineDueDate: boolean;
  amount: number;
  supplier: string;
  service: string;
  period: string;
  isIncoming: boolean;
  description: string;
  customerCode: string;
  pde: string;
  podOrPdr: string;
  consumption: string;
  recipient: string;
}

// Convert YYYY-MM-DD (or ISO datetime) to DD/MM/YYYY
export function formatIsoToItalianDate(isoStr?: string): string {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.trim();
  const match = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
  // Check already DD/MM/YYYY
  const itMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (itMatch) {
    return `${itMatch[1].padStart(2, '0')}/${itMatch[2].padStart(2, '0')}/${itMatch[3]}`;
  }
  return clean;
}

// Clean number from XML string (handles "123.45" or "123,45" or "-123.45")
export function parseXmlAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim().replace(/\s+/g, '');
  if (!s) return 0;
  // If format is Italian e.g. "1.234,56"
  if (/^[-+]?\d{1,3}(\.\d{3})*,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Standard format "1234.56" or "1234,56"
  const normalized = s.replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Clean string
function cleanText(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Ensure array helper
function toArray<T>(item: T | T[] | undefined): T[] {
  if (item === undefined || item === null) return [];
  return Array.isArray(item) ? item : [item];
}

/**
 * Extracts raw XML content from a binary or base64 .p7m buffer
 */
export function extractXmlFromP7mBuffer(buffer: Buffer): string | null {
  try {
    const str = buffer.toString('binary');
    
    // Search for XML opening tag
    const xmlDeclMatch = str.search(/<\?xml\b/i);
    const rootTagMatch = str.search(/<([a-zA-Z0-9_-]+:)?FatturaElettronica\b/i);
    
    let startIdx = -1;
    if (xmlDeclMatch !== -1) {
      startIdx = xmlDeclMatch;
    } else if (rootTagMatch !== -1) {
      startIdx = rootTagMatch;
    }
    
    if (startIdx === -1) return null;
    
    // Search for closing tag
    const matchClosing = str.slice(startIdx).match(/<\/([a-zA-Z0-9_-]+:)?FatturaElettronica\s*>/i);
    if (!matchClosing || matchClosing.index === undefined) return null;
    
    const endIdx = startIdx + matchClosing.index + matchClosing[0].length;
    const xmlSubBuffer = buffer.subarray(startIdx, endIdx);
    
    // Check if encoding is declared as Latin1/ISO-8859-1
    const headerSnippet = xmlSubBuffer.subarray(0, 150).toString('latin1');
    if (/encoding=["'](?:iso-8859-1|windows-1252|latin1)["']/i.test(headerSnippet)) {
      return xmlSubBuffer.toString('latin1');
    }
    
    return xmlSubBuffer.toString('utf-8');
  } catch (err) {
    return null;
  }
}

/**
 * Service categorization logic based on text keywords, suppliers, and line descriptions
 */
export function categorizeService(combinedText: string, supplier: string): string {
  const t = (combinedText + ' ' + supplier).toLowerCase();

  // Electricity
  if (
    /luce|energia\s*elettrica|\bkwh\b|f1\s*\/|potenza\s*impegnata|\bpod\b|servizio\s*elettrico\s*nazionale|enel\s*energia.*luce/i.test(t) &&
    !/distribuzione\s*gas|metano|\bsmc\b/i.test(t)
  ) {
    return 'Energia Elettrica';
  }

  // Gas
  if (/gas\s*naturale|gas\s*metano|\bsmc\b|\bpdr\b|distribuzione\s*gas|riscaldamento/i.test(t)) {
    return 'Gas Naturale';
  }

  // Dual fuel check (if contains both, prioritize electricity or gas depending on counts)
  if (/luce|energia\s*elettrica|\bkwh\b/i.test(t)) {
    return 'Energia Elettrica';
  }
  if (/\bgas\b/i.test(t)) {
    return 'Gas Naturale';
  }

  // Telecom / Internet
  if (
    /telefonia|fibra|adsl|connessione\s*internet|linea\s*fissa|canone\s*linea|tim\s*s\.p\.a|telecom|vodafone|wind\s*tre|fastweb|iliad|eolo|fibercop/i.test(t)
  ) {
    return 'Telefonia / Fibra';
  }

  // Water
  if (
    /servizio\s*idrico|acquedotto|fognatura|depurazione|fabbisogno\s*idrico|publiacqua|acque\s*s\.p\.a|acquedotto\s*del\s*fiora/i.test(t)
  ) {
    return 'Servizio Idrico';
  }

  // Waste / TARI
  if (
    /tari|tassa\s*rifiuti|rifiuti|igiene\s*ambientale|alia\s*servizi|smaltimento\s*rifiuti/i.test(t)
  ) {
    return 'TARI / Rifiuti';
  }

  // Maintenance
  if (/manutenzione|riparazione|revisione|caldaia|ascensore|estintor|termoidraul/i.test(t)) {
    return 'Manutenzioni / Riparazioni';
  }

  // Church / Liturgical / Office
  if (/ostie|candele|vino\s*messa|liturgi|arredi\s*sacri|paramenti|cancelleria|stampa/i.test(t)) {
    return 'Spese Parrocchiali / Culto';
  }

  // Insurance
  if (/assicurazion|polizza|premio\s*assicurativo|cattolica\s*assicurazioni/i.test(t)) {
    return 'Assicurazione';
  }

  return 'Fornitura Generica';
}

/**
 * Main parser for Italian FatturaPA XML documents
 */
export function parseFatturaPaXml(
  xmlContent: string,
  fileName: string = 'fattura.xml'
): { success: boolean; data?: ExtractedInvoiceData; allInvoices?: ExtractedInvoiceData[]; error?: string } {
  if (!xmlContent || typeof xmlContent !== 'string') {
    return { success: false, error: 'Contenuto XML vuoto' };
  }

  // Initialize parser with namespace removal
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true, // Strips 'p:', 'b:', 'ns2:', etc.
    trimValues: true,
    parseTagValue: false, // Keep values as raw strings to avoid date/number auto-mangling
  });

  let parsedObj: any;
  try {
    parsedObj = parser.parse(xmlContent);
  } catch (err: any) {
    // If fast-xml-parser encountered strict error, try regex fallback
    return parseFatturaPaWithRegexFallback(xmlContent, fileName);
  }

  // Find root FatturaElettronica
  const root = parsedObj?.FatturaElettronica || parsedObj;
  if (!root || (!root.FatturaElettronicaHeader && !root.FatturaElettronicaBody)) {
    // Might not be standard FatturaPA, try regex fallback
    return parseFatturaPaWithRegexFallback(xmlContent, fileName);
  }

  const header = root.FatturaElettronicaHeader || {};
  const bodies = toArray(root.FatturaElettronicaBody);

  // Extract Supplier (CedentePrestatore)
  const cedente = header.CedentePrestatore || {};
  const cedenteAnag = cedente.DatiAnagrafici?.Anagrafica || {};
  let supplier = cleanText(cedenteAnag.Denominazione);
  if (!supplier) {
    const nome = cleanText(cedenteAnag.Nome);
    const cognome = cleanText(cedenteAnag.Cognome);
    supplier = [nome, cognome].filter(Boolean).join(' ');
  }
  if (!supplier) {
    supplier = cleanText(cedente.DatiAnagrafici?.CodiceFiscale) || 'Fornitore';
  }

  // Extract Recipient (CessionarioCommittente)
  const cessionario = header.CessionarioCommittente || {};
  const cessionarioAnag = cessionario.DatiAnagrafici?.Anagrafica || {};
  let recipient = cleanText(cessionarioAnag.Denominazione);
  if (!recipient) {
    const nome = cleanText(cessionarioAnag.Nome);
    const cognome = cleanText(cessionarioAnag.Cognome);
    recipient = [nome, cognome].filter(Boolean).join(' ');
  }
  if (!recipient) {
    recipient = 'Parrocchia Sacro Cuore al Romito';
  }

  const invoicesResult: ExtractedInvoiceData[] = [];

  for (const body of bodies) {
    const datiGenerali = body.DatiGenerali || {};
    const doc = datiGenerali.DatiGeneraliDocumento || {};

    // 1. Invoice Number
    const invoiceNumber = cleanText(doc.Numero) || fileName.replace(/\.[^/.]+$/, '');

    // 2. Document Type
    const tipoDoc = cleanText(doc.TipoDocumento).toUpperCase(); // e.g. TD01, TD04 (Nota di credito)
    const isNotaDiCredito = tipoDoc === 'TD04';

    // 3. Invoice Date (Data emissione)
    const rawInvoiceDate = cleanText(doc.Data);
    const invoiceDate = formatIsoToItalianDate(rawInvoiceDate);

    // 4. Due Date (Data Scadenza Pagamento)
    let dueDate = '';
    let hasGenuineDueDate = false;
    let paymentAmountsSum = 0;

    const datiPagamentoList = toArray(body.DatiPagamento);
    for (const dp of datiPagamentoList) {
      const dettagli = toArray(dp.DettaglioPagamento);
      for (const dett of dettagli) {
        const rawScad = cleanText(dett.DataScadenzaPagamento);
        if (rawScad && !dueDate) {
          dueDate = formatIsoToItalianDate(rawScad);
          hasGenuineDueDate = true;
        }
        if (dett.ImportoPagamento) {
          paymentAmountsSum += parseXmlAmount(dett.ImportoPagamento);
        }
      }
    }

    // Fallback due date if missing in XML
    if (!dueDate) {
      dueDate = invoiceDate || formatIsoToItalianDate(new Date().toISOString());
    }

    // 5. Total Amount
    let rawAmount = parseXmlAmount(doc.ImportoTotaleDocumento);

    // If ImportoTotaleDocumento is missing or zero, check DatiRiepilogo (Imponibile + Imposta)
    if (!rawAmount && body.DatiBeniServizi) {
      const riepilogoList = toArray(body.DatiBeniServizi.DatiRiepilogo);
      let sumRiepilogo = 0;
      for (const r of riepilogoList) {
        const imp = parseXmlAmount(r.ImponibileImporto);
        const vat = parseXmlAmount(r.Imposta);
        const arr = parseXmlAmount(r.Arrotondamento);
        sumRiepilogo += imp + vat + arr;
      }
      if (sumRiepilogo > 0) {
        rawAmount = sumRiepilogo;
      }
    }

    // If still missing, check payment amounts sum
    if (!rawAmount && paymentAmountsSum > 0) {
      rawAmount = paymentAmountsSum;
    }

    // If still missing, sum of line prices
    if (!rawAmount && body.DatiBeniServizi) {
      const linee = toArray(body.DatiBeniServizi.DettaglioLinee);
      let sumLinee = 0;
      for (const l of linee) {
        sumLinee += parseXmlAmount(l.PrezzoTotale);
      }
      if (sumLinee > 0) {
        rawAmount = sumLinee;
      }
    }

    // Credit Note / Direction detection
    let isIncoming = isNotaDiCredito || rawAmount < 0;
    // Parrocchia check: if Parrocchia is the supplier (Cedente), it's incoming money
    if (supplier.toLowerCase().includes('sacro cuore') || supplier.toLowerCase().includes('parrocchia')) {
      isIncoming = true;
    }

    const finalAmount = Math.abs(rawAmount);

    // 6. Line Items & Description inspection
    const beniServizi = body.DatiBeniServizi || {};
    const linee = toArray(beniServizi.DettaglioLinee);

    const lineDescriptions: string[] = [];
    let period = '';
    let podOrPdr = '';
    let consumption = '';
    let customerCode = '';

    for (const l of linee) {
      const desc = cleanText(l.Descrizione);
      if (desc) lineDescriptions.push(desc);

      // Period from XML tags: PeriodoInizio & PeriodoFine
      if (!period && (l.PeriodoInizio || l.PeriodoFine)) {
        const pIni = formatIsoToItalianDate(cleanText(l.PeriodoInizio));
        const pFin = formatIsoToItalianDate(cleanText(l.PeriodoFine));
        if (pIni && pFin) period = `${pIni} - ${pFin}`;
        else if (pIni) period = `dal ${pIni}`;
        else if (pFin) period = `fino al ${pFin}`;
      }

      // Check AltriDatiGestionali for POD / PDR / Codice Cliente
      const altriDati = toArray(l.AltriDatiGestionali);
      for (const ad of altriDati) {
        const tipo = cleanText(ad.TipoDato).toUpperCase();
        const rif = cleanText(ad.RiferimentoTesto);
        if (tipo === 'POD' || tipo.includes('POD')) {
          if (!podOrPdr) podOrPdr = rif;
        } else if (tipo === 'PDR' || tipo.includes('PDR')) {
          if (!podOrPdr) podOrPdr = rif;
        } else if (tipo === 'CONTRATTO' || tipo === 'CLIENTE' || tipo === 'COD_CLI') {
          if (!customerCode) customerCode = rif;
        }
      }

      // Check CodiceArticolo
      const codici = toArray(l.CodiceArticolo);
      for (const ca of codici) {
        const tipo = cleanText(ca.CodiceTipo).toUpperCase();
        const val = cleanText(ca.CodiceValore);
        if (tipo.includes('POD') || tipo.includes('PDR')) {
          if (!podOrPdr) podOrPdr = val;
        }
      }
    }

    // Check Causale array / string
    const causaleList = toArray(doc.Causale).map(cleanText).filter(Boolean);
    const combinedCausale = causaleList.join(' ');

    // Combined text for deep keyword detection
    const fullTextContext = [
      supplier,
      combinedCausale,
      lineDescriptions.join(' '),
      fileName,
    ].join(' ');

    // Extract POD or PDR from text if not yet found
    if (!podOrPdr) {
      const podMatch = fullTextContext.match(/\b(IT[0-9]{3}E[0-9A-Z]{8,11})\b/i);
      const pdrMatch = fullTextContext.match(/\b(00[0-9]{12})\b/) || fullTextContext.match(/\bpdr[^\d\n\r]*[:=]?\s*([0-9]{14})/i);
      if (podMatch) podOrPdr = podMatch[1].toUpperCase();
      else if (pdrMatch) podOrPdr = pdrMatch[1];
    }

    // Extract Period from text if not yet found
    if (!period) {
      const periodRegex = /(?:periodo|competenza)[^\d\n\r]*[:=]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}\s*(?:al|[-–/]|fino al)\s*[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i;
      const pm = fullTextContext.match(periodRegex);
      if (pm) {
        period = pm[1].trim();
      }
    }

    // Extract Consumption if present (kWh or Smc)
    if (!consumption) {
      const consMatch = fullTextContext.match(/\b([0-9.,]+)\s*(kWh|Smc|mc)\b/i);
      if (consMatch) {
        consumption = `${consMatch[1]} ${consMatch[2]}`;
      }
    }

    // Extract Customer Code from DatiContratto or text
    if (!customerCode && datiGenerali.DatiContratto) {
      const contratti = toArray(datiGenerali.DatiContratto);
      for (const c of contratti) {
        if (c.IdDocumento) {
          customerCode = cleanText(c.IdDocumento);
          break;
        }
      }
    }
    if (!customerCode) {
      const clientMatch = fullTextContext.match(/(?:codice\s*cliente|cliente)[^\d\n\r]*[:=]?\s*([A-Za-z0-9\-_]{5,15})/i);
      if (clientMatch) customerCode = clientMatch[1];
    }

    // Categorize Service
    const service = categorizeService(fullTextContext, supplier);

    // Build standard Italian description
    const docLabel = isIncoming ? 'Nota di Credito' : 'Fattura';
    const descParts = [
      `${docLabel} ${supplier}`,
      `nr. ${invoiceNumber}`,
      invoiceDate ? `del ${invoiceDate}` : '',
      `- ${service}`,
      period ? `(Periodo ${period})` : '',
    ].filter(Boolean);

    const description = descParts.join(' ').replace(/\s{2,}/g, ' ');

    invoicesResult.push({
      invoiceNumber,
      invoiceDate: invoiceDate || dueDate,
      dueDate,
      hasGenuineDueDate,
      amount: finalAmount,
      supplier,
      service,
      period: period || 'N/D',
      isIncoming,
      description,
      customerCode,
      pde: '',
      podOrPdr,
      consumption,
      recipient,
    });
  }

  if (invoicesResult.length === 0) {
    return parseFatturaPaWithRegexFallback(xmlContent, fileName);
  }

  return {
    success: true,
    data: invoicesResult[0],
    allInvoices: invoicesResult,
  };
}

/**
 * Robust Regex Fallback Parser with Full Namespace Tolerance
 * Matches tags like <p:Numero>, <b:Numero>, <Numero>, <ns2:DataScadenzaPagamento>, etc.
 */
export function parseFatturaPaWithRegexFallback(
  xml: string,
  fileName: string
): { success: boolean; data?: ExtractedInvoiceData; error?: string } {
  // Helper to extract content of a tag ignoring any namespace prefix and attributes
  const getTagContent = (tagName: string, src: string): string => {
    const re = new RegExp(`<([a-zA-Z0-9_-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/\\1?${tagName}>`, 'i');
    const m = src.match(re);
    return m ? m[2].trim() : '';
  };

  // Helper to get section
  const getSection = (sectionName: string, src: string): string => {
    const re = new RegExp(`<([a-zA-Z0-9_-]+:)?${sectionName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/\\1?${sectionName}>`, 'i');
    const m = src.match(re);
    return m ? m[2] : src;
  };

  const headerSec = getSection('FatturaElettronicaHeader', xml);
  const cedenteSec = getSection('CedentePrestatore', headerSec);
  const cessionarioSec = getSection('CessionarioCommittente', headerSec);
  const bodySec = getSection('FatturaElettronicaBody', xml);
  const docSec = getSection('DatiGeneraliDocumento', bodySec);
  const pagamSec = getSection('DatiPagamento', bodySec);

  // Supplier
  let supplier = getTagContent('Denominazione', cedenteSec);
  if (!supplier) {
    const nome = getTagContent('Nome', cedenteSec);
    const cognome = getTagContent('Cognome', cedenteSec);
    supplier = [nome, cognome].filter(Boolean).join(' ');
  }
  if (!supplier) supplier = 'Fornitore';

  // Recipient
  let recipient = getTagContent('Denominazione', cessionarioSec) || 'Parrocchia Sacro Cuore al Romito';

  // Number
  const invoiceNumber = getTagContent('Numero', docSec) || fileName.replace(/\.[^/.]+$/, '');

  // Dates
  const rawDate = getTagContent('Data', docSec);
  const invoiceDate = formatIsoToItalianDate(rawDate);

  let dueDate = '';
  let hasGenuineDueDate = false;
  const rawDueDate = getTagContent('DataScadenzaPagamento', pagamSec) || getTagContent('DataScadenza', pagamSec);
  if (rawDueDate) {
    dueDate = formatIsoToItalianDate(rawDueDate);
    hasGenuineDueDate = true;
  } else {
    dueDate = invoiceDate || formatIsoToItalianDate(new Date().toISOString());
  }

  // Amounts
  let amount = parseXmlAmount(getTagContent('ImportoTotaleDocumento', docSec));
  if (!amount) {
    amount = parseXmlAmount(getTagContent('ImportoPagamento', pagamSec));
  }
  if (!amount) {
    amount = parseXmlAmount(getTagContent('ImponibileImporto', bodySec));
  }

  // TipoDocumento
  const tipoDoc = getTagContent('TipoDocumento', docSec).toUpperCase();
  const isIncoming = tipoDoc === 'TD04' || amount < 0;
  amount = Math.abs(amount);

  // POD / PDR
  let podOrPdr = '';
  const podMatch = xml.match(/\b(IT[0-9]{3}E[0-9A-Z]{8,11})\b/i);
  const pdrMatch = xml.match(/\b(00[0-9]{12})\b/) || xml.match(/\bpdr[^\d\n\r]*[:=]?\s*([0-9]{14})/i);
  if (podMatch) podOrPdr = podMatch[1].toUpperCase();
  else if (pdrMatch) podOrPdr = pdrMatch[1];

  // Period
  let period = '';
  const pIni = formatIsoToItalianDate(getTagContent('PeriodoInizio', bodySec));
  const pFin = formatIsoToItalianDate(getTagContent('PeriodoFine', bodySec));
  if (pIni && pFin) period = `${pIni} - ${pFin}`;

  // Service
  const service = categorizeService(xml, supplier);

  const docLabel = isIncoming ? 'Nota di Credito' : 'Fattura';
  const desc = `${docLabel} ${supplier} nr. ${invoiceNumber}${invoiceDate ? ' del ' + invoiceDate : ''} - ${service}${period ? ' (Periodo ' + period + ')' : ''}`;

  return {
    success: true,
    data: {
      invoiceNumber,
      invoiceDate: invoiceDate || dueDate,
      dueDate,
      hasGenuineDueDate,
      amount,
      supplier,
      service,
      period: period || 'N/D',
      isIncoming,
      description: desc,
      customerCode: '',
      pde: '',
      podOrPdr,
      consumption: '',
      recipient,
    },
  };
}
