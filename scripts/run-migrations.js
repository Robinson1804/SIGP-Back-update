/**
 * Script para ejecutar migraciones en producción
 * Ejecuta las migraciones usando el data source compilado
 */

const path = require('path');

async function runMigrations() {
  try {
    console.log('🔄 Cargando data source...');

    // Importar el data source compilado
    const dataSourcePath = path.join(__dirname, '..', 'dist', 'database', 'data-source.js');
    const { default: AppDataSource } = require(dataSourcePath);

    console.log('🔄 Inicializando conexión a base de datos...');
    await AppDataSource.initialize();

    console.log('🔄 Ejecutando migraciones pendientes...');
    const migrations = await AppDataSource.runMigrations({ transaction: 'all' });

    if (migrations.length === 0) {
      console.log('✅ No hay migraciones pendientes');
    } else {
      console.log(`✅ ${migrations.length} migración(es) ejecutada(s) exitosamente:`);
      migrations.forEach(migration => {
        console.log(`   - ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    console.log('✅ Migraciones completadas');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando migraciones:', error);
    process.exit(1);
  }
}

runMigrations();
