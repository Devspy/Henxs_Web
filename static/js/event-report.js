(() => {
  const value = (...items) => items.find(item => item !== undefined && item !== null && item !== '') ?? '—';
  const escapeHtml = input => String(input ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const safeName = input => String(input || 'event').trim().replace(/[^a-z0-9_-]+/gi, '_');
  function wrapText(context, text, x, y, width, lineHeight, maxLines = 3) {
    const words = String(text ?? '—').split(/\s+/);
    let line = '', lines = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1].slice(0, Math.max(0, shown[maxLines - 1].length - 3))}...`;
    shown.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
    return shown.length;
  }
  function pdfFromJpeg(jpeg, width, height) {
    const encoder = new TextEncoder(), parts = [], offsets = [0]; let length = 0;
    const append = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; parts.push(bytes); length += bytes.length; };
    append('%PDF-1.4\n');
    const object = (number, body) => { offsets[number] = length; append(`${number} 0 obj\n${body}\nendobj\n`); };
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Report 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = length;
    append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    append(jpeg); append('\nendstream\nendobj\n');
    const stream = 'q\n612 0 0 792 0 0 cm\n/Report Do\nQ\n';
    object(5, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
    const xref = length;
    append(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const pdf = new Uint8Array(length); let cursor = 0;
    for (const part of parts) { pdf.set(part, cursor); cursor += part.length; }
    return new Blob([pdf], { type: 'application/pdf' });
  }
  async function createPdf(event, operator, moduleName) {
    const raw = event.raw || event, category = moduleName || event.module || value(raw.event_type, raw.type, raw.module);
    const canvas = document.createElement('canvas'); canvas.width = 1224; canvas.height = 1584;
    const context = canvas.getContext('2d'); context.fillStyle = '#f3f6fb'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#102b55'; context.fillRect(0, 0, canvas.width, 205);
    context.fillStyle = '#9fc7ff'; context.font = 'bold 24px Arial'; context.fillText('CIVIC SURVEILLANCE', 82, 66);
    context.fillStyle = '#ffffff'; context.font = 'bold 47px Arial'; context.fillText('NEW TASK ASSIGNMENT', 82, 126);
    context.fillStyle = '#d9e8ff'; context.font = '24px Arial'; context.fillText(`${category}  |  Event ${event.id || value(raw.id, raw.event_id)}`, 82, 172);
    context.fillStyle = '#17365f'; context.font = 'bold 25px Arial'; context.fillText('ASSIGNED TO', 82, 267);
    context.fillStyle = '#ffffff'; context.fillRect(70, 287, 1084, 93);
    context.strokeStyle = '#d6e0ed'; context.strokeRect(70, 287, 1084, 93);
    context.fillStyle = '#1a365f'; context.font = 'bold 30px Arial'; context.fillText(operator.name || 'Operator', 96, 346);
    const latitude = Number.parseFloat(value(raw.latitude, raw.lat, raw.langitude, raw.location_latitude));
    const longitude = Number.parseFloat(value(raw.longitude, raw.lng, raw.lon, raw.longitute, raw.location_longitude));
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const fields = [
      ['Event ID', event.id || value(raw.id, raw.event_id)], ['Event Type', category],
      ['Vehicle', event.vehicle || value(raw.vehicle_no, raw.vehicle_number, raw.vehicle)], ['Camera', event.camera || value(raw.camera_id, raw.camera)],
      ['Location', event.location || value(raw.location, raw.address, raw.place)], ['Zone', event.zone || value(raw.zone, raw.zone_name)],
      ['Severity', event.severity || value(raw.severity, raw.level)], ['Detected On', event.detected || value(raw.event_time, raw.detected_at, raw.created_at, raw.timestamp)],
      ['Confidence', event.confidence || value(raw.confidence, raw.score)], ...(hasCoordinates ? [['Coordinates', `${latitude}, ${longitude}`]] : [])
    ];
    const left = 70, top = 418, gap = 20, cellW = 532, cellH = 126;
    fields.forEach(([label, text], index) => {
      const col = index % 2, row = Math.floor(index / 2), x = left + col * (cellW + gap), y = top + row * (cellH + gap);
      context.fillStyle = '#ffffff'; context.fillRect(x, y, cellW, cellH); context.strokeStyle = '#d6e0ed'; context.strokeRect(x, y, cellW, cellH);
      context.fillStyle = '#59718f'; context.font = 'bold 18px Arial'; context.fillText(label.toUpperCase(), x + 22, y + 34);
      context.fillStyle = '#18345b'; context.font = '23px Arial'; wrapText(context, label==='Detected On'?formatIndianDateTime(text):text, x + 22, y + 72, cellW - 44, 29, 2);
    });
    const imageSource = event.image || value(raw.image_base64, raw.base64_image, raw.image, raw.image_data, raw.photo);
    const imageTop = top + Math.ceil(fields.length / 2) * (cellH + gap) + 12;
    context.fillStyle = '#17365f'; context.font = 'bold 25px Arial'; context.fillText('EVENT PHOTO', 82, imageTop + 28);
    context.fillStyle = '#ffffff'; context.fillRect(70, imageTop + 49, 1084, 300); context.strokeStyle = '#d6e0ed'; context.strokeRect(70, imageTop + 49, 1084, 300);
    let src = imageSource;
    if (typeof src === 'string' && src !== '—' && !/^(data:image\/|https?:\/\/)/i.test(src)) {
      const mime = value(raw.image_mime_type, raw.mime_type); src = `data:${String(mime).startsWith('image/') ? mime : 'image/jpeg'};base64,${src}`;
    }
    if (src && src !== '—') {
      try {
        const image = new Image(); if (!src.startsWith('data:')) image.crossOrigin = 'anonymous'; image.src = src;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        const scale = Math.min(1036 / image.naturalWidth, 252 / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale;
        context.drawImage(image, 94 + (1036 - width) / 2, imageTop + 73 + (252 - height) / 2, width, height);
      } catch { context.fillStyle = '#7185a2'; context.font = '22px Arial'; context.fillText('Event photo unavailable', 100, imageTop + 244); }
    } else { context.fillStyle = '#7185a2'; context.font = '22px Arial'; context.fillText('No event photo available', 100, imageTop + 244); }
    context.fillStyle = '#73839a'; context.font = '18px Arial'; context.fillText('Generated by CIVIC SURVEILLANCE', 82, 1535);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not create the event PDF.')), 'image/jpeg', .92));
    const jpeg = new Uint8Array(await blob.arrayBuffer()); return pdfFromJpeg(jpeg, canvas.width, canvas.height);
  }
  function buildEmail(event, operator, moduleName) {
    const raw = event.raw || event, category = moduleName || event.module || value(raw.event_type, raw.type, raw.module);
    const latitude = Number.parseFloat(value(raw.latitude, raw.lat, raw.langitude, raw.location_latitude));
    const longitude = Number.parseFloat(value(raw.longitude, raw.lng, raw.lon, raw.longitute, raw.location_longitude));
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const mapUrl = hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}` : '';
    const details = [
      ['Event ID', event.id || value(raw.id, raw.event_id)], ['Type', category],
      ['Vehicle', event.vehicle || value(raw.vehicle_no, raw.vehicle_number, raw.vehicle)],
      ['Location', event.location || value(raw.location, raw.address, raw.place)],
      ['Zone', event.zone || value(raw.zone, raw.zone_name)], ['Severity', event.severity || value(raw.severity, raw.level)],
      ['Detected', event.detected || value(raw.event_time, raw.detected_at, raw.created_at, raw.timestamp)]
    ];
    if (hasCoordinates) details.push(['Coordinates', `${latitude}, ${longitude}`]);
    const rows = details.map(([label, text]) => { text=label==='Detected'?formatIndianDateTime(text):text; const content=label==='Location'&&mapUrl?`${escapeHtml(text)}<br><a href="${mapUrl}" style="display:inline-block;margin-top:5px;color:#1765d3;font-weight:700">Open location in Google Maps</a>`:escapeHtml(text); return `<tr><td style="padding:9px 12px;color:#5a6e88;border-bottom:1px solid #e4ebf3;font-weight:600">${escapeHtml(label)}</td><td style="padding:9px 12px;color:#16335d;border-bottom:1px solid #e4ebf3">${content}</td></tr>`; }).join('');
    const subject = `New ${category} task assigned - Event ${event.id || value(raw.id, raw.event_id)}`;
    const message = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#19365f;line-height:1.5"><div style="padding:20px 24px;background:#102b55;color:#fff;border-radius:12px 12px 0 0"><div style="font-size:12px;letter-spacing:1px;color:#b8d4fb">CIVIC SURVEILLANCE</div><h2 style="margin:8px 0 0;font-size:22px">A new task has been assigned to you</h2></div><div style="padding:22px 24px;border:1px solid #dce5f0;border-top:0;border-radius:0 0 12px 12px;background:#fff"><p>Hello <strong>${escapeHtml(operator.name || 'there')}</strong>,</p><p>You have been assigned a new <strong>${escapeHtml(category)}</strong> event. Please review the attached event report and follow up on the task.</p><table style="width:100%;border-collapse:collapse;background:#f8fafd">${rows}</table><p style="margin:18px 0 0;color:#64758c;font-size:13px">The event details are attached as a PDF for your reference.</p></div></div>`;
    return { subject, message, filename: `${safeName(event.id || raw.id)}-event-report.pdf` };
  }
  window.EventAssignmentMail = { createPdf, buildEmail };
})();
