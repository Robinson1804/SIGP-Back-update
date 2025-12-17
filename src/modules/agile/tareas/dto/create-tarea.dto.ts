import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsDateString,
  IsNumber,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TareaTipo, TareaPrioridad } from '../enums/tarea.enum';

export class CreateTareaDto {
  @IsEnum(TareaTipo)
  tipo: TareaTipo;

  @ValidateIf((o) => o.tipo === TareaTipo.SCRUM)
  @IsInt()
  historiaUsuarioId?: number;

  @ValidateIf((o) => o.tipo === TareaTipo.KANBAN)
  @IsInt()
  actividadId?: number;

  @IsString()
  @MaxLength(20)
  codigo: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(TareaPrioridad)
  prioridad?: TareaPrioridad;

  @IsOptional()
  @IsInt()
  asignadoA?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  horasEstimadas?: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
