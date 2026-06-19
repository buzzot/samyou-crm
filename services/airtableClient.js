const BASE_URL = 'https://api.airtable.com/v0';

function getAuthHeader() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token || token.startsWith('patXXXX')) {
    throw new Error(
      'AIRTABLE_TOKEN is not set. Add a real Airtable Personal Access Token to your .env file.'
    );
  }
  return { Authorization: `Bearer ${token}` };
}

function baseId() {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error('AIRTABLE_BASE_ID is not set in .env');
  return id;
}

/**
 * Fetch every record in a table, paginating as needed.
 * Returns records with fields keyed by field ID (stable even if a column
 * label changes in Airtable).
 */
async function listAllRecords(tableId, { filterByFormula } = {}) {
  const records = [];
  let offset;

  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true', pageSize: '100' });
    if (offset) params.set('offset', offset);
    if (filterByFormula) params.set('filterByFormula', filterByFormula);

    const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}?${params.toString()}`, {
      headers: getAuthHeader()
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable list error (${res.status}) on ${tableId}: ${text}`);
    }

    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

async function getRecord(tableId, recordId) {
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' });
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}/${recordId}?${params.toString()}`, {
    headers: getAuthHeader()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable get error (${res.status}) on ${tableId}/${recordId}: ${text}`);
  }
  return res.json();
}

async function updateRecord(tableId, recordId, fieldsById) {
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}/${recordId}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsById, returnFieldsByFieldId: true })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update error (${res.status}) on ${tableId}/${recordId}: ${text}`);
  }
  return res.json();
}

async function createRecord(tableId, fieldsById) {
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsById, returnFieldsByFieldId: true })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable create error (${res.status}) on ${tableId}: ${text}`);
  }
  return res.json();
}

/**
 * Uploads a binary file directly onto an attachment field of an existing
 * record, via Airtable's content API (separate host from the regular data
 * API). The file is appended to whatever attachments are already on the
 * field — it does not replace them.
 */
async function uploadAttachment(recordId, fieldId, { filename, contentType, base64 }) {
  const res = await fetch(`https://content.airtable.com/v0/${baseId()}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, file: base64, filename })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable upload error (${res.status}) on ${recordId}/${fieldId}: ${text}`);
  }
  return res.json();
}

module.exports = { listAllRecords, getRecord, updateRecord, createRecord, uploadAttachment };
