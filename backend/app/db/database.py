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
    sslmode='require'
)

@contextmanager
def get_db_connection():
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {settings.REDSHIFT_SCHEMA}")
        conn.commit()
        yield conn
    finally:
        pool.putconn(conn)

@contextmanager
def get_db_cursor(commit=True):
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()

def execute_query(query: str, params: tuple = None, fetch_one=False, fetch_all=True):
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        if fetch_one:
            return cursor.fetchone()
        elif fetch_all:
            return cursor.fetchall()
        return None
