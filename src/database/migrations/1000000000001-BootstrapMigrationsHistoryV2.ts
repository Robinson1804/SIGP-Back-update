import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap V2: Registra migraciones nuevas (1769200000000+) como ya ejecutadas
 * si el schema agile no existe localmente (BD local vacía).
 *
 * En Railway las tablas ya existen, por lo que estas migraciones
 * se ejecutan normalmente. En local, se marcan como aplicadas para evitar errores.
 */
export class BootstrapMigrationsHistoryV21000000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si el schema agile ya tiene tablas (Railway) o está vacío (local)
    const schemaExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'agile' AND table_name = 'tareas'
      ) as exists
    `);

    if (schemaExists[0]?.exists) {
      // Railway: el schema existe, las migraciones deben ejecutarse normalmente
      console.log('✅ BootstrapV2: Schema agile existe, omitiendo registro automático.');
      return;
    }

    // Local: el schema no existe, marcar todas las migraciones nuevas como aplicadas
    const migrationsToSkip = [
      { timestamp: 1769200000000, name: 'FixHuEstadoEnRevision1769200000000' },
      { timestamp: 1769300000000, name: 'UpdateHuEstadoEnum1769300000000' },
      { timestamp: 1769400000000, name: 'CreateEvidenciasTareaTable1769400000000' },
      { timestamp: 1769500000000, name: 'RemovePatrocinadorIdFromProyectos1769500000000' },
      { timestamp: 1769600000000, name: 'ChangeSubproyectoAreaUsuariaToSingular1769600000000' },
      { timestamp: 1769700000000, name: 'ChangeProyectoAreaUsuariaToSingular1769700000000' },
      { timestamp: 1769800000000, name: 'CreateSubactividadesAndAddColumnToTareas1769800000000' },
    ];

    for (const migration of migrationsToSkip) {
      await queryRunner.query(`
        INSERT INTO "typeorm_migrations" ("timestamp", "name")
        SELECT ${migration.timestamp}, '${migration.name}'
        WHERE NOT EXISTS (
          SELECT 1 FROM "typeorm_migrations"
          WHERE "name" = '${migration.name}'
        )
      `);
    }

    console.log('✅ BootstrapV2: Migraciones nuevas registradas como aplicadas (schema local vacío).');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "typeorm_migrations"
      WHERE "timestamp" >= 1769200000000 AND "timestamp" <= 1769800000000
    `);
  }
}
