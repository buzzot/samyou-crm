const client = require('./airtableClient');
const schema = require('../config/schema');

const T = schema.tables;

function pick(fields, map) {
  const out = {};
  for (const [key, fieldId] of Object.entries(map)) {
    out[key] = fields[fieldId] !== undefined ? fields[fieldId] : null;
  }
  return out;
}

/**
 * Normalizes an Airtable collaborator field value (singleCollaborator is a
 * single {id,name,email} object; multipleCollaborators is an array of
 * those) into a flat array of {id,name,email}.
 */
function collaborators(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function ownerEmails(owners) {
  return owners.map((o) => (o.email || '').toLowerCase()).filter(Boolean);
}

function mapCompany(rec) {
  const f = pick(rec.fields, T.company.fields);
  const owners = collaborators(f.owner);
  return {
    id: rec.id,
    name: f.name,
    industry: f.industry,
    status: f.status,
    web: f.web,
    billingAddress: f.billingAddress,
    notes: f.notes,
    logo: (f.logo || [])[0]?.url || null,
    personIds: f.person || [],
    activityIds: f.activities || [],
    dealIds: f.deals || [],
    projectIds: f.projects || [],
    owners,
    ownerEmails: ownerEmails(owners)
  };
}

function mapContact(rec) {
  const f = pick(rec.fields, T.contacts.fields);
  return {
    id: rec.id,
    firstName: f.firstName,
    lastName: f.lastName,
    fullName: [f.firstName, f.lastName].filter(Boolean).join(' '),
    title: f.title,
    phone: f.phone,
    email: f.email,
    status: f.status,
    notes: f.notes,
    companyIds: f.company || [],
    dealIds: f.deals || [],
    activityIds: f.activities || []
  };
}

function mapActivity(rec) {
  const f = pick(rec.fields, T.activities.fields);
  const owners = collaborators(f.owner);
  return {
    id: rec.id,
    name: f.name,
    date: f.date,
    type: f.type,
    details: f.details,
    regarding: f.regarding,
    remind: !!f.remind,
    result: f.result,
    files: f.file || [],
    companyIds: f.company || [],
    attendeeIds: f.attendee || [],
    projectIds: f.project || [],
    dealIds: f.deal || [],
    emailSubject: f.emailSubject || null,
    emailDate: f.emailDate || null,
    emailMessageId: f.emailMessageId || null,
    owners,
    ownerEmails: ownerEmails(owners)
  };
}

function mapDeal(rec) {
  const f = pick(rec.fields, T.deals.fields);
  const owners = collaborators(f.owner);
  return {
    id: rec.id,
    name: f.name,
    stage: f.stage,
    amount: f.amount,
    probability: f.probability,
    closeDate: f.closeDate,
    createdDate: f.createdDate,
    companyIds: f.company || [],
    primaryContactIds: f.primaryContact || [],
    projectIds: f.projects || [],
    productIds: f.products || [],
    owners,
    ownerEmails: ownerEmails(owners)
  };
}

function mapProject(rec) {
  const f = pick(rec.fields, T.projects.fields);
  return {
    id: rec.id,
    name: f.name,
    status: f.status,
    category: f.category,
    description: f.description,
    startDate: f.startDate,
    endDate: f.endDate,
    companyIds: f.relatedCompany || [],
    productIds: f.relatedProduct || [],
    activityIds: f.projectActivities || [],
    attachments: f.attachments || [],
    createdAt: rec.createdTime || null
  };
}

function mapProduct(rec) {
  const f = pick(rec.fields, T.products.fields);
  return {
    id: rec.id,
    name: f.name,
    notes: f.notes,
    category: f.category,
    phase: f.phase,
    datasheet: f.datasheet || [],
    image: f.image || [],
    projectIds: f.projects || [],
    inputVoltage: f.inputVoltage,
    boardSize: f.boardSize,
    horsePower: f.horsePower,
    maxInputPower: f.maxInputPower,
    maxInputCurrent: f.maxInputCurrent,
    maxOutputCurrent: f.maxOutputCurrent
  };
}

function mapProjectActivity(rec) {
  const f = pick(rec.fields, T.projectActivities.fields);
  const owners = collaborators(f.owner);
  const assignees = collaborators(f.assigned);
  return {
    id: rec.id,
    name: f.name,
    date: f.date,
    type: f.type,
    details: f.details,
    deadline: f.deadline,
    status: f.status,
    createdAt: rec.createdTime || null,
    projectIds: f.project || [],
    recordIds: f.records || [],
    attachments: f.attachments || [],
    emailSubject: f.emailSubject || null,
    emailDate: f.emailDate || null,
    emailMessageId: f.emailMessageId || null,
    owners,
    ownerEmails: ownerEmails(owners),
    assignees,
    assigneeEmails: ownerEmails(assignees)
  };
}

/**
 * A "sub-subtask" record from the Project Activity Records table — a
 * lightweight log entry (progress update, issue, decision, etc.) attached
 * to a Project Activity (task), with its own optional file attachment.
 */
function mapProjectActivityRecord(rec) {
  const f = pick(rec.fields, T.projectActivityRecords.fields);
  const recordedBy = f.recordedBy || null;
  return {
    id: rec.id,
    name: f.name,
    taskIds: f.projectActivity || [],
    dateRecorded: f.dateRecorded,
    details: f.details,
    category: f.category,
    attachments: f.attachment || [],
    recordedByName: recordedBy ? recordedBy.name || recordedBy.email : null,
    createdAt: rec.createdTime || null
  };
}

function mapTaskComment(rec) {
  const f = pick(rec.fields, T.taskComments.fields);
  return {
    id: rec.id,
    comment: f.comment,
    author: f.author,
    link: f.link,
    taskIds: f.task || [],
    activityIds: f.activity || [],
    dealIds: f.deal || [],
    contactIds: f.contact || [],
    projectIds: f.project || [],
    attachments: f.attachment || [],
    // Use Airtable's own record-creation timestamp (always a reliable UTC
    // ISO 8601 string) rather than the "postedAt" formula field, which only
    // returns locale-formatted text in the base's display timezone with no
    // offset — that text was being mis-parsed as the server's local time,
    // producing wrong "Xm/h/d ago" results.
    postedAt: rec.createdTime || f.postedAt
  };
}

// ---- list/get helpers ----

async function listCompanies() {
  const recs = await client.listAllRecords(T.company.id);
  return recs.map(mapCompany).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function getCompany(id) {
  const rec = await client.getRecord(T.company.id, id);
  return mapCompany(rec);
}

async function createCompany({ name, industry, status, web, billingAddress, notes }) {
  if (!name || !name.trim()) throw new Error('Company name is required.');
  const fields = {
    [T.company.fields.name]: name.trim()
  };
  if (industry) fields[T.company.fields.industry] = industry;
  if (status) fields[T.company.fields.status] = status;
  if (web) fields[T.company.fields.web] = web;
  if (billingAddress) fields[T.company.fields.billingAddress] = billingAddress;
  if (notes) fields[T.company.fields.notes] = notes;

  const rec = await client.createRecord(T.company.id, fields);
  return mapCompany(rec);
}

async function listContacts() {
  const recs = await client.listAllRecords(T.contacts.id);
  return recs.map(mapContact);
}

async function createContact({ firstName, lastName, companyId, title, phone, email, status, notes }) {
  if (!firstName || !firstName.trim()) throw new Error('First name is required.');
  const fields = {
    [T.contacts.fields.firstName]: firstName.trim()
  };
  if (lastName) fields[T.contacts.fields.lastName] = lastName.trim();
  if (companyId) fields[T.contacts.fields.company] = [companyId];
  if (title) fields[T.contacts.fields.title] = title;
  if (phone) fields[T.contacts.fields.phone] = phone;
  if (email) fields[T.contacts.fields.email] = email;
  if (status) fields[T.contacts.fields.status] = status;
  if (notes) fields[T.contacts.fields.notes] = notes;

  const rec = await client.createRecord(T.contacts.id, fields);
  return mapContact(rec);
}

async function getContact(id) {
  const rec = await client.getRecord(T.contacts.id, id);
  return mapContact(rec);
}

async function listActivities() {
  const recs = await client.listAllRecords(T.activities.id);
  return recs.map(mapActivity);
}

async function getActivity(id) {
  const rec = await client.getRecord(T.activities.id, id);
  const activity = mapActivity(rec);
  if (activity.projectIds.length) {
    const projects = await listProjects();
    const projectById = new Map(projects.map((p) => [p.id, p]));
    activity.projectNames = activity.projectIds.map((pid) => projectById.get(pid)?.name).filter(Boolean);
  } else {
    activity.projectNames = [];
  }
  if (activity.companyIds.length) {
    const companies = await listCompanies();
    const companyById = new Map(companies.map((c) => [c.id, c]));
    activity.companyNames = activity.companyIds.map((cid) => companyById.get(cid)?.name).filter(Boolean);
  } else {
    activity.companyNames = [];
  }
  return activity;
}

async function createActivity({ name, companyId, dealId, type, date, details, regarding, result, attendeeIds, projectIds }) {
  if (!name || !name.trim()) throw new Error('Activity name is required.');
  const fields = {
    [T.activities.fields.name]: name.trim()
  };
  if (companyId) fields[T.activities.fields.company] = [companyId];
  if (dealId) fields[T.activities.fields.deal] = [dealId];
  if (type) fields[T.activities.fields.type] = type;
  if (date) fields[T.activities.fields.date] = date;
  if (details) fields[T.activities.fields.details] = details;
  if (regarding) {
    // "Regarding" is an Airtable dateTime field. The form sends a
    // datetime-local value like "2026-06-17T14:30" (no seconds, no
    // timezone) — pad it with seconds so Airtable parses it as a full
    // ISO 8601 timestamp instead of rejecting it.
    fields[T.activities.fields.regarding] = regarding.length === 16 ? `${regarding}:00` : regarding;
  }
  if (result) fields[T.activities.fields.result] = result;
  if (attendeeIds && attendeeIds.length) fields[T.activities.fields.attendee] = attendeeIds;
  if (projectIds && projectIds.length) fields[T.activities.fields.project] = projectIds;

  const rec = await client.createRecord(T.activities.id, fields);
  return mapActivity(rec);
}

async function updateActivity(id, { name, type, date, details, regarding, result, attendeeIds, projectIds }) {
  if (!id) throw new Error('Activity id is required.');
  if (name !== undefined && !name.trim()) throw new Error('Activity name is required.');
  const fields = {};
  if (name !== undefined) fields[T.activities.fields.name] = name.trim();
  if (type !== undefined) fields[T.activities.fields.type] = type || null;
  if (date !== undefined) fields[T.activities.fields.date] = date || null;
  if (details !== undefined) fields[T.activities.fields.details] = details || null;
  if (regarding !== undefined) {
    fields[T.activities.fields.regarding] = regarding
      ? (regarding.length === 16 ? `${regarding}:00` : regarding)
      : null;
  }
  if (result !== undefined) fields[T.activities.fields.result] = result || null;
  if (attendeeIds !== undefined) fields[T.activities.fields.attendee] = attendeeIds || [];
  if (projectIds !== undefined) fields[T.activities.fields.project] = projectIds || [];

  const rec = await client.updateRecord(T.activities.id, id, fields);
  return mapActivity(rec);
}

async function listDeals() {
  const recs = await client.listAllRecords(T.deals.id);
  return recs.map(mapDeal);
}

async function getDeal(id) {
  const rec = await client.getRecord(T.deals.id, id);
  return mapDeal(rec);
}

async function createDeal({ name, companyId, primaryContactId, stage, amount, probability, closeDate }) {
  if (!name || !name.trim()) throw new Error('Deal name is required.');
  const fields = {
    [T.deals.fields.name]: name.trim()
  };
  if (companyId) fields[T.deals.fields.company] = [companyId];
  if (primaryContactId) fields[T.deals.fields.primaryContact] = [primaryContactId];
  if (stage) fields[T.deals.fields.stage] = stage;
  if (amount) fields[T.deals.fields.amount] = Number(amount);
  if (probability) fields[T.deals.fields.probability] = Number(probability) / 100;
  if (closeDate) fields[T.deals.fields.closeDate] = closeDate;

  const rec = await client.createRecord(T.deals.id, fields);
  return mapDeal(rec);
}

async function updateDealStage(id, stage) {
  if (!T.deals.stageChoices.includes(stage)) {
    throw new Error(`Invalid stage: ${stage}`);
  }
  const updated = await client.updateRecord(T.deals.id, id, { [T.deals.fields.stage]: stage });
  return mapDeal(updated);
}

/**
 * Updates a deal's linked Projects and/or Products (multipleRecordLinks
 * fields). Pass undefined to leave a link untouched, or an array (possibly
 * empty) to replace it — mirrors updateActivity's attendeeIds/projectIds
 * pattern.
 */
async function updateDealLinks(id, { projectIds, productIds } = {}) {
  if (!id) throw new Error('Deal id is required.');
  const fields = {};
  if (projectIds !== undefined) fields[T.deals.fields.projects] = projectIds || [];
  if (productIds !== undefined) fields[T.deals.fields.products] = productIds || [];
  if (!Object.keys(fields).length) return getDeal(id);
  const updated = await client.updateRecord(T.deals.id, id, fields);
  return mapDeal(updated);
}

/**
 * Update a deal's core fields: name, stage, amount, probability, close date,
 * and primary contact. Only the fields that are explicitly provided are sent
 * to Airtable — undefined keys are ignored so callers can do partial updates.
 */
async function updateDeal(id, { name, stage, amount, probability, closeDate, primaryContactId } = {}) {
  if (!id) throw new Error('Deal id is required.');
  const fields = {};
  if (name !== undefined) fields[T.deals.fields.name] = name.trim();
  if (stage !== undefined) fields[T.deals.fields.stage] = stage || null;
  if (amount !== undefined) fields[T.deals.fields.amount] = amount !== '' ? Number(amount) : null;
  if (probability !== undefined) fields[T.deals.fields.probability] = probability !== '' ? Number(probability) / 100 : null;
  if (closeDate !== undefined) fields[T.deals.fields.closeDate] = closeDate || null;
  if (primaryContactId !== undefined) fields[T.deals.fields.primaryContact] = primaryContactId ? [primaryContactId] : [];
  if (!Object.keys(fields).length) return getDeal(id);
  const updated = await client.updateRecord(T.deals.id, id, fields);
  return mapDeal(updated);
}

/**
 * Creates a brand-new Project from a Deal: the project inherits the deal's
 * company (Projects already link to a company) and is immediately linked
 * back onto the deal's Projects field.
 */
async function createProjectFromDeal({ dealId, name, productIds, status, category, description, startDate, endDate }) {
  if (!dealId) throw new Error('dealId is required.');
  const deal = await getDeal(dealId);
  const companyId = (deal.companyIds || [])[0] || null;
  const project = await createProject({ name, companyId, productIds, status, category, description, startDate, endDate });
  const nextProjectIds = [...(deal.projectIds || []), project.id];
  await updateDealLinks(dealId, { projectIds: nextProjectIds });
  return project;
}

async function listProjects() {
  const recs = await client.listAllRecords(T.projects.id);
  return recs.map(mapProject);
}

async function createProject({ name, companyId, productIds, status, category, description, startDate, endDate }) {
  if (!name || !name.trim()) throw new Error('Project name is required.');
  const fields = {
    [T.projects.fields.name]: name.trim()
  };
  if (companyId) fields[T.projects.fields.relatedCompany] = [companyId];
  if (productIds && productIds.length) fields[T.projects.fields.relatedProduct] = productIds;
  if (status) fields[T.projects.fields.status] = status;
  if (category) fields[T.projects.fields.category] = category;
  if (description) fields[T.projects.fields.description] = description;
  if (startDate) fields[T.projects.fields.startDate] = startDate;
  if (endDate) fields[T.projects.fields.endDate] = endDate;

  const rec = await client.createRecord(T.projects.id, fields);
  return mapProject(rec);
}

/**
 * Updates an existing project's editable fields. Only fields present
 * (including explicit empty-string/empty-array "clear" values) are sent —
 * callers pass `undefined` for anything they don't want to touch.
 */
async function updateProject(id, { name, companyId, productIds, status, category, description, startDate, endDate }) {
  if (!id) throw new Error('Project id is required.');
  if (name !== undefined && !name.trim()) throw new Error('Project name is required.');

  const fields = {};
  if (name !== undefined) fields[T.projects.fields.name] = name.trim();
  if (companyId !== undefined) fields[T.projects.fields.relatedCompany] = companyId ? [companyId] : [];
  if (productIds !== undefined) fields[T.projects.fields.relatedProduct] = productIds;
  if (status !== undefined) fields[T.projects.fields.status] = status || null;
  if (category !== undefined) fields[T.projects.fields.category] = category || null;
  if (description !== undefined) fields[T.projects.fields.description] = description || '';
  if (startDate !== undefined) fields[T.projects.fields.startDate] = startDate || null;
  if (endDate !== undefined) fields[T.projects.fields.endDate] = endDate || null;

  const rec = await client.updateRecord(T.projects.id, id, fields);
  return mapProject(rec);
}

/**
 * Uploads one or more in-memory files (as produced by multer's
 * memoryStorage, i.e. objects with .buffer/.originalname/.mimetype) onto a
 * project's Attachments field. Files are uploaded one at a time via
 * Airtable's content API and appended to whatever's already there.
 */
async function addProjectAttachments(projectId, files) {
  if (!projectId) throw new Error('projectId is required.');
  if (!files || !files.length) return;
  for (const file of files) {
    await client.uploadAttachment(projectId, T.projects.fields.attachments, {
      filename: file.originalname,
      contentType: file.mimetype,
      base64: file.buffer.toString('base64')
    });
  }
}

async function listProjectActivityRecords(taskId) {
  if (!taskId) return [];
  const recs = await client.listAllRecords(T.projectActivityRecords.id);
  return recs
    .map(mapProjectActivityRecord)
    .filter((r) => r.taskIds.includes(taskId))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

/**
 * Creates a "sub-subtask" log entry on the Project Activity Records table,
 * linked back to a Project Activity (task). Optionally uploads one or more
 * in-memory files (multer memoryStorage) onto its Attachment field, one at
 * a time, same pattern as addProjectAttachments.
 */
async function addProjectActivityRecord({ taskId, name, details, category, recordedByEmail, recordedByName, files }) {
  if (!taskId) throw new Error('taskId is required.');
  if ((!name || !name.trim()) && (!details || !details.trim()) && !category && !(files && files.length)) {
    throw new Error('Add some details, a category, or a file before posting.');
  }
  // No dedicated "name" input in the UI anymore — this is a thread of updates,
  // not titled sub-tasks. Derive a short title from category/details so the
  // Airtable primary field still has something useful, or fall back to "Update".
  const resolvedName =
    (name && name.trim()) ||
    category ||
    (details && details.trim() ? details.trim().slice(0, 60) : null) ||
    'Update';

  const fields = {
    [T.projectActivityRecords.fields.name]: resolvedName,
    [T.projectActivityRecords.fields.projectActivity]: [taskId]
  };
  if (details) fields[T.projectActivityRecords.fields.details] = details;
  if (category) fields[T.projectActivityRecords.fields.category] = category;
  if (recordedByEmail) {
    fields[T.projectActivityRecords.fields.recordedBy] = recordedByName
      ? { email: recordedByEmail, name: recordedByName }
      : { email: recordedByEmail };
  }

  const rec = await client.createRecord(T.projectActivityRecords.id, fields);

  if (files && files.length) {
    for (const file of files) {
      await client.uploadAttachment(rec.id, T.projectActivityRecords.fields.attachment, {
        filename: file.originalname,
        contentType: file.mimetype,
        base64: file.buffer.toString('base64')
      });
    }
  }

  return mapProjectActivityRecord(rec);
}

/**
 * Uploads one or more in-memory files onto a task's (Project Activity's)
 * own Attachments field — same upload pattern as addProjectAttachments.
 */
async function addTaskAttachments(taskId, files) {
  if (!taskId) throw new Error('taskId is required.');
  if (!files || !files.length) return;
  for (const file of files) {
    await client.uploadAttachment(taskId, T.projectActivities.fields.attachments, {
      filename: file.originalname,
      contentType: file.mimetype,
      base64: file.buffer.toString('base64')
    });
  }
}

/**
 * Sets the multi-person "Assigned" field on a task, replacing whatever was
 * there before. Distinct from assignTask (below), which sets the single
 * "Owner" field. Airtable resolves collaborator objects addressed by email
 * as long as the email belongs to a base collaborator.
 */
async function setTaskAssignees({ taskId, emails }) {
  if (!taskId) throw new Error('taskId is required.');
  const list = (emails || []).filter(Boolean).map((email) => ({ email }));
  const fields = {
    [T.projectActivities.fields.assigned]: list
  };
  const rec = await client.updateRecord(T.projectActivities.id, taskId, fields);
  return mapProjectActivity(rec);
}

/**
 * Links an already-existing task (Project Activity) to a project, adding
 * to whatever projects it's already linked to rather than replacing them
 * — a task can belong to more than one project.
 */
async function linkTaskToProject({ taskId, projectId }) {
  if (!taskId) throw new Error('taskId is required.');
  if (!projectId) throw new Error('projectId is required.');
  const task = await getProjectActivity(taskId);
  const projectIds = Array.from(new Set([...(task.projectIds || []), projectId]));
  const fields = {
    [T.projectActivities.fields.project]: projectIds
  };
  const rec = await client.updateRecord(T.projectActivities.id, taskId, fields);
  return mapProjectActivity(rec);
}

async function listProjectActivities() {
  const recs = await client.listAllRecords(T.projectActivities.id);
  return recs.map(mapProjectActivity);
}

async function getProjectActivity(id) {
  const rec = await client.getRecord(T.projectActivities.id, id);
  return mapProjectActivity(rec);
}

async function createProjectActivity({ name, projectId, type, date, deadline, status, details, createdByEmail, createdByName }) {
  if (!name || !name.trim()) throw new Error('Task name is required.');
  const fields = {
    [T.projectActivities.fields.name]: name.trim()
  };
  if (projectId) fields[T.projectActivities.fields.project] = [projectId];
  if (type) fields[T.projectActivities.fields.type] = type;
  if (date) fields[T.projectActivities.fields.date] = date;
  if (deadline) fields[T.projectActivities.fields.deadline] = deadline;
  if (status) fields[T.projectActivities.fields.status] = status;
  if (details) fields[T.projectActivities.fields.details] = details;
  // Owner is set once, at creation, to whoever created the task — it is not
  // editable afterward from the UI (see task-detail.ejs Owner card).
  if (createdByEmail) {
    fields[T.projectActivities.fields.owner] = [
      createdByName ? { email: createdByEmail, name: createdByName } : { email: createdByEmail }
    ];
  }

  const rec = await client.createRecord(T.projectActivities.id, fields);
  return mapProjectActivity(rec);
}

async function listTaskComments(taskId) {
  const recs = await client.listAllRecords(T.taskComments.id);
  return recs
    .map(mapTaskComment)
    .filter((c) => c.taskIds.includes(taskId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
}

async function addTaskComment({ taskId, author, comment, link, files }) {
  if (!taskId) throw new Error('taskId is required.');
  if (!comment || !comment.trim()) throw new Error('Comment text is required.');
  const fields = {
    [T.taskComments.fields.comment]: comment.trim(),
    [T.taskComments.fields.task]: [taskId]
  };
  if (author) fields[T.taskComments.fields.author] = author;
  if (link) fields[T.taskComments.fields.link] = link;

  let rec = await client.createRecord(T.taskComments.id, fields);

  if (files && files.length) {
    for (const file of files) {
      await client.uploadAttachment(rec.id, T.taskComments.fields.attachment, {
        filename: file.originalname,
        contentType: file.mimetype,
        base64: file.buffer.toString('base64')
      });
    }
    rec = await client.getRecord(T.taskComments.id, rec.id);
  }

  return mapTaskComment(rec);
}

async function listActivityComments(activityId) {
  const recs = await client.listAllRecords(T.taskComments.id);
  return recs
    .map(mapTaskComment)
    .filter((c) => c.activityIds.includes(activityId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
}

async function addActivityComment({ activityId, author, comment, link, files }) {
  if (!activityId) throw new Error('activityId is required.');
  if (!comment || !comment.trim()) throw new Error('Comment text is required.');
  const fields = {
    [T.taskComments.fields.comment]: comment.trim(),
    [T.taskComments.fields.activity]: [activityId]
  };
  if (author) fields[T.taskComments.fields.author] = author;
  if (link) fields[T.taskComments.fields.link] = link;

  let rec = await client.createRecord(T.taskComments.id, fields);

  if (files && files.length) {
    for (const file of files) {
      await client.uploadAttachment(rec.id, T.taskComments.fields.attachment, {
        filename: file.originalname,
        contentType: file.mimetype,
        base64: file.buffer.toString('base64')
      });
    }
    rec = await client.getRecord(T.taskComments.id, rec.id);
  }

  return mapTaskComment(rec);
}

async function listDealComments(dealId) {
  const recs = await client.listAllRecords(T.taskComments.id);
  return recs
    .map(mapTaskComment)
    .filter((c) => c.dealIds.includes(dealId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
}

async function addDealComment({ dealId, author, comment, link }) {
  if (!dealId) throw new Error('dealId is required.');
  if (!comment || !comment.trim()) throw new Error('Comment text is required.');
  const fields = {
    [T.taskComments.fields.comment]: comment.trim(),
    [T.taskComments.fields.deal]: [dealId]
  };
  if (author) fields[T.taskComments.fields.author] = author;
  if (link) fields[T.taskComments.fields.link] = link;

  const rec = await client.createRecord(T.taskComments.id, fields);
  return mapTaskComment(rec);
}

async function listProjectComments(projectId) {
  const recs = await client.listAllRecords(T.taskComments.id);
  return recs
    .map(mapTaskComment)
    .filter((c) => c.projectIds.includes(projectId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
}

async function addProjectComment({ projectId, author, comment, link, files }) {
  if (!projectId) throw new Error('projectId is required.');
  if (!comment || !comment.trim()) throw new Error('Comment text is required.');
  const fields = {
    [T.taskComments.fields.comment]: comment.trim(),
    [T.taskComments.fields.project]: [projectId]
  };
  if (author) fields[T.taskComments.fields.author] = author;
  if (link) fields[T.taskComments.fields.link] = link;

  let rec = await client.createRecord(T.taskComments.id, fields);

  if (files && files.length) {
    for (const file of files) {
      await client.uploadAttachment(rec.id, T.taskComments.fields.attachment, {
        filename: file.originalname,
        contentType: file.mimetype,
        base64: file.buffer.toString('base64')
      });
    }
    rec = await client.getRecord(T.taskComments.id, rec.id);
  }

  return mapTaskComment(rec);
}

/**
 * Full activity detail view model: the activity itself plus its comments
 * (oldest first) — used by the editable Activity detail page.
 */
async function getActivityDetail(id) {
  const [activity, comments] = await Promise.all([
    getActivity(id),
    listActivityComments(id)
  ]);
  return { ...activity, comments };
}

async function listContactComments(contactId) {
  const recs = await client.listAllRecords(T.taskComments.id);
  return recs
    .map(mapTaskComment)
    .filter((c) => c.contactIds.includes(contactId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
}

async function addContactComment({ contactId, author, comment, link }) {
  if (!contactId) throw new Error('contactId is required.');
  if (!comment || !comment.trim()) throw new Error('Comment text is required.');
  const fields = {
    [T.taskComments.fields.comment]: comment.trim(),
    [T.taskComments.fields.contact]: [contactId]
  };
  if (author) fields[T.taskComments.fields.author] = author;
  if (link) fields[T.taskComments.fields.link] = link;

  const rec = await client.createRecord(T.taskComments.id, fields);
  return mapTaskComment(rec);
}

/**
 * Full contact detail view model: the contact itself, its related company
 * (if any), and its comments (oldest first) — used by the Contact detail
 * page reached from a company's Contacts list.
 */
async function getContactDetail(id) {
  const [contact, companies, comments] = await Promise.all([
    getContact(id),
    listCompanies(),
    listContactComments(id)
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  return {
    ...contact,
    company: companyById.get(contact.companyIds[0]) || null,
    comments
  };
}

/**
 * Sets a task's single primary "Owner" (multipleCollaborators field, but
 * always written as a single-item array since the UI only lets you pick
 * one owner at a time). For assigning multiple people to a task, see
 * setTaskAssignees, which writes the separate "Assigned" field instead.
 * Airtable accepts collaborator objects addressed by email when the email
 * belongs to a base collaborator.
 */
async function assignTask({ taskId, email, name }) {
  if (!taskId) throw new Error('taskId is required.');
  if (!email) throw new Error('Assignee email is required.');
  const collaborator = name ? { email, name } : { email };
  const fields = {
    [T.projectActivities.fields.owner]: [collaborator]
  };
  const rec = await client.updateRecord(T.projectActivities.id, taskId, fields);
  return mapProjectActivity(rec);
}

/**
 * Updates the editable scheduling/notes fields on a task (Details card on
 * task-detail.ejs). Owner is intentionally excluded — it's fixed at
 * creation time, see createProjectActivity.
 */
async function updateTaskDetails({ taskId, date, deadline, details }) {
  if (!taskId) throw new Error('taskId is required.');
  const fields = {
    [T.projectActivities.fields.date]: date || null,
    [T.projectActivities.fields.deadline]: deadline || null,
    [T.projectActivities.fields.details]: details || null
  };
  const rec = await client.updateRecord(T.projectActivities.id, taskId, fields);
  return mapProjectActivity(rec);
}

/**
 * Updates the editable Basic info fields on a contact (Basic info card on
 * contact-detail.ejs). Name and Company are intentionally excluded — they
 * stay fixed after creation, same convention as updateTaskDetails.
 */
async function updateContact({ contactId, title, email, phone, notes }) {
  if (!contactId) throw new Error('contactId is required.');
  const fields = {
    [T.contacts.fields.title]: title || null,
    [T.contacts.fields.email]: email || null,
    [T.contacts.fields.phone]: phone || null,
    [T.contacts.fields.notes]: notes || null
  };
  const rec = await client.updateRecord(T.contacts.id, contactId, fields);
  return mapContact(rec);
}

async function completeTask(taskId) {
  if (!taskId) throw new Error('taskId is required.');
  const fields = {
    [T.projectActivities.fields.status]: 'Completed'
  };
  const rec = await client.updateRecord(T.projectActivities.id, taskId, fields);
  return mapProjectActivity(rec);
}

/**
 * Full task detail view model: the task itself, its parent project (if
 * any), its comments (oldest first), and the directory of assignable
 * team users (for the assignment picker).
 */
async function getTaskDetail(id) {
  const [task, comments, teamUsers, records] = await Promise.all([
    getProjectActivity(id),
    listTaskComments(id),
    listTeamUsers(),
    listProjectActivityRecords(id)
  ]);

  let project = null;
  if (task.projectIds && task.projectIds.length) {
    try {
      const rec = await client.getRecord(T.projects.id, task.projectIds[0]);
      project = mapProject(rec);
    } catch (err) {
      project = null;
    }
  }

  return { ...task, project, comments, teamUsers, records };
}

/**
 * Quick inline product creation — used by the "+ New product" action on
 * the project create/edit forms, so a brand-new product doesn't require
 * leaving the project form. Only the fields exposed by that quick form are
 * accepted; full specs can be filled in later from the product detail page.
 */
async function createProduct({ name, category }) {
  if (!name || !name.trim()) throw new Error('Product name is required.');
  const fields = {
    [T.products.fields.name]: name.trim()
  };
  if (category) fields[T.products.fields.category] = category;

  const rec = await client.createRecord(T.products.id, fields);
  return mapProduct(rec);
}

async function listProducts() {
  const recs = await client.listAllRecords(T.products.id);
  return recs.map(mapProduct).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Updates the editable Specifications/Notes fields on a product (Specifications
 * + Notes cards on product-detail.ejs). Name is intentionally excluded — it
 * stays fixed after creation, same convention as updateContact/updateTaskDetails.
 *
 * All the spec fields (inputVoltage, boardSize, horsePower, maxInputPower,
 * maxInputCurrent, maxOutputCurrent) are Airtable "single line text" fields,
 * not numbers — confirmed via the base schema — so they're written through
 * as plain strings. Coercing them with Number() throws a 422
 * INVALID_VALUE_FOR_COLUMN from Airtable.
 */
async function updateProduct({ productId, category, phase, inputVoltage, boardSize, horsePower, maxInputPower, maxInputCurrent, maxOutputCurrent, notes }) {
  if (!productId) throw new Error('productId is required.');
  const fields = {
    [T.products.fields.category]: category || null,
    [T.products.fields.phase]: phase || null,
    [T.products.fields.inputVoltage]: inputVoltage || null,
    [T.products.fields.boardSize]: boardSize || null,
    [T.products.fields.horsePower]: horsePower || null,
    [T.products.fields.maxInputPower]: maxInputPower || null,
    [T.products.fields.maxInputCurrent]: maxInputCurrent || null,
    [T.products.fields.maxOutputCurrent]: maxOutputCurrent || null,
    [T.products.fields.notes]: notes || null
  };
  const rec = await client.updateRecord(T.products.id, productId, fields);
  return mapProduct(rec);
}

/**
 * Replaces a product's photo (Image field on product-detail.ejs). The field
 * holds a single photo, so unlike addProjectAttachments (which appends) this
 * first clears the field, then uploads the new file via Airtable's content
 * API — same upload mechanics as addProjectAttachments, but swap instead of
 * append since there should only ever be one product image at a time.
 */
async function replaceProductImage(productId, file) {
  if (!productId) throw new Error('productId is required.');
  if (!file) throw new Error('A file is required.');
  await client.updateRecord(T.products.id, productId, { [T.products.fields.image]: [] });
  await client.uploadAttachment(productId, T.products.fields.image, {
    filename: file.originalname,
    contentType: file.mimetype,
    base64: file.buffer.toString('base64')
  });
}

async function getProduct(id) {
  const rec = await client.getRecord(T.products.id, id);
  return mapProduct(rec);
}

/**
 * Single product detail view model: product + its related projects
 * (resolved from the Products table's `projects` relation).
 */
async function getProductDetail(id) {
  const [product, projects] = await Promise.all([
    getProduct(id),
    listProjects()
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  return {
    ...product,
    projects: (product.projectIds || []).map((pid) => projectById.get(pid)).filter(Boolean)
  };
}

/**
 * Products table view model: each product alongside the names of its
 * related projects (a real Airtable relation on the Products table).
 */
async function listProductsWithProjects() {
  const [products, projects] = await Promise.all([listProducts(), listProjects()]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  return products.map((p) => ({
    ...p,
    projects: p.projectIds.map((pid) => projectById.get(pid)).filter(Boolean)
  }));
}

/**
 * Projects list view model: each project alongside its related products,
 * related companies, and its subtasks (Project Activities), sorted by date.
 */
async function listProjectsWithSubtasks() {
  const [projects, products, companies, projectActivities] = await Promise.all([
    listProjects(),
    listProducts(),
    listCompanies(),
    listProjectActivities()
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  return projects.map((proj) => ({
    ...proj,
    products: proj.productIds.map((pid) => productById.get(pid)).filter(Boolean),
    companies: proj.companyIds.map((cid) => companyById.get(cid)).filter(Boolean),
    subtasks: projectActivities
      .filter((pa) => pa.projectIds.includes(proj.id))
      .sort((a, b) => new Date(a.deadline || a.date || 0) - new Date(b.deadline || b.date || 0))
  }));
}

/**
 * Single project detail view model: project + its related company,
 * related products, and subtasks (Project Activities), sorted by date.
 */
async function getProjectDetail(id) {
  const [rec, companies, products, projectActivities, deals, comments] = await Promise.all([
    client.getRecord(T.projects.id, id),
    listCompanies(),
    listProducts(),
    listProjectActivities(),
    listDeals(),
    listProjectComments(id)
  ]);
  const project = mapProject(rec);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const productById = new Map(products.map((p) => [p.id, p]));

  return {
    ...project,
    companies: project.companyIds.map((cid) => companyById.get(cid)).filter(Boolean),
    products: project.productIds.map((pid) => productById.get(pid)).filter(Boolean),
    // Deals don't link back to a project directly — the link lives on the
    // Deal's own Projects field, so find it from that side, same pattern as
    // getDealDetail filtering activities by dealIds.
    deals: deals.filter((d) => (d.projectIds || []).includes(project.id)),
    subtasks: projectActivities
      .filter((pa) => pa.projectIds.includes(project.id))
      .sort((a, b) => new Date(a.deadline || a.date || 0) - new Date(b.deadline || b.date || 0)),
    comments
  };
}

/**
 * Single deal detail view model: deal + its related company, primary
 * contact, linked projects, linked products, activity history (calls,
 * emails, documents — reusing the Activities feature scoped to this deal),
 * and the deal's notes/comment feed.
 */
async function getDealDetail(id) {
  const [deal, companies, contacts, projects, products, activities, comments] = await Promise.all([
    getDeal(id),
    listCompanies(),
    listContacts(),
    listProjects(),
    listProducts(),
    listActivities(),
    listDealComments(id)
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const company = companyById.get(deal.companyIds[0]) || null;
  // Contacts scoped to the deal's company (for the edit-form dropdown).
  const persons = company
    ? contacts.filter((c) => c.companyIds.includes(company.id))
    : contacts;

  return {
    ...deal,
    company,
    primaryContact: contactById.get(deal.primaryContactIds[0]) || null,
    persons,
    projects: (deal.projectIds || []).map((pid) => projectById.get(pid)).filter(Boolean),
    products: (deal.productIds || []).map((pid) => productById.get(pid)).filter(Boolean),
    activities: activities
      .filter((a) => a.dealIds.includes(id))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    comments
  };
}

async function linkActivityEmail(id, { subject, date, messageId }) {
  const updated = await client.updateRecord(T.activities.id, id, {
    [T.activities.fields.emailSubject]: subject || null,
    [T.activities.fields.emailDate]: date || null,
    [T.activities.fields.emailMessageId]: messageId || null
  });
  return mapActivity(updated);
}

async function linkProjectActivityEmail(id, { subject, date, messageId }) {
  const updated = await client.updateRecord(T.projectActivities.id, id, {
    [T.projectActivities.fields.emailSubject]: subject || null,
    [T.projectActivities.fields.emailDate]: date || null,
    [T.projectActivities.fields.emailMessageId]: messageId || null
  });
  return mapProjectActivity(updated);
}

/**
 * Builds the full "company detail" view model: company + its contacts,
 * deals, activities, and projects (with nested project activities).
 */
async function getCompanyDetail(companyId) {
  const [company, contacts, deals, activities, projects, projectActivities] = await Promise.all([
    getCompany(companyId),
    listContacts(),
    listDeals(),
    listActivities(),
    listProjects(),
    listProjectActivities()
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));

  const persons = contacts.filter((c) => c.companyIds.includes(companyId));
  const companyDeals = deals.filter((d) => d.companyIds.includes(companyId));
  const companyActivities = activities
    .filter((a) => a.companyIds.includes(companyId))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map((a) => ({
      ...a,
      projectNames: a.projectIds.map((pid) => projectById.get(pid)?.name).filter(Boolean)
    }));
  const companyProjects = projects
    .filter((p) => p.companyIds.includes(companyId))
    .map((p) => ({
      ...p,
      activities: projectActivities
        .filter((pa) => pa.projectIds.includes(p.id))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    }));

  return { company, persons, deals: companyDeals, activities: companyActivities, projects: companyProjects };
}

/**
 * Pipeline board: all open deals grouped by stage, each annotated with its
 * company name, for a sales-by-company view.
 */
async function getPipelineBoard() {
  const [deals, companies] = await Promise.all([listDeals(), listCompanies()]);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const enriched = deals.map((d) => ({
    ...d,
    company: companyById.get(d.companyIds[0]) || null
  }));

  const stages = T.deals.stageChoices;
  const board = stages.map((stage) => ({
    stage,
    deals: enriched.filter((d) => d.stage === stage),
    total: enriched.filter((d) => d.stage === stage).reduce((sum, d) => sum + (d.amount || 0), 0)
  }));

  return { board, stageChoices: stages };
}

/**
 * Restricts a list of records (each with an `ownerEmails` array, from the
 * mappers above) to ones owned by the given email — used to scope the
 * "Sales" role to its own records. Admin/Manager see everything, so callers
 * should only apply this when role === 'Sales'.
 */
function scopeToOwner(records, email) {
  if (!email) return records;
  const target = email.toLowerCase();
  return records.filter((r) => (r.ownerEmails || []).includes(target));
}

/**
 * Builds the admin "all users" directory by scanning the Owner collaborator
 * fields already on Company/Deals/Activities/Project Activities — these
 * are real Airtable base collaborators, so no separate user table is
 * needed. Returns distinct people by email.
 */
async function listTeamUsers() {
  const [companies, deals, activities, projectActivities] = await Promise.all([
    listCompanies(),
    listDeals(),
    listActivities(),
    listProjectActivities()
  ]);

  const adminEmail = (process.env.ADMIN_EMAIL || 'buzzardontree@gmail.com').toLowerCase();
  const byEmail = new Map();

  for (const rec of [...companies, ...deals, ...activities, ...projectActivities]) {
    for (const owner of rec.owners || []) {
      const email = (owner.email || '').toLowerCase();
      if (!email) continue;
      if (!byEmail.has(email)) {
        byEmail.set(email, { email, name: owner.name || email, recordCount: 0 });
      }
      byEmail.get(email).recordCount += 1;
    }
  }

  if (!byEmail.has(adminEmail)) {
    byEmail.set(adminEmail, { email: adminEmail, name: adminEmail, recordCount: 0 });
  }

  return Array.from(byEmail.values())
    .map((u) => ({ ...u, role: u.email === adminEmail ? 'Admin' : 'Collaborator' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  schema,
  scopeToOwner,
  listTeamUsers,
  listCompanies,
  getCompany,
  createCompany,
  listContacts,
  createContact,
  getContact,
  listContactComments,
  addContactComment,
  getContactDetail,
  updateContact,
  listActivities,
  getActivity,
  createActivity,
  updateActivity,
  listActivityComments,
  addActivityComment,
  getActivityDetail,
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  updateDealStage,
  updateDealLinks,
  createProjectFromDeal,
  listDealComments,
  addDealComment,
  listProjects,
  createProject,
  updateProject,
  addProjectAttachments,
  listProjectsWithSubtasks,
  getProjectDetail,
  listProjectComments,
  addProjectComment,
  getDealDetail,
  listProjectActivities,
  getProjectActivity,
  createProjectActivity,
  linkTaskToProject,
  listTaskComments,
  addTaskComment,
  assignTask,
  setTaskAssignees,
  addTaskAttachments,
  listProjectActivityRecords,
  addProjectActivityRecord,
  updateTaskDetails,
  completeTask,
  getTaskDetail,
  listProducts,
  createProduct,
  updateProduct,
  replaceProductImage,
  listProductsWithProjects,
  getProduct,
  getProductDetail,
  linkActivityEmail,
  linkProjectActivityEmail,
  getCompanyDetail,
  getPipelineBoard
};
