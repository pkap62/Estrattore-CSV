import { InvoiceRecord } from '../types';

export type DescriptionFormat = 'standard' | 'detailed' | 'compact';

export function formatInvoiceDescription(
  inv: InvoiceRecord,
  format: DescriptionFormat = 'standard',
  includeSplitNote: boolean = true
): string {
  let baseDesc = '';
  switch (format) {
    case 'detailed':
      baseDesc = `Fattura ${inv.supplier || 'Fornitore'} n. ${inv.invoiceNumber} del ${inv.invoiceDate || inv.dueDate} - ${inv.service || 'Servizio'}${inv.period ? ' (Periodo: ' + inv.period + ')' : ''}${inv.podOrPdr ? ' - POD/PDR: ' + inv.podOrPdr : ''}${inv.pde ? ' - PDE: ' + inv.pde : ''}`;
      break;
    case 'compact':
      baseDesc = `${inv.supplier || 'Fornitore'} - ${inv.service || 'Spesa'} - Fatt. ${inv.invoiceNumber}`;
      break;
    case 'standard':
    default:
      baseDesc = `Fattura ${inv.supplier || 'Fornitore'} nr. ${inv.invoiceNumber} del ${inv.invoiceDate || inv.dueDate} - ${inv.service || 'Fornitura'}${inv.period ? ' (Periodo ' + inv.period + ')' : ''}`;
      break;
  }

  if (includeSplitNote && inv.splitRatio && inv.splitRatio < 1) {
    const pct = Math.round(inv.splitRatio * 100);
    const orig = inv.originalAmount ? ` - Tot. doc. € ${formatItalianDecimal(inv.originalAmount)}` : '';
    baseDesc += ` (Quota ${pct}%${orig})`;
  }

  return baseDesc;
}

export function formatItalianDecimal(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function generateCsvString(
  invoices: InvoiceRecord[],
  descriptionFormat: DescriptionFormat = 'standard',
  includeSplitNote: boolean = true
): string {
  const header = `"DATA";"DESCRIZIONE";"USCITE";"ENTRATE"`;

  const rows = invoices.map((inv) => {
    const dataField = `"${inv.dueDate}"`;
    const descField = `"${formatInvoiceDescription(inv, descriptionFormat, includeSplitNote).replace(/"/g, '""')}"`;
    const usciteField = inv.isIncoming ? `""` : `"${formatItalianDecimal(inv.amount)}"`;
    const entrateField = inv.isIncoming ? `"${formatItalianDecimal(inv.amount)}"` : `""`;
    return `${dataField};${descField};${usciteField};${entrateField}`;
  });

  return [header, ...rows].join('\r\n');
}

export function downloadCsvFile(
  csvContent: string,
  filename: string = 'fatture.csv'
): void {
  // UTF-8 BOM so Excel opens Italian accents and decimal characters properly
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
