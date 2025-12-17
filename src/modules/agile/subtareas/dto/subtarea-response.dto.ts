import { TareaEstado, TareaPrioridad } from '../../tareas/enums/tarea.enum';

export class SubtareaResponseDto {
  id: number;
  tareaId: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  estado: TareaEstado;
  prioridad: TareaPrioridad;
  responsableId: number;
  responsable?: {
    id: number;
    nombre: string;
    email: string;
  };
  horasEstimadas: number;
  horasReales: number;
  evidenciaUrl: string;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}
