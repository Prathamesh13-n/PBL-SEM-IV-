import sqlite3

conn = sqlite3.connect("smartpark.db")
conn.row_factory = sqlite3.Row

def show(table):
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    print(f"\n{'='*50}")
    print(f"  TABLE: {table}  ({len(rows)} rows)")
    print(f"{'='*50}")
    for r in rows:
        print(dict(r))

show("users")
show("vehicles")
show("parking_sessions")
show("family_members")
show("parking_counter")

conn.close()