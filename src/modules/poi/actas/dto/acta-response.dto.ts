import { ActaTipo, ActaEstado, TipoReunion } from '../enums/acta.enum';

export class ActaResponseDto {
  id: number;
  proyectoId: number;
  codigo: string;
  nombre: string;
  tipo: ActaTipo;
  fecha: Date;
  estado: ActaEstado;
  archivoUrl: string | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ActaReunionDetailResponseDto extends ActaResponseDto {
  tipoReunion: TipoReunion;
  fasePerteneciente: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  asistentes: any[] | null;
  ausentes: any[] | null;
  agenda: any[] | null;
  temasDesarrollados: any[] | null;
  acuerdos: any[] | null;
  proximosPasos: any[] | null;
  observaciones: string | null;
  proyecto?: {
    id: number;
    codigo: string;
    nombre: string;
  };
}

export class ActaConstitucionDetailResponseDto extends ActaResponseDto {
  objetivoSmart: string;
  alcance: string;
  fueraDeAlcance: string | null;
  entregables: any[] | null;
  riesgos: any[] | null;
  presupuestoEstimado: number | null;
  proyecto?: {
    id: number;
    codigo: string;
    nombre: string;
  };
}
