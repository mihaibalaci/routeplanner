/**
 * Add email confirmation fields to users table and confirmation_tokens table.
 */
exports.up = (pgm) => {
  // Add email_confirmed column to users
  pgm.addColumn('users', {
    email_confirmed: {
      type: 'boolean',
      default: false,
      notNull: true,
    },
  });

  // Create confirmation_tokens table
  pgm.createTable('confirmation_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    token: { type: 'varchar(255)', notNull: true, unique: true },
    expires_at: { type: 'timestamp', notNull: true },
    used: { type: 'boolean', default: false },
    created_at: { type: 'timestamp', default: pgm.func('NOW()') },
  });

  pgm.createIndex('confirmation_tokens', 'token', { name: 'idx_confirmation_tokens_token' });
  pgm.createIndex('confirmation_tokens', 'user_id', { name: 'idx_confirmation_tokens_user' });
};

exports.down = (pgm) => {
  pgm.dropTable('confirmation_tokens');
  pgm.dropColumn('users', 'email_confirmed');
};
