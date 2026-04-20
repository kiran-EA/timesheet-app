import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from app.core.config import settings

pool = SimpleConnectionPool(
    1, 20,
    host=settings.REDSHIFT_HOST,
    port=settings.REDSHIFT_PORT,
    database=settings.REDSHIFT_DATABASE,
    user=settings.REDSHIFT_USER,
    password=settings.REDSHIFT_PASSWORD,
    sslmode='require',
    options=f"-c search_path={settings.REDSHIFT_SCHEMA}",
    keepalives=1,
    keepalives_idle=30,
    keepalives_interval=10,
    keepalives_count=5,
)

def _get_healthy_conn():
    """Get a connection from the pool, replacing it if Neon closed it."""
    conn = pool.getconn()
    try:
        # Lightweight ping — detects stale connections instantly
        conn.cursor().execute("SELECT 1")
        return conn
    except Exception:
        # Connection is dead; discard it and open a fresh one
        try:
            pool.putconn(conn, close=True)
        except Exception:
            pass
        return pool.getconn()

@contextmanager
def get_db_cursor(commit=True):
    conn = _get_healthy_conn()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        yield cursor
        if commit:
            conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        pool.putconn(conn)

def execute_query(query: str, params: tuple = None, fetch_one=False, fetch_all=True):
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        if fetch_one:
            return cursor.fetchone()
        elif fetch_all:
            return cursor.fetchall()
        return None
