import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePatrocinadorIdFromProyectos1769500000000 implements MigrationInterface {
  name = 'RemovePatrocinadorIdFromProyectos1769500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='poi' AND table_name='proyectos') as e`);
    if (!exists[0]?.e) return;

    // Eliminar columna patrocinador_id de proyectos
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      DROP COLUMN IF EXISTS patrocinador_id;
    `);

    // Eliminar columna patrocinador_id de subproyectos
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      DROP COLUMN IF EXISTS patrocinador_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar columna patrocinador_id en proyectos
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      ADD COLUMN patrocinador_id INTEGER NULL;
    `);

    // Restaurar columna patrocinador_id en subproyectos
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN patrocinador_id INTEGER NULL;
    `);

    // Nota: Las relaciones de clave foránea no se restauran en el down
    // porque el campo patrocinador_id ya no debería usarse
  }
}
