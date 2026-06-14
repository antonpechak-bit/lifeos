// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseAdmin,
  cronWeekPeriod,
  prevMonthPeriod,
  prevQuarterPeriod,
  prevYearPeriod,
  periodSummaryExists,
  weekSummaryExists,
  generateWeekSummary,
  generateMonthSummary,
  generateQuarterSummary,
  generateYearSummary,
} from '@/lib/period-summary'

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Determine what to generate based on UTC date ──────────────
  const now   = new Date()
  const day   = now.getUTCDay()    // 0=Sun … 6=Sat
  const date  = now.getUTCDate()   // 1-31
  const month = now.getUTCMonth()  // 0-11

  const doWeek    = day === 0
  const doMonth   = date === 1
  const doQuarter = date === 1 && [0, 3, 6, 9].includes(month) // Jan/Apr/Jul/Oct 1st
  const doYear    = date === 1 && month === 0                   // Jan 1st

  if (!doWeek && !doMonth) {
    return NextResponse.json({ ran: false, reason: 'nothing_to_do_today' })
  }

  // ── List all users ────────────────────────────────────────────
  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (usersError) {
    console.error('Cron: listUsers error', usersError)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
  const users = usersData?.users || []

  // ── Pre-compute period boundaries (same for all users) ────────
  const week    = doWeek    ? cronWeekPeriod()     : null
  const mPeriod = doMonth   ? prevMonthPeriod()    : null
  const qPeriod = doQuarter ? prevQuarterPeriod()  : null
  const yPeriod = doYear    ? prevYearPeriod()     : null

  // ── Stats tracking ────────────────────────────────────────────
  const stats = {
    users_total:    users.length,
    users_ran:      0,
    generated:      { week: 0, month: 0, quarter: 0, year: 0 },
    skipped:        { week: 0, month: 0, quarter: 0, year: 0 },
  }
  const errors: { userId: string; step: string; error: string }[] = []

  // ── Process each user sequentially (Tier 1 rate limit) ────────
  for (const user of users) {
    const uid = user.id
    let didAnything = false

    try {
      // Week
      if (doWeek && week) {
        const exists = await weekSummaryExists(uid, week.weekStart)
        if (exists) {
          stats.skipped.week++
        } else {
          const res = await generateWeekSummary(uid, week.weekStart, week.weekEnd)
          if (res.generated) { stats.generated.week++; didAnything = true }
          else stats.skipped.week++ // no data
        }
      }

      // Month
      if (doMonth && mPeriod) {
        const exists = await periodSummaryExists(uid, 'month', mPeriod.periodStart)
        if (exists) {
          stats.skipped.month++
        } else {
          const res = await generateMonthSummary(uid, mPeriod.periodStart, mPeriod.periodEnd, mPeriod.label)
          if (res.generated) { stats.generated.month++; didAnything = true }
        }
      }

      // Quarter
      if (doQuarter && qPeriod) {
        const exists = await periodSummaryExists(uid, 'quarter', qPeriod.periodStart)
        if (exists) {
          stats.skipped.quarter++
        } else {
          const res = await generateQuarterSummary(uid, qPeriod.periodStart, qPeriod.periodEnd, qPeriod.label)
          if (res.generated) { stats.generated.quarter++; didAnything = true }
        }
      }

      // Year
      if (doYear && yPeriod) {
        const exists = await periodSummaryExists(uid, 'year', yPeriod.periodStart)
        if (exists) {
          stats.skipped.year++
        } else {
          const res = await generateYearSummary(uid, yPeriod.periodStart, yPeriod.periodEnd, yPeriod.label)
          if (res.generated) { stats.generated.year++; didAnything = true }
        }
      }

      if (didAnything) stats.users_ran++

    } catch (e) {
      console.error(`Cron: error for user ${uid}:`, e)
      errors.push({ userId: uid, step: 'unknown', error: String(e?.message || e) })
    }

    // Small pause between users to respect Anthropic rate limits
    await new Promise(r => setTimeout(r, 800))
  }

  return NextResponse.json({
    ran: true,
    utc_date: now.toISOString().slice(0, 10),
    generated: stats.generated,
    skipped: stats.skipped,
    users_total: stats.users_total,
    users_ran: stats.users_ran,
    errors: errors.length > 0 ? errors : undefined,
  })
}
