import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Clasificacion } from '../../proyectos/enums/proyecto-estado.enum';

export class CreateSubactividadDto {
  @IsInt()
  actividadPadreId: number;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(Clasificacion)
  clasificacion?: Clasificacion;

  @IsOptional()
  @IsInt()
  accionEstrategicaId?: number;

  @IsOptional()
  @IsInt()
  coordinadorId?: number;

  @IsOptional()
  @IsInt()
  gestorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  coordinacion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasFinancieras?: string[];

  @IsOptional()
  @IsNumber()
  montoAnual?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  anios?: number[];

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
