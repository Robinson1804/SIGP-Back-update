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
    // MIGRACIÓN DESHABILITADA
    // Esta migración fue reemplazada por UpdateHuEstadoEnum que corrige tanto el ENUM como los datos
    // No hacer nada aquí para evitar errores de validación del ENUM
    console.log('⏭️  Migración FixHuEstadoEnRevision omitida (reemplazada por UpdateHuEstadoEnum)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MIGRACIÓN DESHABILITADA - No hacer nada
    console.log('⏭️  Rollback de FixHuEstadoEnRevision omitido (reemplazada por UpdateHuEstadoEnum)');
  }
}
