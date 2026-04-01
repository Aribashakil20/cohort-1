import sqlite3

conn = sqlite3.connect("audience.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_count INTEGER,
    male INTEGER,
    female INTEGER,
    engagement INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()