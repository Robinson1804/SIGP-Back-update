export enum HuPrioridad {
  MUST = 'Must',
  SHOULD = 'Should',
  COULD = 'Could',
  WONT = 'Wont',
}

export enum HuEstimacion {
  XS = 'XS',
  S = 'S',
  M = 'M',
  L = 'L',
  XL = 'XL',
  XXL = 'XXL',
}

export enum HuEstado {
  PENDIENTE = 'Pendiente',
  EN_ANALISIS = 'En analisis',
  LISTA = 'Lista',
  EN_DESARROLLO = 'En desarrollo',
  EN_PRUEBAS = 'En pruebas',
  EN_REVISION = 'En revision',
  TERMINADA = 'Terminada',
}

export enum CriterioEstado {
  PENDIENTE = 'Pendiente',
  CUMPLIDO = 'Cumplido',
  FALLIDO = 'Fallido',
}

export enum TipoDependencia {
  BLOQUEADA_POR = 'Bloqueada por',
  RELACIONADA_CON = 'Relacionada con',
}
