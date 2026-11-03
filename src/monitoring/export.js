// Phase 5 — CSV Export/Import for Groundwater Monitoring.

export const CSV_HEADERS = [
  'id',
  'measuredAt',
  'waterLevelDepth',
  'referencePoint',
  'referenceElevation',
  'method',
  'status',
  'notes',
  'createdAt',
  'updatedAt',
];

export const CSV_HEADER_LABELS = {
  id: 'ID',
  measuredAt: 'Measurement Date & Time (ISO 8601)',
  waterLevelDepth: 'Water Level Depth (m)',
  referencePoint: 'Reference Point (top_of_casing / ground_level / custom)',
  referenceElevation: 'Reference Elevation (m; optional)',
  method: 'Method (electric / manual / pressure_transducer / logger / other)',
  status: 'Status (valid / invalid)',
  notes: 'Notes',
  createdAt: 'Created At (ISO 8601)',
  updatedAt: 'Updated At (ISO 8601)',
};

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportToCsv(measurements) {
  const rows = [CSV_HEADERS.map(h => CSV_HEADER_LABELS[h] || h).join(',')];
  for (const m of measurements || []) {
    const row = CSV_HEADERS.map(h => escapeCsvValue(m[h]));
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

export function downloadCsv(measurements, filename = 'groundwater_monitoring.csv') {
  const csv = exportToCsv(measurements);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { measurements: [], errors: ['File CSV kosong atau hanya header.'] };

  // Detect header row
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map(h => h.trim());
  
  // Map header labels to field names
  const fieldMap = {};
  for (let i = 0; i < headers.length; i++) {
    const label = headers[i];
    // Try to match by label
    const matchedEntry = Object.entries(CSV_HEADER_LABELS).find(([key, lbl]) => lbl === label);
    if (matchedEntry) {
      fieldMap[i] = matchedEntry[0];
    } else if (CSV_HEADERS.includes(label)) {
      fieldMap[i] = label;
    }
  }

  const measurements = [];
  const errors = [];
  const seenIds = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    
    const m = {};
    let hasData = false;
    for (let j = 0; j < values.length; j++) {
      const field = fieldMap[j];
      if (!field) continue;
      const val = values[j].trim();
      if (val !== '') hasData = true;
      m[field] = val;
    }
    
    if (!hasData) continue;

    // Validate required fields
    const rowErrors = [];
    const rowNum = i + 1;

    // ID
    if (!m.id) {
      m.id = `mon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    } else if (seenIds.has(m.id)) {
      rowErrors.push(`Baris ${rowNum}: ID duplikat "${m.id}"`);
      m.id = `mon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    seenIds.add(m.id);

    // measuredAt
    if (!m.measuredAt || isNaN(Date.parse(m.measuredAt))) {
      rowErrors.push(`Baris ${rowNum}: measuredAt tidak valid atau kosong`);
      m.measuredAt = new Date().toISOString();
    }

    // waterLevelDepth
    const depth = Number(m.waterLevelDepth);
    if (!Number.isFinite(depth)) {
      rowErrors.push(`Baris ${rowNum}: waterLevelDepth tidak valid (harus angka)`);
      m.waterLevelDepth = 0;
    } else {
      m.waterLevelDepth = depth;
    }

    // referencePoint
    const validRefPoints = ['top_of_casing', 'ground_level', 'custom'];
    if (!m.referencePoint || !validRefPoints.includes(m.referencePoint)) {
      rowErrors.push(`Baris ${rowNum}: referencePoint tidak valid, gunakan top_of_casing|ground_level|custom`);
      m.referencePoint = 'top_of_casing';
    }

    // referenceElevation
    if (m.referenceElevation !== undefined && m.referenceElevation !== '') {
      const elev = Number(m.referenceElevation);
      if (!Number.isFinite(elev)) {
        rowErrors.push(`Baris ${rowNum}: referenceElevation tidak valid`);
        m.referenceElevation = null;
      } else {
        m.referenceElevation = elev;
      }
    } else {
      m.referenceElevation = null;
    }

    // method
    const validMethods = ['electric_water_level_meter', 'manual_water_level_meter', 'pressure_transducer', 'automatic_data_logger', 'other', 'electric', 'manual', 'pressure', 'logger'];
    if (!m.method || !validMethods.includes(m.method)) {
      rowErrors.push(`Baris ${rowNum}: method tidak valid`);
      m.method = 'electric_water_level_meter';
    }
    // Normalize short method names to full names
    const methodMap = {
      'electric': 'electric_water_level_meter',
      'manual': 'manual_water_level_meter',
      'pressure': 'pressure_transducer',
      'logger': 'automatic_data_logger',
    };
    if (methodMap[m.method]) m.method = methodMap[m.method];

    // status
    if (!m.status || !['valid', 'invalid'].includes(m.status)) {
      m.status = 'valid';
    }

    // notes
    m.notes = m.notes || '';

    // createdAt
    if (!m.createdAt || isNaN(Date.parse(m.createdAt))) {
      m.createdAt = m.measuredAt;
    }

    // updatedAt
    if (!m.updatedAt || isNaN(Date.parse(m.updatedAt))) {
      m.updatedAt = m.measuredAt;
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    }

    measurements.push(m);
  }

  return { measurements, errors };
}

export function previewImport(csvText) {
  const { measurements, errors } = parseCsv(csvText);
  return {
    validCount: measurements.length,
    errorCount: errors.length,
    errors: errors.slice(0, 20), // Limit preview errors
    sample: measurements.slice(0, 5),
  };
}