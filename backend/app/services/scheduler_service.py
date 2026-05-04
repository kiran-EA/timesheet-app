from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import timedelta
import pytz

REFERENCE_DATE = "2026-04-15"
IST_TZ         = "Asia/Kolkata"
_IST           = pytz.timezone(IST_TZ)

scheduler = BackgroundScheduler(timezone=IST_TZ)



def run_reminder_job() -> dict:
    """Check every active user with email enabled; send reminder if today < 8h.
    Returns a summary dict with sent/skipped/failed counts."""
    from datetime import datetime
    from app.db.queries import (
        get_users_for_notification, get_unfilled_weekdays,
        get_notification_settings, execute_query,
    )
    from app.services.email_service import send_timesheet_reminder

    settings = get_notification_settings()
    if not settings.get("enabled", True):
        print("[scheduler] Notifications globally disabled — skipping.")
        return {"status": "skipped", "reason": "globally disabled", "sent": 0, "failed": 0, "skipped": 0}

    # Use IST date so Render (UTC) doesn't trigger weekend check on Sunday UTC = Monday IST
    today     = datetime.now(_IST).date()
    today_str = str(today)

    if today.weekday() >= 5:
        print(f"[scheduler] Weekend ({today_str} IST) — skipping.")
        return {"status": "skipped", "reason": "weekend", "sent": 0, "failed": 0, "skipped": 0}

    yesterday = str(today - timedelta(days=1))
    users     = get_users_for_notification()
    print(f"[scheduler] Reminder job: {len(users)} eligible users — {today_str}")

    sent = failed = skipped = 0
    errors = []

    from app.services.chat_service import send_dm

    for user in users:
        u = dict(user)
        row = execute_query(
            """SELECT COALESCE(SUM(hours), 0) AS h
                 FROM timesheet_entries
                WHERE user_id = %s AND entry_date = %s AND status != 'rejected'""",
            (u["user_id"], today_str), fetch_one=True,
        )
        today_hours = float(dict(row)["h"]) if row else 0.0

        if today_hours >= 8:
            skipped += 1
            continue

        gaps = get_unfilled_weekdays(u["user_id"], REFERENCE_DATE, yesterday)

        email_ok = send_timesheet_reminder(
            to_email    = u["email"],
            name        = u["full_name"],
            today_str   = today_str,
            today_hours = today_hours,
            gaps        = gaps,
        )
        chat_ok = send_dm(
            user_email  = u["email"],
            name        = u["full_name"],
            today       = today_str,
            today_hours = today_hours,
            gaps        = gaps,
        )
        if email_ok or chat_ok:
            sent += 1
        else:
            failed += 1
            errors.append(u["email"])

    print(f"[scheduler] Done — sent={sent}, skipped={skipped}, failed={failed}")
    return {"status": "done", "sent": sent, "skipped": skipped, "failed": failed, "errors": errors}


def run_weekly_summary_job() -> dict:
    """Every Monday morning: post last week's hours summary to the shared Chat space."""
    from datetime import datetime
    from app.services.chat_service import send_weekly_summary
    from app.db.queries import get_weekly_hours_summary

    today      = datetime.now(_IST).date()
    week_end   = today - timedelta(days=3)   # last Friday
    week_start = week_end - timedelta(days=4) # last Monday
    print(f"[scheduler] Weekly summary: {week_start} → {week_end}")

    users_data = get_weekly_hours_summary(str(week_start), str(week_end))
    ok = send_weekly_summary(str(week_start), str(week_end), users_data)
    return {"status": "sent" if ok else "failed", "week_start": str(week_start), "week_end": str(week_end)}


def _parse_time(hhmm: str):
    h, m = hhmm.split(":")
    return int(h), int(m)


def reschedule(morning_time: str = "09:30", evening_time: str = "22:00"):
    for job_id in ("reminder_morning", "reminder_evening"):
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

    mh, mm = _parse_time(morning_time)
    eh, em = _parse_time(evening_time)

    scheduler.add_job(
        run_reminder_job, CronTrigger(hour=mh, minute=mm, timezone=IST_TZ),
        id="reminder_morning", replace_existing=True,
        name=f"Morning reminder {morning_time} IST",
    )
    scheduler.add_job(
        run_reminder_job, CronTrigger(hour=eh, minute=em, timezone=IST_TZ),
        id="reminder_evening", replace_existing=True,
        name=f"Evening reminder {evening_time} IST",
    )
    print(f"[scheduler] Jobs set — morning {morning_time} IST, evening {evening_time} IST")


def reschedule_weekly(weekly_time: str = "09:30"):
    if scheduler.get_job("weekly_summary"):
        scheduler.remove_job("weekly_summary")
    wh, wm = _parse_time(weekly_time)
    scheduler.add_job(
        run_weekly_summary_job,
        CronTrigger(day_of_week="mon", hour=wh, minute=wm, timezone=IST_TZ),
        id="weekly_summary", replace_existing=True,
        name=f"Weekly summary Monday {weekly_time} IST",
    )
    print(f"[scheduler] Weekly summary job set — Monday {weekly_time} IST")


def start():
    from app.db.queries import get_notification_settings
    s = get_notification_settings()
    reschedule(s.get("morning_time", "09:30"), s.get("evening_time", "22:00"))
    reschedule_weekly("09:30")
    if not scheduler.running:
        scheduler.start()
    print("[scheduler] Started.")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
