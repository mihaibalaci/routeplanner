/**
 * Seed migration for vignette_countries table.
 * Populates the 9 European countries that require vignettes with their
 * available durations and motorcycle exemption status.
 */

const VIGNETTE_COUNTRIES = [
  {
    country_code: 'AT',
    country_name: 'Austria',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['10-day', '2-month', '1-year']),
  },
  {
    country_code: 'BG',
    country_name: 'Bulgaria',
    motorcycle_exempt: true,
    available_durations: JSON.stringify(['1-week', '1-month', '3-month', '1-year']),
  },
  {
    country_code: 'CZ',
    country_name: 'Czech Republic',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['10-day', '1-month', '1-year']),
  },
  {
    country_code: 'HU',
    country_name: 'Hungary',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['10-day', '1-month', '1-year']),
  },
  {
    country_code: 'MD',
    country_name: 'Moldova',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['10-day', '1-month', '1-year']),
  },
  {
    country_code: 'RO',
    country_name: 'Romania',
    motorcycle_exempt: true,
    available_durations: JSON.stringify(['1-week', '1-month', '3-month', '1-year']),
  },
  {
    country_code: 'SK',
    country_name: 'Slovakia',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['10-day', '1-month', '1-year']),
  },
  {
    country_code: 'SI',
    country_name: 'Slovenia',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['1-week', '1-month', '6-month', '1-year']),
  },
  {
    country_code: 'CH',
    country_name: 'Switzerland',
    motorcycle_exempt: false,
    available_durations: JSON.stringify(['1-year']),
  },
];

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  for (const country of VIGNETTE_COUNTRIES) {
    pgm.sql(`
      INSERT INTO vignette_countries (country_code, country_name, motorcycle_exempt, available_durations, active, updated_at)
      VALUES (
        '${country.country_code}',
        '${country.country_name}',
        ${country.motorcycle_exempt},
        '${country.available_durations}'::jsonb,
        true,
        NOW()
      )
      ON CONFLICT (country_code) DO NOTHING;
    `);
  }
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  const codes = VIGNETTE_COUNTRIES.map((c) => `'${c.country_code}'`).join(', ');
  pgm.sql(`DELETE FROM vignette_countries WHERE country_code IN (${codes});`);
};
