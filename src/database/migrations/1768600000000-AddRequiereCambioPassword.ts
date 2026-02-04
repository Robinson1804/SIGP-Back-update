import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequiereCambioPassword1768600000000 implements MigrationInterface {
  name = 'AddRequiereCambioPassword1768600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.usuarios
      ADD COLUMN IF NOT EXISTS requiere_cambio_password BOOLEAN NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.usuarios
      DROP COLUMN IF EXISTS requiere_cambio_password;
    `);
  }
}
