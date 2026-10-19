"""Apply additive schema and local demo users. Never print or reset credentials/stock."""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def client(sql, *, admin=False):
    runtime = json.loads((ROOT/'state/runtime.json').read_text(encoding='utf-8-sig'))
    credentials = json.loads((ROOT/'state/mysql-connection.json').read_text(encoding='utf-8-sig'))
    env = os.environ.copy()
    env['MYSQL_PWD'] = credentials['root_password' if admin else 'password']
    args = [str(Path(runtime['mysql_home'])/'bin/mysql.exe'), '--no-defaults', '--protocol=TCP',
            '--host=127.0.0.1', f"--port={runtime['mysql_port']}",
            '--user=' + ('root' if admin else credentials['user']),
            '--default-character-set=utf8mb4', '--batch', '--skip-column-names', 'commerce']
    result = subprocess.run(args, input=sql, encoding='utf-8', env=env, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()

def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 210_000)
    return 'pbkdf2_sha256$210000$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


def initialize():
    for migration in sorted((ROOT/'infra/mysql').glob('[0-9][0-9][0-9]-*.sql')):
        client(migration.read_text(encoding='utf-8'), admin=True)

    writer_path = ROOT/'state/mysql-writer.json'
    if writer_path.exists():
        writer = json.loads(writer_path.read_text(encoding='utf-8'))
    else:
        writer = {'user': 'commerce_writer', 'password': secrets.token_hex(24), 'database': 'commerce'}
        writer_path.write_text(json.dumps(writer, indent=2) + '\n', encoding='utf-8')
    # Locally generated hex password is safe as a SQL literal; persisted data is validated.
    if writer['user'] != 'commerce_writer' or not all(c in '0123456789abcdef' for c in writer['password']):
        raise ValueError('Local writer configuration is invalid')
    password = writer['password']
    client(f"""
        CREATE USER IF NOT EXISTS 'commerce_writer'@'127.0.0.1' IDENTIFIED BY '{password}';
        GRANT SELECT ON commerce.product TO 'commerce_writer'@'127.0.0.1';
        GRANT SELECT, UPDATE ON commerce.inventory TO 'commerce_writer'@'127.0.0.1';
        GRANT SELECT ON commerce.lab_user TO 'commerce_writer'@'127.0.0.1';
        GRANT SELECT, INSERT, UPDATE ON commerce.commerce_order TO 'commerce_writer'@'127.0.0.1';
    """, admin=True)

    demo_path = ROOT/'state/demo-users.json'
    demos = json.loads(demo_path.read_text(encoding='utf-8')) if demo_path.exists() else {}
    changed = False
    for username in ('alice', 'bob'):
        exists = client(f"SELECT COUNT(*) FROM lab_user WHERE username='{username}';", admin=True) == '1'
        if exists:
            continue
        if username not in demos:
            demos[username] = secrets.token_urlsafe(24)
            changed = True
            # Persist first: an interrupted SQL call must not lose a generated password.
            demo_path.write_text(json.dumps(demos, indent=2) + '\n', encoding='utf-8')
        encoded = password_hash(demos[username])
        client(f"INSERT INTO lab_user(username,password_hash) VALUES ('{username}','{encoded}');", admin=True)
    if changed:
        demo_path.write_text(json.dumps(demos, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    initialize()
    print(client('SELECT p.id,p.sku,p.name,p.price,i.available_stock FROM product p JOIN inventory i ON i.product_id=p.id ORDER BY p.id;'))
    print('Schema ready; local demo credentials: state/demo-users.json (not displayed).')
