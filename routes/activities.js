const express = require('express');
const router = express.Router();
const crm = require('../services/crm');

async function loadFormData(activity) {
  const companyId = (activity.companyIds || [])[0];
  const [contacts, projects] = await Promise.all([crm.listContacts(), crm.listProjects()]);
  const persons = companyId ? contacts.filter((c) => c.companyIds.includes(companyId)) : contacts;
  const companyProjects = companyId ? projects.filter((p) => p.companyIds.includes(companyId)) : projects;
  return { persons, projects: companyProjects };
}

router.get('/activities/:id', async (req, res, next) => {
  try {
    const activity = await crm.getActivityDetail(req.params.id);
    if (!activity.name) return res.status(404).render('error', { title: 'Not found', message: 'Activity not found.' });
    const { persons, projects } = await loadFormData(activity);
    // Airtable returns "regarding" as a full ISO 8601 string; the
    // datetime-local input only accepts the first 16 chars ("YYYY-MM-DDTHH:mm").
    activity.regardingInput = activity.regarding ? String(activity.regarding).slice(0, 16) : '';
    res.render('activity-detail', {
      title: activity.name,
      activity,
      persons,
      projects,
      typeChoices: crm.schema.tables.activities.typeChoices,
      resultChoices: crm.schema.tables.activities.resultChoices,
      error: null
    });
  } catch (err) {
    next(err);
  }
});

router.post('/activities/:id', async (req, res, next) => {
  try {
    const { name, type, date, details, regarding, result } = req.body;
    let attendeeIds = req.body.attendeeIds;
    if (!attendeeIds) attendeeIds = [];
    if (!Array.isArray(attendeeIds)) attendeeIds = [attendeeIds];
    let projectIds = req.body.projectIds;
    if (!projectIds) projectIds = [];
    if (!Array.isArray(projectIds)) projectIds = [projectIds];

    await crm.updateActivity(req.params.id, { name, type, date, details, regarding, result, attendeeIds, projectIds });
    res.redirect(`/activities/${req.params.id}`);
  } catch (err) {
    try {
      const activity = await crm.getActivityDetail(req.params.id);
      const { persons, projects } = await loadFormData(activity);
      return res.status(400).render('activity-detail', {
        title: activity.name,
        activity: { ...activity, ...req.body },
        persons,
        projects,
        typeChoices: crm.schema.tables.activities.typeChoices,
        resultChoices: crm.schema.tables.activities.resultChoices,
        error: err.message
      });
    } catch (err2) {
      next(err2);
    }
  }
});

router.post('/activities/:id/comments', async (req, res, next) => {
  try {
    const { comment, link } = req.body;
    const author = (req.session.user && req.session.user.name) || 'Someone';
    await crm.addActivityComment({ activityId: req.params.id, author, comment, link });
    res.redirect(`/activities/${req.params.id}`);
  } catch (err) {
    try {
      const activity = await crm.getActivityDetail(req.params.id);
      const { persons, projects } = await loadFormData(activity);
      return res.status(400).render('activity-detail', {
        title: activity.name,
        activity,
        persons,
        projects,
        typeChoices: crm.schema.tables.activities.typeChoices,
        resultChoices: crm.schema.tables.activities.resultChoices,
        error: err.message
      });
    } catch (err2) {
      next(err2);
    }
  }
});

module.exports = router;
