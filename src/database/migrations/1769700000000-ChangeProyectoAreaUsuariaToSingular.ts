import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeProyectoAreaUsuariaToSingular1769700000000 implements MigrationInterface {
  name = 'ChangeProyectoAreaUsuariaToSingular1769700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='poi' AND table_name='proyectos') as e`);
    if (!exists[0]?.e) return;

    // Cambiar columna area_usuaria de INTEGER[] a INTEGER en proyectos
    // El área usuaria es un solo patrocinador, no múltiple
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      ALTER COLUMN area_usuaria TYPE INTEGER USING
        CASE
          WHEN area_usuaria IS NULL THEN NULL
          WHEN array_length(area_usuaria, 1) > 0 THEN area_usuaria[1]
          ELSE NULL
        END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar columna area_usuaria a INTEGER[] en proyectos
    await queryRunner.query(`
      ALTER TABLE poi.proyectos
      ALTER COLUMN area_usuaria TYPE INTEGER[] USING
        CASE
          WHEN area_usuaria IS NULL THEN NULL
          ELSE ARRAY[area_usuaria]
        END;
    `);
  }
}
