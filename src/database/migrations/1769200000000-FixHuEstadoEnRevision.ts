import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para corregir el estado 'En revision' a 'En revisión' (con acento)
 * en la tabla agile.historias_usuario
 *
 * IMPORTANTE: Esta migración corrige una inconsistencia donde el enum HuEstado
 * usaba 'En revision' (sin acento) mientras que TareaEstado usaba 'En revisión' (con acento).
 * La forma correcta según la RAE es 'En revisión'.
 */
export class FixHuEstadoEnRevision1769200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Actualizar registros existentes de 'En revision' a 'En revisión'
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revisión'
      WHERE estado = 'En revision';
    `);

    console.log('✅ Estados de Historia de Usuario actualizados: "En revision" → "En revisión"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: cambiar de vuelta a 'En revision' (sin acento)
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revision'
      WHERE estado = 'En revisión';
    `);

    console.log('⏪ Revertido: Estados de Historia de Usuario actualizados: "En revisión" → "En revision"');
  }
}
