import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:XgBS8CEpEVRim8jG@db.clukfafywaqbaohbowsv.supabase.co:5432/postgres')

@contextmanager
def get_db():
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
