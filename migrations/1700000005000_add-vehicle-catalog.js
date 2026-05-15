/**
 * Add vehicle_catalog table for brand/model suggestions.
 */
exports.up = (pgm) => {
  pgm.createTable('vehicle_catalog', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    vehicle_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    brand: {
      type: 'varchar(100)',
      notNull: true,
    },
    model: {
      type: 'varchar(100)',
      notNull: true,
    },
    year_from: {
      type: 'integer',
    },
    year_to: {
      type: 'integer',
    },
    fuel_type: {
      type: 'varchar(20)',
    },
    avg_consumption: {
      type: 'decimal(5,1)',
    },
    battery_capacity_kwh: {
      type: 'decimal(5,1)',
    },
  });

  pgm.createIndex('vehicle_catalog', ['vehicle_type', 'brand'], {
    name: 'idx_vehicle_catalog_type_brand',
  });

  // Seed car brands/models
  const cars = [
    ['Volkswagen', 'Golf', 'petrol_95', 6.5],
    ['Volkswagen', 'Passat', 'diesel', 5.8],
    ['Volkswagen', 'Polo', 'petrol_95', 5.5],
    ['BMW', '3 Series', 'diesel', 5.5],
    ['BMW', '5 Series', 'diesel', 6.2],
    ['BMW', 'X3', 'diesel', 7.0],
    ['Mercedes-Benz', 'C-Class', 'diesel', 5.8],
    ['Mercedes-Benz', 'E-Class', 'diesel', 6.5],
    ['Audi', 'A3', 'petrol_95', 6.0],
    ['Audi', 'A4', 'diesel', 5.5],
    ['Audi', 'A6', 'diesel', 6.0],
    ['Toyota', 'Corolla', 'petrol_95', 5.8],
    ['Toyota', 'Camry', 'petrol_95', 6.5],
    ['Toyota', 'RAV4', 'petrol_95', 7.5],
    ['Honda', 'Civic', 'petrol_95', 6.0],
    ['Ford', 'Focus', 'petrol_95', 6.2],
    ['Ford', 'Mondeo', 'diesel', 5.5],
    ['Skoda', 'Octavia', 'diesel', 5.2],
    ['Skoda', 'Superb', 'diesel', 5.8],
    ['Renault', 'Megane', 'diesel', 5.5],
    ['Peugeot', '308', 'diesel', 5.0],
    ['Opel', 'Astra', 'petrol_95', 6.0],
    ['Hyundai', 'i30', 'petrol_95', 6.0],
    ['Kia', 'Ceed', 'petrol_95', 6.2],
    ['Fiat', '500', 'petrol_95', 4.5],
  ];

  for (const [brand, model, fuel, consumption] of cars) {
    pgm.sql(`INSERT INTO vehicle_catalog (vehicle_type, brand, model, fuel_type, avg_consumption) VALUES ('car', '${brand}', '${model}', '${fuel}', ${consumption})`);
  }

  // Seed motorcycle brands/models
  const motorcycles = [
    ['BMW', 'R 1250 GS', 'petrol_95', 5.0],
    ['BMW', 'F 900 R', 'petrol_95', 4.2],
    ['Honda', 'CB650R', 'petrol_95', 4.5],
    ['Honda', 'Africa Twin', 'petrol_95', 5.2],
    ['Yamaha', 'MT-07', 'petrol_95', 4.0],
    ['Yamaha', 'Tracer 9', 'petrol_95', 4.8],
    ['Kawasaki', 'Z650', 'petrol_95', 4.2],
    ['Kawasaki', 'Versys 650', 'petrol_95', 4.5],
    ['Ducati', 'Monster', 'petrol_95', 5.5],
    ['KTM', '890 Adventure', 'petrol_95', 4.8],
  ];

  for (const [brand, model, fuel, consumption] of motorcycles) {
    pgm.sql(`INSERT INTO vehicle_catalog (vehicle_type, brand, model, fuel_type, avg_consumption) VALUES ('motorcycle', '${brand}', '${model}', '${fuel}', ${consumption})`);
  }

  // Seed camper brands/models
  const campers = [
    ['Fiat', 'Ducato', 'diesel', 10.5],
    ['Mercedes-Benz', 'Sprinter', 'diesel', 11.0],
    ['Volkswagen', 'California', 'diesel', 8.5],
    ['Ford', 'Transit', 'diesel', 10.0],
    ['Hymer', 'B-Class', 'diesel', 12.0],
    ['Knaus', 'BoxStar', 'diesel', 9.5],
  ];

  for (const [brand, model, fuel, consumption] of campers) {
    pgm.sql(`INSERT INTO vehicle_catalog (vehicle_type, brand, model, fuel_type, avg_consumption) VALUES ('camper', '${brand}', '${model}', '${fuel}', ${consumption})`);
  }

  // Seed EV brands/models
  const evs = [
    ['Tesla', 'Model 3', 'electric', 14.5, 60],
    ['Tesla', 'Model Y', 'electric', 16.0, 75],
    ['Tesla', 'Model S', 'electric', 18.0, 100],
    ['BMW', 'iX3', 'electric', 18.5, 80],
    ['BMW', 'i4', 'electric', 16.0, 84],
    ['BMW', 'iX', 'electric', 21.0, 112],
    ['Mercedes-Benz', 'EQC', 'electric', 21.5, 80],
    ['Mercedes-Benz', 'EQS', 'electric', 18.0, 108],
    ['Volkswagen', 'ID.3', 'electric', 15.5, 58],
    ['Volkswagen', 'ID.4', 'electric', 17.5, 77],
    ['Hyundai', 'Ioniq 5', 'electric', 17.0, 73],
    ['Hyundai', 'Kona Electric', 'electric', 14.5, 64],
    ['Kia', 'EV6', 'electric', 17.0, 77],
    ['Audi', 'e-tron', 'electric', 22.0, 95],
    ['Audi', 'Q4 e-tron', 'electric', 18.0, 77],
    ['Peugeot', 'e-208', 'electric', 15.0, 50],
    ['Renault', 'Megane E-Tech', 'electric', 16.0, 60],
    ['Nissan', 'Leaf', 'electric', 17.0, 40],
    ['Ford', 'Mustang Mach-E', 'electric', 18.5, 91],
    ['Skoda', 'Enyaq iV', 'electric', 17.0, 77],
  ];

  for (const [brand, model, fuel, consumption, battery] of evs) {
    pgm.sql(`INSERT INTO vehicle_catalog (vehicle_type, brand, model, fuel_type, avg_consumption, battery_capacity_kwh) VALUES ('ev', '${brand}', '${model}', '${fuel}', ${consumption}, ${battery})`);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('vehicle_catalog', { cascade: true });
};
