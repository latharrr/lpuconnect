import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./uniconnect.sqlite');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (e, tables) => {
    console.log('=== TABLES ===');
    tables.forEach(t => console.log('  -', t.name));

    db.all('SELECT * FROM users', (e, users) => {
        console.log('\n=== USERS (' + users.length + ' total) ===');
        users.forEach(u => console.log('  ', u.email, '|', u.name, '|', u.gender, '|', u.bio || '(no bio)', '|', u.created_at));

        db.all('SELECT * FROM friends', (e, friends) => {
            console.log('\n=== FRIENDS (' + friends.length + ' total) ===');
            friends.forEach(f => console.log('  ', f.user_id_1, '<->', f.user_id_2, '|', f.created_at));
            db.close();
        });
    });
});
