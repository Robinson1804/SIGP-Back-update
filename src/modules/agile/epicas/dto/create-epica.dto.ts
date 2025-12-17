import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';
import { EpicaPrioridad } from '../enums/epica.enum';

export class CreateEpicaDto {
  @IsInt()
  proyectoId: number;

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
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color debe ser un hex válido (ej: #6366F1)' })
  color?: string;

  @IsOptional()
  @IsEnum(EpicaPrioridad)
  prioridad?: EpicaPrioridad;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
