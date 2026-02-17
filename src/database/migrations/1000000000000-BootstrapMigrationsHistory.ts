import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración Bootstrap: Registra migraciones antiguas como ya ejecutadas
 *
 * La BD de Railway ya tiene todos los cambios aplicados via synchronize:true.
 * Esta migración registra las migraciones pre-existentes en typeorm_migrations
 * para que TypeORM no intente ejecutarlas de nuevo.
 */
export class BootstrapMigrationsHistory1000000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear la tabla de migraciones si no existe
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
        "id" SERIAL PRIMARY KEY,
        "timestamp" BIGINT NOT NULL,
        "name" VARCHAR NOT NULL
      )
    `);

    // Lista de migraciones ya aplicadas en la BD de Railway via synchronize
    const migrationsAlreadyApplied = [
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
    ];

    for (const migration of migrationsAlreadyApplied) {
      await queryRunner.query(`
        INSERT INTO "typeorm_migrations" ("timestamp", "name")
        SELECT ${migration.timestamp}, '${migration.name}'
        WHERE NOT EXISTS (
          SELECT 1 FROM "typeorm_migrations"
          WHERE "name" = '${migration.name}'
        )
      `);
    }

    console.log('✅ Bootstrap: Migraciones antiguas registradas en typeorm_migrations');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "typeorm_migrations"
      WHERE "timestamp" < 1769200000000
    `);
  }
}
