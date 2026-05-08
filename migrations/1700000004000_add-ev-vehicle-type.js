/**
 * Add EV (Electric Vehicle) support to vehicle_profiles table.
 * - Adds EV-specific columns: battery_capacity_kwh, consumption_kwh_per_100km, charge_port_type, is_default
 * - Makes ICE-specific columns nullable (fuel_type, tank_capacity_liters, consumption_per_100km)
 * - Updates CHECK constraints to include 'ev' vehicle type and 'electric' fuel type
 * - Adds EV-specific CHECK constraints for battery, consumption, and charge port
 * - Adds partial index for default vehicle lookup
 */
exports.up = (pgm) => {
  // ============================================================
  // ADD EV-SPECIFIC COLUMNS
  // ============================================================
  pgm.addColumn('vehicle_profiles', {
    battery_capacity_kwh: {
      type: 'decimal(5,1)',
      default: null,
    },
    consumption_kwh_per_100km: {
      type: 'decimal(4,1)',
      default: null,
    },
    charge_port_type: {
      type: 'varchar(20)',
      default: null,
    },
    is_default: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // ============================================================
  // MAKE ICE-SPECIFIC COLUMNS NULLABLE (EV vehicles won't have them)
  // ============================================================
  pgm.alterColumn('vehicle_profiles', 'fuel_type', { notNull: false });
  pgm.alterColumn('vehicle_profiles', 'tank_capacity_liters', { notNull: false });
  pgm.alterColumn('vehicle_profiles', 'consumption_per_100km', { notNull: false });

  // ============================================================
  // UPDATE EXISTING CHECK CONSTRAINTS
  // ============================================================

  // Update vehicle_type constraint to include 'ev'
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_vehicle_type_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_vehicle_type_check', {
    check: "vehicle_type IN ('motorcycle', 'car', 'camper', 'ev')",
  });

  // Update fuel_type constraint to include 'electric' and allow NULL
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_fuel_type_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_fuel_type_check', {
    check: "fuel_type IN ('diesel', 'petrol_95', 'petrol_98', 'lpg', 'electric') OR fuel_type IS NULL",
  });

  // Update tank_capacity constraint to allow NULL
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_tank_capacity_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_tank_capacity_check', {
    check: 'tank_capacity_liters IS NULL OR tank_capacity_liters BETWEEN 5 AND 200',
  });

  // Update consumption constraint to allow NULL
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_consumption_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_consumption_check', {
    check: 'consumption_per_100km IS NULL OR consumption_per_100km BETWEEN 1 AND 50',
  });

  // ============================================================
  // ADD EV-SPECIFIC CHECK CONSTRAINTS
  // ============================================================
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_battery_capacity_check', {
    check: 'battery_capacity_kwh IS NULL OR battery_capacity_kwh BETWEEN 10 AND 200',
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_consumption_kwh_check', {
    check: 'consumption_kwh_per_100km IS NULL OR consumption_kwh_per_100km BETWEEN 5 AND 50',
  });

  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_charge_port_check', {
    check:
      "charge_port_type IS NULL OR charge_port_type IN ('Type1', 'Type2', 'CCS', 'CHAdeMO', 'Tesla')",
  });

  // ============================================================
  // ADD PARTIAL INDEX FOR DEFAULT VEHICLE LOOKUP
  // ============================================================
  pgm.createIndex('vehicle_profiles', ['user_id', 'is_default'], {
    name: 'idx_vehicle_profiles_user_default',
    where: 'is_default = true',
  });
};

exports.down = (pgm) => {
  // Drop partial index
  pgm.dropIndex('vehicle_profiles', ['user_id', 'is_default'], {
    name: 'idx_vehicle_profiles_user_default',
  });

  // Drop EV-specific constraints
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_charge_port_check');
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_consumption_kwh_check');
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_battery_capacity_check');

  // Restore original consumption constraint
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_consumption_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_consumption_check', {
    check: 'consumption_per_100km BETWEEN 1 AND 50',
  });

  // Restore original tank_capacity constraint
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_tank_capacity_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_tank_capacity_check', {
    check: 'tank_capacity_liters BETWEEN 5 AND 200',
  });

  // Restore original fuel_type constraint
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_fuel_type_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_fuel_type_check', {
    check: "fuel_type IN ('diesel', 'petrol_95', 'petrol_98', 'lpg')",
  });

  // Restore original vehicle_type constraint
  pgm.dropConstraint('vehicle_profiles', 'vehicle_profiles_vehicle_type_check');
  pgm.addConstraint('vehicle_profiles', 'vehicle_profiles_vehicle_type_check', {
    check: "vehicle_type IN ('motorcycle', 'car', 'camper')",
  });

  // Restore NOT NULL on ICE columns
  pgm.alterColumn('vehicle_profiles', 'fuel_type', { notNull: true });
  pgm.alterColumn('vehicle_profiles', 'tank_capacity_liters', { notNull: true });
  pgm.alterColumn('vehicle_profiles', 'consumption_per_100km', { notNull: true });

  // Drop EV-specific columns
  pgm.dropColumn('vehicle_profiles', 'is_default');
  pgm.dropColumn('vehicle_profiles', 'charge_port_type');
  pgm.dropColumn('vehicle_profiles', 'consumption_kwh_per_100km');
  pgm.dropColumn('vehicle_profiles', 'battery_capacity_kwh');
};
