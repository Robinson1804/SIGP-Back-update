import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivoToNotificaciones1768800000000 implements MigrationInterface {
  name = 'AddActivoToNotificaciones1768800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      ADD COLUMN activo BOOLEAN NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notificaciones_activo
      ON notificaciones.notificaciones (activo)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS notificaciones.idx_notificaciones_activo
    `);

    await queryRunner.query(`
      ALTER TABLE notificaciones.notificaciones
      DROP COLUMN IF EXISTS activo
    `);
  }
}
