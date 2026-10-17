"""UTC timestamps compatible with existing naive database columns."""

from datetime import datetime, timezone


def utc_now_naive():
    """Return the current UTC instant as naive datetime (timestamp without time zone).

    The existing database columns store timezone-unaware datetimes. Keep that
    storage convention unchanged until an explicit, tested timezone migration.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
