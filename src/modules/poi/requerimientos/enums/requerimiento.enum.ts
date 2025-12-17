export enum RequerimientoEstado {
  PENDIENTE = 'Pendiente',
  EN_ANALISIS = 'En Analisis',
  APROBADO = 'Aprobado',
  RECHAZADO = 'Rechazado',
  EN_DESARROLLO = 'En Desarrollo',
  COMPLETADO = 'Completado',
}

export enum RequerimientoPrioridad {
  BAJA = 'Baja',
  MEDIA = 'Media',
  ALTA = 'Alta',
  CRITICA = 'Critica',
}

export enum RequerimientoTipo {
  FUNCIONAL = 'Funcional',
  NO_FUNCIONAL = 'No Funcional',
  TECNICO = 'Tecnico',
  NEGOCIO = 'Negocio',
}
