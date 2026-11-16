(() => {
  const missingValues = new Set(['', '\u2014', '\u2013', 'null', 'undefined']);
  const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric'
  });
  const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });

  function parseUtcTimestamp(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    let text = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00Z`);
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
      text = `${text.replace(' ', 'T')}Z`;
    }
    return new Date(text);
  }

  window.parseUtcTimestamp = parseUtcTimestamp;
  window.formatIndianDateTime = value => {
    if (value == null || missingValues.has(String(value).trim())) return String(value ?? '');
    const text = String(value).trim(), date = parseUtcTimestamp(value);
    if (Number.isNaN(date.getTime())) return text;
    return (/^\d{4}-\d{2}-\d{2}$/.test(text) ? dateFormatter : dateTimeFormatter).format(date);
  };
  window.indianDateKey = value => {
    if (value == null || missingValues.has(String(value).trim())) return '';
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = parseUtcTimestamp(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
})();
