const W = require('./work-assessment');

// Beijing time is independent of the host's timezone. No late or weekday catch-up.
function scheduledWeek(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600000);
  return local.getUTCDay() === 0 && local.getUTCHours() === 8 && local.getUTCMinutes() === 0
    ? W.week(local.toISOString().slice(0, 10)) : null;
}

async function runScore({ pool, generate, userId, start, actorId = 0, source = 'scheduled' }) {
  const db = await pool.getConnection();
  const lock = `work-score:${userId}:${start}`;
  let acquired = false, jobId;
  try {
    const [[row]] = await db.query('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    acquired = Number(row.acquired) === 1;
    if (!acquired) return { available: false, reason: '该人员本周评分正在进行，请稍后刷新。' };
    await db.query("UPDATE work_score_jobs SET status='failed',reason='上次评分进程中断，请由管理员手动重试',finished_at=UTC_TIMESTAMP() WHERE user_id=? AND week_start=? AND status='running'", [userId, start]);
    // A persistent unique key prevents repeats across API workers and restarts.
    const [job] = await db.query("INSERT IGNORE INTO work_score_jobs(job_key,user_id,week_start,source,status,actor_id) VALUES(?,?,?,?,'running',?)",
      [source === 'scheduled' ? `${start}:${userId}` : null, userId, start, source, actorId]);
    if (!job.affectedRows) return { available: false, reason: '本周定时评分已执行，不重复触发。' };
    jobId = job.insertId;
    const result = await generate({ userId, start, actorId, source });
    await db.query('UPDATE work_score_jobs SET status=?,reason=?,finished_at=UTC_TIMESTAMP() WHERE id=?',
      [result.available ? 'completed' : 'failed', result.reason || null, jobId]);
    return result;
  } catch (error) {
    if (jobId) await db.query("UPDATE work_score_jobs SET status='failed',reason=?,finished_at=UTC_TIMESTAMP() WHERE id=?",
      [error.status ? error.message : '评分未完成，请检查服务后由系统管理员手动重试。', jobId]);
    throw error;
  } finally {
    if (acquired) await db.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
    db.release();
  }
}

function startScheduler({ pool, generate, now = () => new Date(), logger = console }) {
  let busy = false;
  async function tick() {
    const start = scheduledWeek(now());
    if (!start || busy) return;
    busy = true;
    try {
      const [members] = await pool.query("SELECT m.user_id FROM work_members m JOIN app_users u ON u.id=m.user_id LEFT JOIN work_reports r ON r.user_id=m.user_id AND r.week_start=? WHERE m.active=1 AND m.workshop_code='qu_making' AND u.enabled=1 AND u.role='viewer' AND u.staff_workshop_code='qu_making' AND u.staff_position='group_leader' AND (r.status IS NULL OR r.status<>'published')", [start]);
      for (const member of members) {
        try { await runScore({ pool, generate, userId: member.user_id, start }); }
        catch { logger.error('Weekly work assessment failed for member', member.user_id); }
      }
    } catch { logger.error('Weekly work assessment scheduler failed'); }
    finally { busy = false; }
  }
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

module.exports = { scheduledWeek, runScore, startScheduler };
