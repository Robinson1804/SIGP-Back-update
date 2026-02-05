import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAreaUsuariaToProyectos1768700000000 implements MigrationInterface {
  name = 'AddAreaUsuariaToProyectos1768700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      ADD COLUMN IF NOT EXISTS area_usuaria INTEGER[] NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      DROP COLUMN IF EXISTS area_usuaria;
    `);
  }
}
