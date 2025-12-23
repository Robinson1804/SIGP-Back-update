export enum CronogramaEstado {
  BORRADOR = 'Borrador',
  VIGENTE = 'Vigente',
  DESACTUALIZADO = 'Desactualizado',
}

export enum TareaEstado {
  PENDIENTE = 'Pendiente',
  EN_PROGRESO = 'En Progreso',
  COMPLETADA = 'Completada',
  BLOQUEADA = 'Bloqueada',
  CANCELADA = 'Cancelada',
}

export enum TareaPrioridad {
  BAJA = 'Baja',
  MEDIA = 'Media',
  ALTA = 'Alta',
}

/**
 * Fases del ciclo de vida del proyecto para cronograma
 */
export enum FaseCronograma {
  ANALISIS = 'Analisis',
  DISENO = 'Diseno',
  DESARROLLO = 'Desarrollo',
  PRUEBAS = 'Pruebas',
  IMPLEMENTACION = 'Implementacion',
  MANTENIMIENTO = 'Mantenimiento',
}

/**
 * Tipos de dependencia entre tareas del cronograma
 * FS: Finish-to-Start (la tarea B comienza cuando A termina)
 * FF: Finish-to-Finish (B termina cuando A termina)
 * SS: Start-to-Start (B comienza cuando A comienza)
 * SF: Start-to-Finish (B termina cuando A comienza)
 */
export enum TipoDependencia {
  FS = 'FS',
  FF = 'FF',
  SS = 'SS',
  SF = 'SF',
}
