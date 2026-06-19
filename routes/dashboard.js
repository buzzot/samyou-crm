const express = require('express');
const router = express.Router();
const crm = require('../services/crm');

router.get('/', async (req, res, next) => {
  try {
    const { role, email } = req.session.user;
    const [{ board: fullBoard }, allCompanies, allActivities, projects] = await Promise.all([
      crm.getPipelineBoard(),
      crm.listCompanies(),
      crm.listActivities(),
      crm.listProjects()
    ]);

    // Sales only sees what they own; Admin/Manager see everything.
    const scoped = (records) => (role === 'Sales' ? crm.scopeToOwner(records, email) : records);
    const companies = scoped(allCompanies);
    const activities = scoped(allActivities);
    const board = fullBoard.map((b) => ({ ...b, deals: scoped(b.deals) }))
      .map((b) => ({ ...b, total: b.deals.reduce((sum, d) => sum + (d.amount || 0), 0) }));

    const openStages = board.filter((b) => !b.stage.startsWith('Closed'));
    const openPipelineTotal = openStages.reduce((sum, b) => sum + b.total, 0);
    const openDealCount = openStages.reduce((sum, b) => sum + b.deals.length, 0);
    const wonTotal = board.find((b) => b.stage === 'Closed Won')?.total || 0;

    const companyById = new Map(companies.map((c) => [c.id, c]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const recentActivities = activities
      .filter((a) => a.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8)
      .map((a) => ({
        ...a,
        companyNames: a.companyIds.map((id) => companyById.get(id)?.name).filter(Boolean),
        projectNames: a.projectIds.map((id) => projectById.get(id)?.name).filter(Boolean)
      }));

    res.render('dashboard', {
      title: 'Dashboard',
      stats: {
        companyCount: companies.length,
        openDealCount,
        openPipelineTotal,
        wonTotal
      },
      board,
      recentActivities
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
