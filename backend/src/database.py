import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
except ImportError:
    pass
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
