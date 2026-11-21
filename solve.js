// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns
// exactly what csv-reader 1.0.0 returns for {text, header} -> {columns, rows, errors}.
//
// Same reading policy as the reference (vendor/csv-reader/index.js), reimplemented for
// speed: no per-character loop. Unquoted fields are taken with indexOf + slice, quoted
// fields are scanned with indexOf('"') segment by segment, and a line with no quotes
// and no stray CR is split in one go. Every error the reference records is recorded
// here, in the same order, with the same {code, line, row} (and fields/extra for
// short_row/long_row). Pure: nothing is kept from one call to the next.

/** csv-reader 1.0.0's answer for one case's input. */

// Next delimiter among comma, LF, CR (lastIndex is set before every exec).
const DELIM_RE = /[,\n\r]/g;
export function run(input) {
  const raw = input.text;
  const text = typeof raw === 'string' ? raw : String(raw);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Scratch: the result of the last field read. fEnded: 0 = comma, 1 = line break, 2 = end of text.
  let fValue = '';
  let fEnded = 0;
  let fAdded = 0;

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `prefix` up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). fAdded counts the characters kept in this call.
  // One native regex scan finds the next delimiter among comma, LF and CR.
  function readUnquoted(prefix) {
    let value = prefix;
    let added = 0;
    for (;;) {
      DELIM_RE.lastIndex = pos;
      const m = DELIM_RE.exec(text);
      if (m === null) {
        value += text.slice(pos);
        added += len - pos;
        pos = len;
        fValue = value; fEnded = 2; fAdded = added;
        return;
      }
      const idx = m.index;
      const c = text.charCodeAt(idx);
      if (c === 44) {
        value += text.slice(pos, idx);
        added += idx - pos;
        pos = idx + 1;
        fValue = value; fEnded = 0; fAdded = added;
        return;
      }
      if (c === 10) {
        // No CR can sit before this LF: the regex would have matched it first.
        value += text.slice(pos, idx);
        added += idx - pos;
        pos = idx + 1;
        line += 1;
        fValue = value; fEnded = 1; fAdded = added;
        return;
      }
      // c === 13 (CR)
      if (text.charCodeAt(idx + 1) === 10) {
        value += text.slice(pos, idx);
        added += idx - pos;
        pos = idx + 2;
        line += 1;
        fValue = value; fEnded = 1; fAdded = added;
        return;
      }
      value += text.slice(pos, idx);
      added += idx - pos;
      err('stray_cr');
      pos = idx + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    for (;;) {
      const iQ = text.indexOf('"', pos);
      if (iQ === -1) break;
      // Append [pos, iQ): CRLF and lone CR inside quotes each read as one LF.
      const span = text.slice(pos, iQ);
      const hasNl = span.indexOf('\n') !== -1;
      const hasCr = span.indexOf('\r') !== -1;
      if (!hasNl && !hasCr) {
        value += span;
      } else {
        let breaks = 0;
        let p = span.indexOf('\n', 0);
        while (p !== -1) { breaks += 1; p = span.indexOf('\n', p + 1); }
        p = span.indexOf('\r', 0);
        while (p !== -1) { breaks += 1; p = span.indexOf('\r', p + 1); }
        p = span.indexOf('\r\n', 0);
        while (p !== -1) { breaks -= 1; p = span.indexOf('\r\n', p + 2); }
        line += breaks;
        value += span.replace(/\r\n?|\n/g, '\n');
      }
      if (text.charCodeAt(iQ + 1) === 34) {
        value += '"';
        pos = iQ + 2;
        continue;
      }
      pos = iQ + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is
      // read again as unquoted.
      pos = open + 1;
      line = openLine;
      err('unterminated_quote');
      readUnquoted('"');
      return;
    }
    if (pos >= len) { fValue = value; fEnded = 2; fAdded = 0; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = 0; fAdded = 0; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = 1; fAdded = 0; return; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fValue = value; fEnded = 1; fAdded = 0; return; }
    // What follows the closing quote is appended as it stands, up to the next comma
    // or line break.
    readUnquoted(value);
    if (fAdded > 0) err('quote_junk');
  }

  // Finishes one record: header, or a row padded/cut to the first record's width.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: this line holds no quote and no stray CR, so the record is the
    // line's comma-split, ending at its line break (or at the end of the text).
    const iNl = text.indexOf('\n', pos);
    const hasNl = iNl !== -1;
    let lineEnd = hasNl ? iNl : len;
    if (hasNl && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) lineEnd -= 1;
    const seg = text.slice(pos, lineEnd);
    if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
      if (seg.length === 0) {
        // An empty line: no record.
        pos = hasNl ? iNl + 1 : len;
        line += 1;
        continue;
      }
      finishRecord(seg.split(','));
      pos = hasNl ? iNl + 1 : len;
      line += 1;
      continue;
    }

    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === 0);

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
