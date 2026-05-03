from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import date, timedelta

REFERENCE_DATE = "2026-04-15"   # gaps tracked from this date
IST_TZ         = "Asia/Kolkata"

scheduler = BackgroundScheduler(timezone=IST_TZ)


def run_reminder_job():
    """Check every active user with email enabled; send reminder if today < 8h."""
    from app.db.queries import (
        get_users_for_notification, get_unfilled_weekdays,
        get_notification_settings, execute_query,
    )
    from app.services.email_service import send_timesheet_reminder

    settings = get_notification_settings()
    if not settings.get("enabled", True):
        return

    today     = date.today()
    today_str = str(today)

    # Only run on weekdays
    if today.weekday() >= 5:
        return

    yesterday = str(today - timedelta(days=1))

    users = get_users_for_notification()
    print(f"[scheduler] Reminder job running for {len(users)} users — {today_str}")

    for user in users:
        u = dict(user)
        # Today's hours
        row = execute_query(
            """SELECT COALESCE(SUM(hours), 0) AS h
                 FROM timesheet_entries
                WHERE user_id = %s AND entry_date = %s AND status != 'rejected'""",
            (u["user_id"], today_str), fetch_one=True,
        )
        today_hours = float(dict(row)["h"]) if row else 0.0

        # Skip if today is already filled
        if today_hours >= 8:
            continue

        # Gaps from reference date up to yesterday
        gaps = get_unfilled_weekdays(u["user_id"], REFERENCE_DATE, yesterday)

        send_timesheet_reminder(
            to_email    = u["email"],
            name        = u["full_name"],
            today_str   = today_str,
            today_hours = today_hours,
            gaps        = gaps,
        )


def _parse_time(hhmm: str):
    """Parse 'HH:MM' into (hour, minute) ints."""
    h, m = hhmm.split(":")
    return int(h), int(m)


def reschedule(morning_time: str = "09:30", evening_time: str = "22:00"):
    """Remove existing reminder jobs and re-add with new times."""
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


def start():
    from app.db.queries import get_notification_settings
    s = get_notification_settings()
    reschedule(s.get("morning_time", "09:30"), s.get("evening_time", "22:00"))
    if not scheduler.running:
        scheduler.start()
    print("[scheduler] Started.")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
