const {
    get_db_conn,
    create_user_db,
    insert_user,
    get_user,
    update_user,
    delete_user
} = require('./db_ops.js');

describe('Database Operations', () => {
    let connection;

    beforeAll(async () => {
        connection = await get_db_conn('root', 'goodyear');
        await create_user_db(connection);
    });

    beforeEach(async () => {
        await connection.query('USE user_db');
        // Clear the users table before each test
        await connection.query('DELETE FROM tbl_users');
    });

    afterAll(async () => {
        await connection.query('DROP DATABASE IF EXISTS user_db');
        if (connection) await connection.end();
    });

    test('should insert a new user', async () => {
        await insert_user(connection, 1, 'testuser', 1, 'testkey');
        const user = await get_user(connection, 1);
        expect(user).toHaveLength(1);
        expect(user[0].uname).toBe('testuser');
    });

    test('should get a user by id', async () => {
        await insert_user(connection, 1, 'testuser', 1, 'testkey');
        const user = await get_user(connection, 1);
        expect(user).toHaveLength(1);
        expect(user[0]).toEqual({
            uid: 1,
            uname: 'testuser',
            role_id: 1,
            encrypted_key: 'testkey'
        });
    });

    test('should update a user', async () => {
        await insert_user(connection, 1, 'testuser', 1, 'testkey');
        await update_user(connection, 1, { uname: 'updateduser' });
        const user = await get_user(connection, 1);
        expect(user[0].uname).toBe('updateduser');
    });

    test('should delete a user', async () => {
        await insert_user(connection, 1, 'testuser', 1, 'testkey');
        await delete_user(connection, 1);
        const user = await get_user(connection, 1);
        expect(user).toHaveLength(0);
    });
});
