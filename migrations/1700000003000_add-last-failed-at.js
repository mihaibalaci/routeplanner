/**
 * Add last_failed_at column to users table for sliding-window lockout tracking.
 * This column records the timestamp of the most recent failed login attempt,
 * enabling the 60-minute sliding window calculation.
 */
exports.up = (pgm) => {
  pgm.addColumn('users', {
    last_failed_at: {
      type: 'timestamp',
      default: null,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'last_failed_at');
};
