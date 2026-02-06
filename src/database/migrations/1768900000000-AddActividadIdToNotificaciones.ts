import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActividadIdToNotificaciones1768900000000 implements MigrationInterface {
  name = 'AddActividadIdToNotificaciones1768900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      ADD COLUMN "actividadId" INTEGER NULL
    `);

    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      ADD CONSTRAINT "FK_notificaciones_actividad"
      FOREIGN KEY ("actividadId")
      REFERENCES poi.actividades(id)
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notificaciones_actividad_id
      ON notificaciones.notificaciones ("actividadId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS notificaciones.idx_notificaciones_actividad_id
    `);

    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      DROP CONSTRAINT IF EXISTS "FK_notificaciones_actividad"
    `);

    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      DROP COLUMN IF EXISTS "actividadId"
    `);
  }
}
