/**
 * Initial database schema migration for Route Planner Platform.
 * Creates all tables, indexes, and constraints as defined in the design document.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // ============================================================
  // USERS
  // ============================================================
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      comment: 'NULL for SSO-only users',
    },
    display_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    failed_login_attempts: {
      type: 'integer',
      default: 0,
    },
    locked_until: {
      type: 'timestamp',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('users', 'email', { name: 'idx_users_email' });

  // ============================================================
  // AUTH IDENTITIES (SSO providers)
  // ============================================================
  pgm.createTable('auth_identities', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    provider: {
      type: 'varchar(20)',
      notNull: true,
    },
    provider_user_id: {
      type: 'varchar(255)',
      notNull: true,
    },
    provider_email: {
      type: 'varchar(255)',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('auth_identities', 'auth_identities_provider_user_unique', {
    unique: ['provider', 'provider_user_id'],
  });

  // ============================================================
  // VEHICLE PROFILES
  // ============================================================
  pgm.createTable('vehicle_profiles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    vehicle_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    fuel_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    tank_capacity_liters: {
      type: 'decimal(5,1)',
      notNull: true,
    },
    consumption_per_100km: {
      type: 'decimal(4,1)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_vehicle_type_check', {
    check: "vehicle_type IN ('motorcycle', 'car', 'camper')",
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_fuel_type_check', {
    check: "fuel_type IN ('diesel', 'petrol_95', 'petrol_98', 'lpg')",
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_tank_capacity_check', {
    check: 'tank_capacity_liters BETWEEN 5 AND 200',
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_consumption_check', {
    check: 'consumption_per_100km BETWEEN 1 AND 50',
  });

  pgm.createIndex('vehicle_profiles', 'user_id', { name: 'idx_vehicle_profiles_user' });

  // ============================================================
  // ROUTES
  // ============================================================
  pgm.createTable('routes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(200)',
    },
    total_distance_km: {
      type: 'decimal(10,2)',
    },
    total_duration_seconds: {
      type: 'integer',
    },
    polyline_encoded: {
      type: 'text',
    },
    status: {
      type: 'varchar(20)',
      default: "'draft'",
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('routes', 'routes_status_check', {
    check: "status IN ('draft', 'calculated', 'finalized')",
  });

  pgm.createIndex('routes', ['user_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_routes_user_created',
  });

  // ============================================================
  // WAYPOINTS
  // ============================================================
  pgm.createTable('waypoints', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    route_id: {
      type: 'uuid',
      notNull: true,
      references: 'routes(id)',
      onDelete: 'CASCADE',
    },
    position: {
      type: 'integer',
      notNull: true,
    },
    label: {
      type: 'varchar(200)',
    },
    latitude: {
      type: 'decimal(10,7)',
      notNull: true,
    },
    longitude: {
      type: 'decimal(10,7)',
      notNull: true,
    },
    place_id: {
      type: 'varchar(255)',
    },
    formatted_address: {
      type: 'varchar(500)',
    },
    waypoint_type: {
      type: 'varchar(20)',
      notNull: true,
    },
  });

  pgm.addConstraint('waypoints', 'waypoints_type_check', {
    check: "waypoint_type IN ('origin', 'stop', 'destination')",
  });

  pgm.addConstraint('waypoints', 'waypoints_route_position_unique', {
    unique: ['route_id', 'position'],
  });

  pgm.createIndex('waypoints', ['route_id', 'position'], {
    name: 'idx_waypoints_route',
  });

  // ============================================================
  // ROUTE SEGMENTS
  // ============================================================
  pgm.createTable('route_segments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    route_id: {
      type: 'uuid',
      notNull: true,
      references: 'routes(id)',
      onDelete: 'CASCADE',
    },
    segment_index: {
      type: 'integer',
      notNull: true,
    },
    start_waypoint_id: {
      type: 'uuid',
      references: 'waypoints(id)',
    },
    end_waypoint_id: {
      type: 'uuid',
      references: 'waypoints(id)',
    },
    distance_km: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    duration_seconds: {
      type: 'integer',
      notNull: true,
    },
    country_code: {
      type: 'varchar(2)',
      notNull: true,
    },
    polyline_encoded: {
      type: 'text',
    },
  });

  pgm.addConstraint('route_segments', 'route_segments_route_index_unique', {
    unique: ['route_id', 'segment_index'],
  });

  // ============================================================
  // FUEL PRICES
  // ============================================================
  pgm.createTable('fuel_prices', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    country_code: {
      type: 'varchar(2)',
      notNull: true,
    },
    fuel_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    price_per_liter_eur: {
      type: 'decimal(5,3)',
      notNull: true,
    },
    source: {
      type: 'varchar(30)',
      notNull: true,
    },
    fetched_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamp',
      notNull: true,
    },
  });

  pgm.addConstraint('fuel_prices', 'fuel_prices_country_type_source_unique', {
    unique: ['country_code', 'fuel_type', 'source'],
  });

  pgm.createIndex('fuel_prices', ['country_code', 'fuel_type', 'expires_at'], {
    name: 'idx_fuel_prices_lookup',
  });

  // ============================================================
  // TRIP COSTS
  // ============================================================
  pgm.createTable('trip_costs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    route_id: {
      type: 'uuid',
      notNull: true,
      references: 'routes(id)',
      onDelete: 'CASCADE',
    },
    vehicle_profile_id: {
      type: 'uuid',
      notNull: true,
      references: 'vehicle_profiles(id)',
    },
    total_cost_eur: {
      type: 'decimal(8,2)',
      notNull: true,
    },
    total_fuel_liters: {
      type: 'decimal(8,2)',
      notNull: true,
    },
    country_breakdown: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    calculated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    prices_outdated: {
      type: 'boolean',
      default: false,
    },
  });

  // ============================================================
  // FUEL STATIONS
  // ============================================================
  pgm.createTable('fuel_stations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    latitude: {
      type: 'decimal(10,7)',
      notNull: true,
    },
    longitude: {
      type: 'decimal(10,7)',
      notNull: true,
    },
    country_code: {
      type: 'varchar(2)',
      notNull: true,
    },
    place_id: {
      type: 'varchar(255)',
    },
    fuel_types_available: {
      type: 'jsonb',
      default: pgm.func("'[]'::jsonb"),
    },
  });

  // Spatial index using lat/lng composite index (PostGIS GIST index as fallback comment)
  // If PostGIS is available, use: CREATE INDEX idx_fuel_stations_location ON fuel_stations USING GIST (ST_MakePoint(longitude, latitude));
  pgm.createIndex('fuel_stations', ['latitude', 'longitude'], {
    name: 'idx_fuel_stations_location',
  });

  pgm.createIndex('fuel_stations', 'country_code', {
    name: 'idx_fuel_stations_country',
  });

  // ============================================================
  // REFUEL STOPS
  // ============================================================
  pgm.createTable('refuel_stops', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    route_id: {
      type: 'uuid',
      notNull: true,
      references: 'routes(id)',
      onDelete: 'CASCADE',
    },
    fuel_station_id: {
      type: 'uuid',
      notNull: true,
      references: 'fuel_stations(id)',
    },
    position_in_route: {
      type: 'integer',
      notNull: true,
    },
    fuel_price_eur: {
      type: 'decimal(5,3)',
    },
    status: {
      type: 'varchar(20)',
      default: "'suggested'",
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('refuel_stops', 'refuel_stops_status_check', {
    check: "status IN ('suggested', 'accepted', 'rejected')",
  });

  // ============================================================
  // VIGNETTE COUNTRIES
  // ============================================================
  pgm.createTable('vignette_countries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    country_code: {
      type: 'varchar(2)',
      notNull: true,
      unique: true,
    },
    country_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    motorcycle_exempt: {
      type: 'boolean',
      default: false,
    },
    available_durations: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    active: {
      type: 'boolean',
      default: true,
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('vignette_countries', 'country_code', {
    name: 'idx_vignette_countries_code',
  });

  // ============================================================
  // VIGNETTE PRICES
  // ============================================================
  pgm.createTable('vignette_prices', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    vignette_country_id: {
      type: 'uuid',
      notNull: true,
      references: 'vignette_countries(id)',
      onDelete: 'CASCADE',
    },
    vehicle_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    duration: {
      type: 'varchar(20)',
      notNull: true,
    },
    price_eur: {
      type: 'decimal(7,2)',
      notNull: true,
    },
    source: {
      type: 'varchar(30)',
      notNull: true,
    },
    fetched_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamp',
      notNull: true,
    },
  });

  pgm.addConstraint('vignette_prices', 'vignette_prices_vehicle_type_check', {
    check: "vehicle_type IN ('motorcycle', 'car', 'camper')",
  });

  pgm.addConstraint('vignette_prices', 'vignette_prices_duration_check', {
    check: "duration IN ('1-day', '10-day', '1-week', '1-month', '2-month', '3-month', '6-month', '1-year')",
  });

  pgm.addConstraint('vignette_prices', 'vignette_prices_source_check', {
    check: "source IN ('i-vignette', 'vintrica')",
  });

  pgm.addConstraint('vignette_prices', 'vignette_prices_country_vehicle_duration_source_unique', {
    unique: ['vignette_country_id', 'vehicle_type', 'duration', 'source'],
  });

  pgm.createIndex('vignette_prices', ['vignette_country_id', 'vehicle_type', 'duration'], {
    name: 'idx_vignette_prices_lookup',
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropTable('vignette_prices', { cascade: true });
  pgm.dropTable('vignette_countries', { cascade: true });
  pgm.dropTable('refuel_stops', { cascade: true });
  pgm.dropTable('fuel_stations', { cascade: true });
  pgm.dropTable('trip_costs', { cascade: true });
  pgm.dropTable('fuel_prices', { cascade: true });
  pgm.dropTable('route_segments', { cascade: true });
  pgm.dropTable('waypoints', { cascade: true });
  pgm.dropTable('routes', { cascade: true });
  pgm.dropTable('vehicle_profiles', { cascade: true });
  pgm.dropTable('auth_identities', { cascade: true });
  pgm.dropTable('users', { cascade: true });
};
