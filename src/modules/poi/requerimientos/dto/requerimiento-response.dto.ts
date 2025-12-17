import { RequerimientoEstado, RequerimientoPrioridad, RequerimientoTipo } from '../enums/requerimiento.enum';

export class RequerimientoResponseDto {
  id: number;
  proyectoId: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: RequerimientoTipo;
  prioridad: RequerimientoPrioridad;
  estado: RequerimientoEstado;
  criteriosAceptacion: { descripcion: string; cumplido?: boolean }[] | null;
  dependencias: number[] | null;
  solicitanteId: number | null;
  fechaSolicitud: Date | null;
  fechaAprobacion: Date | null;
  aprobadoPor: number | null;
  observaciones: string | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class RequerimientoDetailResponseDto extends RequerimientoResponseDto {
  proyecto?: {
    id: number;
    codigo: string;
    nombre: string;
  };
  solicitante?: {
    id: number;
    nombres: string;
    apellidoPaterno: string;
  };
  aprobador?: {
    id: number;
    nombres: string;
    apellidoPaterno: string;
  };
}
