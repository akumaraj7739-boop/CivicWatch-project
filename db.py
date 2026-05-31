import sqlite3
import os
import uuid
import hashlib
import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'civicwatch.db')

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    db_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + '$' + db_hash.hex()

def verify_password(password: str, hashed: str) -> bool:
    try:
        salt_hex, hash_hex = hashed.split('$')
        salt = bytes.fromhex(salt_hex)
        db_hash = bytes.fromhex(hash_hex)
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return new_hash == db_hash
    except Exception:
        return False

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0
    )
    ''')
    
    # Safe In-place Migration Check: Add is_admin column if missing in existing DB
    cursor.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'is_admin' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        image_path TEXT,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        FOREIGN KEY(author_id) REFERENCES users(id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(post_id) REFERENCES posts(id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS likes (
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        PRIMARY KEY(user_id, post_id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(post_id) REFERENCES posts(id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        risk_level TEXT NOT NULL, -- 'high', 'warning', 'info'
        created_at TEXT NOT NULL
    )
    ''')
    
    conn.commit()
    
    # Check if we should seed initial data
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)
    else:
        # If database already exists, make sure administrator user is seeded
        cursor.execute("SELECT 1 FROM users WHERE id = 'admin'")
        if not cursor.fetchone():
            now = datetime.datetime.now().isoformat()
            cursor.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)", 
                           ('admin', 'Administrator', 'admin@civicwatch.org', hash_password('admin123'), now, 1))
            conn.commit()
        
    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    now = datetime.datetime.now().isoformat()
    
    # Seed users (Rajesh, Priya, Amit, Neha with is_admin=0, and Admin with is_admin=1)
    users = [
        ('user1', 'Rajesh Kumar', 'rajesh@example.com', hash_password('password123'), now, 0),
        ('user2', 'Priya Singh', 'priya@example.com', hash_password('password123'), now, 0),
        ('user3', 'Amit Sharma', 'amit@example.com', hash_password('password123'), now, 0),
        ('user4', 'Neha Verma', 'neha@example.com', hash_password('password123'), now, 0),
        ('admin', 'Administrator', 'admin@civicwatch.org', hash_password('admin123'), now, 1)
    ]
    cursor.executemany("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)", users)
    
    # Seed posts (with counts matching mockup screenshot)
    posts = [
        (
            'post1', 
            'Multiple chain snatching incidents reported near railway station',
            'Three separate incidents of chain snatching have been reported in the last 48 hours near Sitamarhi railway station. Local residents are demanding increased police patrolling in the area.',
            'Crime',
            'Sitamarhi, Bihar',
            '/uploads/justice_scale.png',
            'user1',
            (datetime.datetime.now() - datetime.timedelta(hours=2)).isoformat(),
            234,
            45
        ),
        (
            'post2', 
            'Severe water scarcity in sector 4',
            'Residents of Sector 4 have been facing low water pressure and muddy water supply for the past week. Municipal tankers are failing to meet the demand, forcing residents to buy water privately.',
            'Water Crisis',
            'Sector 4, Noida',
            '/uploads/water_crisis.png',
            'user2',
            (datetime.datetime.now() - datetime.timedelta(hours=5)).isoformat(),
            987,
            12
        ),
        (
            'post3', 
            'Street lights non-functional on Main Avenue',
            'Over 10 street lights have been completely broken for two weeks, making the street pitch black after 7 PM. This has raised major safety concerns for women and elderly residents.',
            'Street Lighting',
            'Main Avenue, Bengaluru',
            '/uploads/broken_lights.png',
            'user3',
            (datetime.datetime.now() - datetime.timedelta(hours=10)).isoformat(),
            543,
            8
        ),
        (
            'post4', 
            'Frequent Power Outages during study hours',
            'Daily power cuts lasting 3-4 hours are affecting students preparing for exams in Ward 5. Inverters are running out and the grid department has not given any schedule.',
            'Power Outage',
            'Ward 5, Patna',
            '/uploads/power_outage.png',
            'user4',
            (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat(),
            756,
            24
        )
    ]
    cursor.executemany("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", posts)
    
    # Seed comments for post1 to match the mockup
    comments = [
        (str(uuid.uuid4()), 'post1', 'Priya Singh', 'This is extremely alarming. Police must patrol the area after dark.', (datetime.datetime.now() - datetime.timedelta(minutes=90)).isoformat()),
        (str(uuid.uuid4()), 'post1', 'Amit Sharma', 'My neighbor was also targeted last week. Please stay alert everyone.', (datetime.datetime.now() - datetime.timedelta(minutes=45)).isoformat()),
        (str(uuid.uuid4()), 'post2', 'Neha Verma', 'We tried contacting the ward officer, but no action yet.', (datetime.datetime.now() - datetime.timedelta(hours=4)).isoformat())
    ]
    cursor.executemany("INSERT INTO comments VALUES (?, ?, ?, ?, ?)", comments)
    
    # Seed likes for Rajesh, Priya etc.
    likes = [
        ('user2', 'post1'),
        ('user3', 'post1'),
        ('user1', 'post2'),
        ('user4', 'post3')
    ]
    cursor.executemany("INSERT INTO likes VALUES (?, ?)", likes)
    
    # Seed alerts (matching mockup screenshot)
    alerts = [
        (
            'alert1', 
            'Flash flood warning in Muzaffarpur',
            'Heavy rain upstream has triggered a critical flood warning. Residents in low-lying areas should evacuate or move to upper floors immediately.',
            'high',
            (datetime.datetime.now() - datetime.timedelta(hours=2)).isoformat()
        ),
        (
            'alert2', 
            'Traffic diversion on NH 77',
            'Due to waterlogging and pavement damage, heavy vehicles on NH 77 are diverted to State Highway 12.',
            'info',
            (datetime.datetime.now() - datetime.timedelta(hours=4)).isoformat()
        ),
        (
            'alert3', 
            'Power cut scheduled tomorrow',
            'Grid maintenance is scheduled in Sectors 2, 4 and 6 on June 1st from 9 AM to 1 PM.',
            'warning',
            (datetime.datetime.now() - datetime.timedelta(hours=6)).isoformat()
        )
    ]
    cursor.executemany("INSERT INTO alerts VALUES (?, ?, ?, ?, ?)", alerts)
    
    conn.commit()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully!")
