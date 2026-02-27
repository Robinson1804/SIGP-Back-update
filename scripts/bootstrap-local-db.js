/**
 * Script para sincronizar la BD local con Railway.
 * Crea los schemas, registra todas las migraciones como ejecutadas,
 * y luego TypeORM synchronize:true crea las tablas.
 */
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '1234',
  database: 'sigp_inei',
});

const migrations = [
  { timestamp: 1000000000000, name: 'BootstrapMigrationsHistory1000000000000' },
  { timestamp: 1000000000001, name: 'BootstrapMigrationsHistoryV21000000000001' },
  { timestamp: 1734153600000, name: 'CreateSchemas1734153600000' },
  { timestamp: 1734153700000, name: 'CreateFunctionsAndTriggers1734153700000' },
  { timestamp: 1734200000000, name: 'AddUsernameToUsuarios1734200000000' },
  { timestamp: 1734800000000, name: 'AddActasFields1734800000000' },
  { timestamp: 1766400000000, name: 'AddKanbanFeatures1766400000000' },
  { timestamp: 1766500000000, name: 'RestructurePgdHierarchy1766500000000' },
  { timestamp: 1766600000000, name: 'AddProyectoExtendedFields1766600000000' },
  { timestamp: 1766700000000, name: 'RRHHRestructure1766700000000' },
  { timestamp: 1766800000000, name: 'AddDocumentoArchivoFields1766800000000' },
  { timestamp: 1766900000000, name: 'RemoveRequerimientoApprovalFields1766900000000' },
  { timestamp: 1767000000000, name: 'AddCronogramaApprovalFields1767000000000' },
  { timestamp: 1767100000000, name: 'FixNotificacionTimestamps1767100000000' },
  { timestamp: 1767200000000, name: 'AddValidacionesNotificationType1767200000000' },
  { timestamp: 1767300000000, name: 'AddActaApprovalFields1767300000000' },
  { timestamp: 1767400000000, name: 'AddHistoriaUsuarioExtendedFields1767400000000' },
  { timestamp: 1767500000000, name: 'SimplifyCriteriosAceptacion1767500000000' },
  { timestamp: 1767600000000, name: 'ChangePrioridadToAltaMediaBaja1767600000000' },
  { timestamp: 1767700000000, name: 'RemoveNotasFromHistoriaUsuario1767700000000' },
  { timestamp: 1767800000000, name: 'ChangeHuEstadoToSimple1767800000000' },
  { timestamp: 1767900000000, name: 'ChangeSprintEstadoToSimple1767900000000' },
  { timestamp: 1768000000000, name: 'RemoveEvidenciaUrlFromTareas1768000000000' },
  { timestamp: 1768100000000, name: 'RefactorEvidenciasSystem1768100000000' },
  { timestamp: 1768200000000, name: 'ChangeTareaCronogramaEstado1768200000000' },
  { timestamp: 1768300000000, name: 'ChangeResponsableToAsignadoA1768300000000' },
  { timestamp: 1768400000000, name: 'AddGestorIdToActividades1768400000000' },
  { timestamp: 1768500000000, name: 'UpdateProyectosEstadoAutomatico1768500000000' },
  { timestamp: 1768600000000, name: 'AddRequiereCambioPassword1768600000000' },
  { timestamp: 1768700000000, name: 'AddAreaUsuariaToProyectos1768700000000' },
  { timestamp: 1768800000000, name: 'AddActivoToNotificaciones1768800000000' },
  { timestamp: 1768900000000, name: 'AddActividadIdToNotificaciones1768900000000' },
  { timestamp: 1769000000000, name: 'EnhanceSubproyectoSchema1769000000000' },
  { timestamp: 1769100000000, name: 'AddSubproyectoIdToAgileEntities1769100000000' },
  { timestamp: 1769200000000, name: 'FixHuEstadoEnRevision1769200000000' },
  { timestamp: 1769300000000, name: 'UpdateHuEstadoEnum1769300000000' },
  { timestamp: 1769400000000, name: 'CreateEvidenciasTareaTable1769400000000' },
  { timestamp: 1769500000000, name: 'RemovePatrocinadorIdFromProyectos1769500000000' },
  { timestamp: 1769600000000, name: 'ChangeSubproyectoAreaUsuariaToSingular1769600000000' },
  { timestamp: 1769700000000, name: 'ChangeProyectoAreaUsuariaToSingular1769700000000' },
  { timestamp: 1769800000000, name: 'CreateSubactividadesAndAddColumnToTareas1769800000000' },
];

async function run() {
  await client.connect();
  console.log('✅ Conectado a PostgreSQL local');

  // Crear schemas
  const schemas = ['planning', 'poi', 'agile', 'rrhh'];
  for (const schema of schemas) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    console.log(`✅ Schema "${schema}" listo`);
  }

  // Crear tabla typeorm_migrations
  await client.query(`
    CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id" SERIAL PRIMARY KEY,
      "timestamp" BIGINT NOT NULL,
      "name" VARCHAR NOT NULL
    )
  `);
  console.log('✅ Tabla typeorm_migrations lista');

  // Limpiar registros previos (por si hubo inserciones parciales)
  await client.query(`DELETE FROM typeorm_migrations`);

  // Insertar todas las migraciones como ejecutadas
  for (const m of migrations) {
    await client.query(
      `INSERT INTO typeorm_migrations (timestamp, name) VALUES ($1, $2)`,
      [m.timestamp, m.name]
    );
  }
  console.log(`✅ ${migrations.length} migraciones registradas como ejecutadas`);

  await client.end();
  console.log('\n🎉 Listo. Ahora reinicia el backend con DATABASE_SYNCHRONIZE=true para crear las tablas.');
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  client.end();
  process.exit(1);
});
